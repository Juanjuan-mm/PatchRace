import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const confirmed = args.includes("--confirm-paid-run");
const authorizationPath = option("--authorization");
const preparedPath = option("--prepared");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(
  confirmed,
  "Live execution requires the exact --confirm-paid-run acknowledgement.",
);
assert(
  authorizationPath !== undefined && preparedPath !== undefined,
  "Provide --authorization and --prepared JSON files.",
);
const authorization = JSON.parse(
  readFileSync(resolve(authorizationPath), "utf8"),
);
const prepared = JSON.parse(readFileSync(resolve(preparedPath), "utf8"));
assert(
  authorization.schemaVersion === "1.0.0" &&
    authorization.approved === true &&
    authorization.taskProfile === "patchrace-node26-v1",
  "Authorization does not approve the prepared live profile.",
);
assert(
  Date.parse(authorization.expiresAt) > Date.now(),
  "Live authorization is expired.",
);
assert(
  prepared.profile === authorization.taskProfile && prepared.status === "READY",
  "Prepared workspace does not match the authorization.",
);
assert(
  Number.isInteger(authorization.repeat) &&
    authorization.repeat >= 1 &&
    authorization.repeat <= 3 &&
    Number.isInteger(authorization.concurrency) &&
    authorization.concurrency >= 1 &&
    authorization.concurrency <= 3,
  "Live repeat/concurrency must be explicit and bounded from 1 to 3.",
);
assert(
  Number.isFinite(authorization.maxWallSeconds) &&
    authorization.maxWallSeconds > 0 &&
    Number.isFinite(authorization.maxTokens) &&
    authorization.maxTokens > 0 &&
    Number.isFinite(authorization.maxCostUsd) &&
    authorization.maxCostUsd > 0,
  "Live wall, token, and monetary authorization ceilings are required.",
);
assert(
  authorization.tokenBudgetMode === "post-trial-admission",
  "Acknowledge that token usage is enforced between trials, not streamed as a provider hard cap.",
);
assert(
  authorization.providerCostCeilingConfirmed === true,
  "Confirm a provider-side aggregate cost ceiling because not every supported stream exposes enforceable cost.",
);
const variants = authorization.variants;
assert(
  Array.isArray(variants) && variants.length === 3,
  "Authorize 3 variants.",
);
assert(
  new Set(variants.map(({ adapter }) => adapter)).size === 3 &&
    ["pi", "claude-code", "codex"].every((adapter) =>
      variants.some((variant) => variant.adapter === adapter),
    ),
  "Authorize exactly one Pi, Claude Code, and Codex variant.",
);
for (const variant of variants)
  assert(
    typeof variant.id === "string" &&
      /^[a-z][a-z0-9-]{0,63}$/u.test(variant.id) &&
      typeof variant.provider === "string" &&
      typeof variant.model === "string" &&
      typeof variant.executable === "string" &&
      variant.id.length > 0 &&
      variant.provider.length > 0 &&
      variant.model.length > 0 &&
      variant.executable.length > 0,
    "Every live variant requires a schema-valid ID, provider, model, and executable.",
  );

const project = resolve(prepared.project);
const liveRoot = resolve(project, ".patchrace", "live");
const taskPath = resolve(liveRoot, "task.json");
const task = JSON.parse(readFileSync(taskPath, "utf8"));
task.budgets.maxTokens = Math.floor(
  authorization.maxTokens /
    (authorization.repeat * authorization.variants.length),
);
task.budgets.maxCostUsd =
  authorization.maxCostUsd /
  (authorization.repeat * authorization.variants.length);
writeFileSync(taskPath, `${JSON.stringify(task, null, 2)}\n`);

const environmentNames = [
  ...new Set(authorization.environmentNames ?? []),
].sort();
assert(
  environmentNames.every((name) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)),
  "Authorization contains an invalid environment name.",
);
const adapters = {};
const configuredVariants = {};
for (const variant of variants) {
  adapters[variant.id] = {
    kind: variant.adapter,
    executable: variant.executable,
    ...(Array.isArray(variant.executableArgs)
      ? { args: variant.executableArgs }
      : {}),
  };
  configuredVariants[variant.id] = {
    adapter: variant.id,
    model: variant.model,
    harness: { sandbox: "workspace-write" },
    workflow: {},
    metadata: { provider: variant.provider },
  };
}
const config = {
  schemaVersion: "1.0.0",
  project: { root: "../..", trustRepositoryCommands: true },
  state: {
    directory: ".patchrace-state",
    retention: { rawRuns: "manual", cacheDays: 30 },
  },
  defaults: {
    concurrency: authorization.concurrency,
    repeat: authorization.repeat,
    budgets: {
      wallSeconds: authorization.maxWallSeconds,
      trialSeconds: task.budgets.trialSeconds,
      maxTrials: variants.length * authorization.repeat,
      maxTokens: authorization.maxTokens,
      // Codex does not expose cost in the supported stream. The operator's
      // provider ceiling remains explicit in authorization, but PatchRace
      // must not claim it can enforce an unavailable aggregate signal.
      maxCostUsd: null,
      diskMiB: 8192,
    },
    environment: {
      inherit: ["PATH", "LANG", "LC_ALL", "TERM"],
      pass: environmentNames,
      redact: environmentNames,
    },
  },
  adapters,
  variants: configuredVariants,
  suites: {
    "live-parity": {
      tasks: ["patchrace-node26-support"],
      split: "validation",
      metadata: { profile: authorization.taskProfile },
    },
  },
  tasks: {
    "patchrace-node26-support": { file: "task.json" },
  },
  objectives: {
    policy: "correctness-first-v1",
    afterHardGates: ["stability", "cost", "latency", "footprint"],
  },
  report: {
    formats: ["json", "html"],
    includeRawCode: "local-only",
    redactionProfile: "default",
  },
  metadata: {
    authorization: {
      approvedAt: authorization.approvedAt,
      expiresAt: authorization.expiresAt,
      maxCostUsd: authorization.maxCostUsd,
    },
  },
};
const configPath = resolve(liveRoot, "suite.json");
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

const childEnvironment = Object.fromEntries(
  ["PATH", "LANG", "LC_ALL", "TERM", ...environmentNames]
    .map((name) => [name, process.env[name]])
    .filter(([, value]) => value !== undefined),
);
const cli = resolve(root, "packages", "cli", "dist", "main.js");
const invoke = (commandArgs) => {
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "--project",
      project,
      "--config",
      configPath,
      "--json",
      ...commandArgs,
    ],
    {
      cwd: project,
      encoding: "utf8",
      env: childEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    let code = "UNKNOWN";
    try {
      const failure = JSON.parse(result.stdout);
      if (typeof failure?.error?.code === "string") code = failure.error.code;
    } catch {
      // Keep diagnostics bounded to a stable non-sensitive error code.
    }
    throw new Error(
      `Live PatchRace command failed (${result.status}, ${code}).`,
    );
  }
  return JSON.parse(result.stdout);
};

for (const variant of variants) {
  const doctor = invoke(["doctor", "--adapter", variant.id]);
  assert(
    doctor.status === "completed" && doctor.data?.overall !== "fail",
    `Doctor failed for ${variant.id}.`,
  );
}
const raced = invoke([
  "race",
  "--suite",
  "live-parity",
  "--variants",
  variants.map(({ id }) => id).join(","),
  "--repeat",
  String(authorization.repeat),
]);
assert(raced.status === "completed", "Live race did not complete.");
const report = raced.data?.report;
assert(
  typeof raced.data?.runId === "string" && Array.isArray(report?.trials),
  "Live race omitted its durable report identity.",
);
const expectedTrials = variants.length * authorization.repeat;
assert(
  raced.data?.executionStatus === "completed" &&
    report.source?.executionStatus === "completed" &&
    report.trials.length === expectedTrials,
  "Live race did not complete every authorized trial.",
);
assert(
  report.trials.every(
    (trial) =>
      trial.outcome === "passed" &&
      trial.integrity === "valid" &&
      trial.hardGates.every(({ status }) => status === "passed"),
  ),
  "At least one live trial failed a deterministic gate.",
);
const observedTokens = report.trials.map(
  (trial) => trial.metrics?.tokens?.value,
);
assert(
  observedTokens.every((value) => Number.isFinite(value) && value >= 0) &&
    observedTokens.reduce((sum, value) => sum + value, 0) <=
      authorization.maxTokens,
  "Live token usage is unavailable or exceeded authorization.",
);
const observedCosts = report.trials
  .map((trial) => trial.metrics?.costUsd?.value)
  .filter((value) => Number.isFinite(value));
assert(
  observedCosts.reduce((sum, value) => sum + value, 0) <=
    authorization.maxCostUsd,
  "Observed live cost exceeded authorization.",
);
const cleanupPreview = invoke([
  "clean",
  "--run",
  raced.data.runId,
  "--worktrees",
]);
assert(
  cleanupPreview.status === "dry-run",
  "Cleanup preview did not complete.",
);

const evidence = {
  schemaVersion: "1.0.0",
  status: "PASS",
  profile: authorization.taskProfile,
  baselineTag: prepared.baselineTag,
  baselineCommit: prepared.baselineCommit,
  runId: raced.data.runId,
  approvedAt: authorization.approvedAt,
  variants: report.source.variants.map((variant) => ({
    variantId: variant.variantId,
    adapter: variant.adapter.kind,
    adapterVersion: variant.adapter.version,
    provider:
      authorization.variants.find(({ id }) => id === variant.variantId)
        ?.provider ?? null,
    model: variant.model,
  })),
  trials: report.trials.map((trial) => ({
    trialId: trial.trialId,
    variantId: trial.variantId,
    outcome: trial.outcome,
    integrity: trial.integrity,
    hardGatesPassed: trial.hardGates.every(({ status }) => status === "passed"),
    tokens: trial.metrics.tokens,
    costUsd: trial.metrics.costUsd,
    durationMs: trial.metrics.durationMs,
    footprintLines: trial.metrics.footprintLines,
  })),
  authorization: {
    maxWallSeconds: authorization.maxWallSeconds,
    maxTokens: authorization.maxTokens,
    maxCostUsd: authorization.maxCostUsd,
    tokenBudgetMode: authorization.tokenBudgetMode,
    providerCostCeilingConfirmed: authorization.providerCostCeilingConfirmed,
  },
  cleanupPreview: {
    status: cleanupPreview.status,
    targetCount: cleanupPreview.data?.targets?.length ?? 0,
  },
  rawEvidence: "retained-local-sensitive",
  publicUpload: false,
};
const evidencePath = resolve(prepared.workspace, "live-e2e-evidence.json");
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({ status: "PASS", evidence: evidencePath }, null, 2)}\n`,
);
