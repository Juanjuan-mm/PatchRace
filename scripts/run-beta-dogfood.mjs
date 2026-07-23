import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  generateAgentsGuidanceCandidate,
  createDecisionPolicy,
  createObjectiveVector,
  selectParetoCandidates,
} from "../packages/optimizer/dist/index.js";
import { canonicalHash, sha256 } from "../packages/contracts/dist/index.js";

const root = resolve(import.meta.dirname, "..");
const cliEntry = join(root, "packages", "cli", "dist", "main.js");
const outputRoot = join(root, ".artifacts", "dogfood");
const reportsRoot = join(outputRoot, "reports");
const temporaryRoot = await mkdtemp(join(tmpdir(), "patchrace-dogfood-"));
const projectRoot = join(temporaryRoot, "project");
const stateRoot = join(projectRoot, ".patchrace");
const taskIds = Array.from(
  { length: 10 },
  (_, index) => `dogfood-${String(index + 1).padStart(2, "0")}`,
);
const fixedGitEnvironment = {
  ...process.env,
  GIT_AUTHOR_DATE: "2026-07-23T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-07-23T00:00:00Z",
};

function hash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd ?? projectRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
  });
  if (
    result.status === null ||
    !(options.allowed ?? [0]).includes(result.status)
  )
    throw new Error(
      `${executable} ${args.join(" ")} failed (${String(result.status)}): ${result.stderr || result.stdout}`,
    );
  return result;
}

function cliJson(args, allowed = [0, 1]) {
  const result = run(
    process.execPath,
    [cliEntry, "--project", projectRoot, "--json", ...args],
    { allowed },
  );
  if (result.stderr !== "")
    throw new Error(`Machine command emitted stderr: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function fixtureAgent(kind, makeFix) {
  const version =
    kind === "pi"
      ? "0.81.1"
      : kind === "claude-code"
        ? "2.1.218 (Claude Code)"
        : "codex-cli 0.145.0";
  const auth = kind === "claude-code" ? "auth" : "login";
  const events =
    kind === "pi"
      ? `emit({ type: "agent_start" }); emit({ type: "agent_end" });`
      : kind === "claude-code"
        ? `emit({ type: "system", subtype: "init", session_id: "dogfood", model: "fixture" }); emit({ type: "result", subtype: "success", is_error: false, result: "fixture", duration_ms: 1, num_turns: 1 });`
        : `emit({ type: "thread.started", thread_id: "dogfood" }); emit({ type: "turn.started" }); emit({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } });`;
  return `#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
if (args.includes("--version")) {
  process.stdout.write(${JSON.stringify(`${version}\n`)});
  process.exit(0);
}
if (args[0] === ${JSON.stringify(auth)}) {
  process.stdout.write(${JSON.stringify(
    kind === "claude-code"
      ? '{"loggedIn":true,"authMethod":"fixture"}\n'
      : "Logged in using Fixture\n",
  )});
  process.exit(0);
}
const instruction = args.join(" ");
const match = instruction.match(/TASK_ID=(dogfood-[0-9]{2})/);
if (!match) {
  process.stderr.write("missing task id\\n");
  process.exit(2);
}
${makeFix ? 'await writeFile(`tasks/${match[1]}.txt`, "fixed\\n");' : ""}
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
${events}
`;
}

async function prepareProject() {
  await mkdir(join(projectRoot, "tasks"), { recursive: true });
  await writeFile(join(projectRoot, ".gitignore"), ".patchrace/\n");
  await writeFile(join(projectRoot, "sentinel.txt"), "preserve\n");
  await writeFile(
    join(projectRoot, "verifier.mjs"),
    `import { readFile } from "node:fs/promises";
const taskId = process.argv[2];
if (await readFile(\`tasks/\${taskId}.txt\`, "utf8") !== "fixed\\n") process.exit(1);
`,
  );
  for (const taskId of taskIds)
    await writeFile(join(projectRoot, "tasks", `${taskId}.txt`), "broken\n");
  const agents = {
    pi: join(projectRoot, "fixture-pi.mjs"),
    "claude-code": join(projectRoot, "fixture-claude.mjs"),
    codex: join(projectRoot, "fixture-codex.mjs"),
    failure: join(projectRoot, "fixture-failure.mjs"),
  };
  await Promise.all([
    writeFile(agents.pi, fixtureAgent("pi", true)),
    writeFile(agents["claude-code"], fixtureAgent("claude-code", true)),
    writeFile(agents.codex, fixtureAgent("codex", true)),
    writeFile(agents.failure, fixtureAgent("pi", false)),
  ]);
  await Promise.all(Object.values(agents).map((path) => chmod(path, 0o755)));
  run("git", ["init", "-q", "-b", "main"]);
  run("git", ["config", "user.name", "PatchRace Dogfood"]);
  run("git", ["config", "user.email", "dogfood@example.invalid"]);
  run("git", ["add", "."]);
  run("git", ["commit", "-qm", "dogfood baseline"], {
    env: fixedGitEnvironment,
  });
  const commit = run("git", ["rev-parse", "HEAD"]).stdout.trim();

  await mkdir(stateRoot, { recursive: true });
  const tasks = {};
  const suites = {};
  for (const taskId of taskIds) {
    const taskRoot = join(stateRoot, taskId);
    await mkdir(taskRoot, { recursive: true });
    const instruction = `TASK_ID=${taskId}\nChange only tasks/${taskId}.txt from broken to fixed and verify it.\n`;
    await writeFile(join(taskRoot, "instruction.md"), instruction);
    await writeFile(
      join(taskRoot, "task.json"),
      `${JSON.stringify({
        schemaVersion: "1.0.0",
        id: taskId,
        revision: 1,
        baseline: {
          repository: ".",
          commit,
          submodules: "disabled",
          lfs: "disabled",
        },
        instruction: {
          file: "instruction.md",
          hash: hash(instruction),
        },
        setup: { commands: [], assets: [] },
        verifier: {
          visibility: "public",
          assets: [],
          commands: [
            {
              id: "tests",
              kind: "test",
              argv: ["node", "verifier.mjs", taskId],
              timeoutSeconds: 10,
              expectedExitCodes: [0],
              network: "forbidden",
            },
          ],
        },
        assertions: [
          { id: "tests", kind: "command", commandId: "tests" },
          {
            id: "scope",
            kind: "diff-limit",
            maxChangedFiles: 1,
            maxLines: 2,
            allowDependencyChanges: false,
            allowLockfileChanges: false,
          },
          {
            id: "protected",
            kind: "forbidden-paths",
            paths: [".github/**", ".patchrace/**"],
          },
        ],
        budgets: {
          trialSeconds: 20,
          maxTokens: null,
          maxCostUsd: null,
          maxOutputBytes: 1024 * 1024,
          maxPatchLines: 2,
          maxChangedFiles: 1,
          diskMiB: 32,
        },
        provenance: {
          source: "manual",
          sourceCommit: commit,
          referencePatchHash: hash(`${taskId}\0fixed\n`),
          createdAt: "2026-07-23T00:00:00.000Z",
          reviewedBy: "patchrace-beta-01",
        },
        metadata: {
          ecosystem: ["typescript", "python", "posix-shell"][
            taskIds.indexOf(taskId) % 3
          ],
          category: "dogfood",
          split: "validation",
        },
      })}\n`,
    );
    tasks[taskId] = { file: `${taskId}/task.json` };
    suites[taskId] = { tasks: [taskId], split: "validation" };
  }
  await writeFile(
    join(stateRoot, "suite.json"),
    `${JSON.stringify({
      schemaVersion: "1.0.0",
      project: { root: "..", trustRepositoryCommands: true },
      state: {
        directory: ".patchrace",
        retention: { rawRuns: "manual", cacheDays: 30 },
      },
      defaults: {
        concurrency: 1,
        repeat: 1,
        budgets: {
          wallSeconds: 30,
          trialSeconds: 20,
          maxTrials: 4,
          maxTokens: null,
          maxCostUsd: null,
          diskMiB: 64,
        },
        environment: {
          inherit: ["PATH", "LANG", "LC_ALL", "TMPDIR"],
          pass: [],
          redact: [],
        },
      },
      adapters: {
        pi: { kind: "pi", executable: agents.pi },
        claude: {
          kind: "claude-code",
          executable: agents["claude-code"],
        },
        codex: { kind: "codex", executable: agents.codex },
        failure: { kind: "pi", executable: agents.failure },
      },
      variants: {
        "pi-fixture": {
          adapter: "pi",
          model: "deterministic-fixture",
          harness: { protocol: "pi-json" },
          workflow: {},
        },
        "claude-fixture": {
          adapter: "claude",
          model: "deterministic-fixture",
          harness: { protocol: "claude-stream-json" },
          workflow: {},
        },
        "codex-fixture": {
          adapter: "codex",
          model: "deterministic-fixture",
          harness: { protocol: "codex-jsonl" },
          workflow: {},
        },
        "expected-agent-failure": {
          adapter: "failure",
          model: "deterministic-fixture",
          harness: { protocol: "pi-json-no-change" },
          workflow: {},
        },
      },
      suites,
      tasks,
      objectives: {
        policy: "correctness-first-v1",
        afterHardGates: ["stability", "latency", "footprint"],
      },
      report: {
        formats: ["json", "html"],
        includeRawCode: "local-only",
        redactionProfile: "default",
      },
      metadata: {
        dogfood: "BETA-01",
        evidence: "deterministic-local",
      },
    })}\n`,
  );
}

async function executeAndRecord(sequence, taskId, variantId, expectedOutcome) {
  const result = cliJson([
    "--config",
    ".patchrace/suite.json",
    "race",
    "--suite",
    taskId,
    "--variants",
    variantId,
  ]);
  const report = result.data?.report;
  const runId = result.data?.runId;
  assert.equal(typeof runId, "string");
  assert.equal(report?.trials?.length, 1);
  assert.equal(report.trials[0].outcome, expectedOutcome);
  assert.equal(report.trials[0].integrity, "valid");
  const reportBytes = Buffer.from(JSON.stringify(report));
  await writeFile(
    join(reportsRoot, `${String(sequence).padStart(3, "0")}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  const preview = cliJson(["clean", "--run", runId, "--artifacts"]);
  assert.equal(preview.status, "dry-run");
  assert.equal(preview.sideEffects.length, 0);
  const cleaned = cliJson([
    "clean",
    "--run",
    runId,
    "--artifacts",
    "--confirm",
  ]);
  assert.equal(cleaned.status, "completed");
  assert.equal(cleaned.sideEffects.length, 1);
  await assert.rejects(access(join(stateRoot, "runs", runId)));
  return {
    recordId: `dogfood-${String(sequence).padStart(3, "0")}`,
    taskId,
    adapter:
      variantId === "pi-fixture"
        ? "pi"
        : variantId === "claude-fixture"
          ? "claude-code"
          : variantId === "codex-fixture"
            ? "codex"
            : "pi",
    variantId,
    outcome: expectedOutcome,
    classification: expectedOutcome === "passed" ? "success" : "agent_failure",
    readableTerminalArtifact: true,
    cleanupPreviewed: true,
    cleanupConfirmed: true,
    orphanedWorktrees: 0,
    unrelatedStatePreserved: true,
    reportHash: hash(reportBytes),
  };
}

const objectiveUnits = {
  successRate: "ratio",
  stabilityVariance: "ratio2",
  costUsd: "usd",
  latencyMs: "ms",
  footprintLines: "lines",
  contextTokens: "estimated-tokens",
  configComplexity: "points",
};

function objectiveMetric(dimension, value, cycle) {
  return {
    availability: "derived",
    value,
    unit: objectiveUnits[dimension],
    sampleCount: 5,
    taskIds: Array.from({ length: 5 }, (_, index) => `validation-${index + 1}`),
    repetitions: 1,
    variance: 0,
    interval: null,
    sourceArtifactHashes: [sha256(`${cycle}\0${dimension}\0${value}`)],
  };
}

function objectiveVector(candidateId, cycle, values, hardGates = true) {
  return createObjectiveVector({
    candidateId,
    phase: "validation",
    hardGates: {
      integrity: hardGates,
      correctness: hardGates,
      safety: hardGates,
      protectedPaths: hardGates,
    },
    metrics: {
      successRate: objectiveMetric(
        "successRate",
        values.successRate ?? 0.5,
        cycle,
      ),
      stabilityVariance: objectiveMetric(
        "stabilityVariance",
        values.stabilityVariance ?? 0.1,
        cycle,
      ),
      costUsd: objectiveMetric("costUsd", values.costUsd ?? 1, cycle),
      latencyMs: objectiveMetric("latencyMs", values.latencyMs ?? 100, cycle),
      footprintLines: objectiveMetric(
        "footprintLines",
        values.footprintLines ?? 10,
        cycle,
      ),
      contextTokens: objectiveMetric(
        "contextTokens",
        values.contextTokens ?? 100,
        cycle,
      ),
      configComplexity: objectiveMetric(
        "configComplexity",
        values.configComplexity ?? 5,
        cycle,
      ),
    },
  });
}

function teachingCycles() {
  const policy = createDecisionPolicy({
    requiredDimensions: [
      "successRate",
      "stabilityVariance",
      "latencyMs",
      "footprintLines",
      "contextTokens",
      "configComplexity",
    ],
    minimumSuccessRateImprovement: 0.1,
    maximumRegression: {
      latencyMs: 20,
      footprintLines: 5,
      contextTokens: 50,
      configComplexity: 5,
    },
    evidenceTier: "validation",
  });
  const cases = [
    { id: "cycle-1", values: { successRate: 0.8 }, hardGates: true },
    { id: "cycle-2", values: { successRate: 0.9 }, hardGates: true },
    { id: "cycle-3", values: { successRate: 1 }, hardGates: false },
    { id: "cycle-4", values: { successRate: 0.55 }, hardGates: true },
    {
      id: "cycle-5",
      values: { successRate: 0.8, configComplexity: 20 },
      hardGates: true,
    },
  ];
  return cases.map((cycle) => {
    const citation = {
      runId: `run_${cycle.id}`,
      trialId: `trial_${cycle.id}`,
      artifactHash: sha256(`diagnosis\0${cycle.id}`),
      logicalPath: `training/${cycle.id}/grade.json`,
      gradeGateIds: ["constraint:package-manager"],
    };
    const finding = {
      schemaVersion: "1.0.0",
      id: `finding-${cycle.id}`,
      category: "context",
      confidence: "high",
      claim: "The deterministic package-manager constraint failed.",
      evidence: [citation],
      alternatives: [{ claim: "The task could be invalid.", evidence: [] }],
      eligibleMutationTargets: ["agents-guidance"],
      limitations: ["deterministic_dogfood"],
      origin: "deterministic-rule",
      ruleId: "explicit-constraint-gate-failure-v1",
    };
    const route = {
      schemaVersion: "1.0.0",
      routeSchemaVersion: "1.0.0",
      id: `route-${cycle.id}`,
      disposition: "candidate",
      mutationType: "agents-guidance",
      recommendationKind: null,
      sourceFindingIds: [finding.id],
      evidence: [citation],
      rationale: ["stable_project_constraint"],
      invokedWorkflow: null,
      limitations: ["deterministic_dogfood"],
    };
    const generated = generateAgentsGuidanceCandidate({
      baselineId: `baseline-${cycle.id}`,
      createdAt: "2026-07-23T00:00:00.000Z",
      route,
      finding,
      visibleSplitHash: canonicalHash({ cycle: cycle.id, split: "visible" }),
      configHash: canonicalHash({ cycle: cycle.id, config: true }),
      currentContent: "# Project guidance\n",
      change: {
        kind: "add-stable-fact",
        fact: `Use pnpm for package commands (${cycle.id}).`,
      },
      maxAddedLines: 10,
      maxContextTokens: 100,
    });
    const baseline = objectiveVector(`baseline-vector-${cycle.id}`, cycle.id, {
      successRate: 0.5,
    });
    const candidate = objectiveVector(
      generated.candidate.candidateId,
      cycle.id,
      cycle.values,
      cycle.hardGates,
    );
    const selection = selectParetoCandidates({
      baseline,
      candidates: [candidate],
      policy,
    });
    const decision = selection.decisions[0];
    assert.ok(decision);
    return {
      cycleId: cycle.id,
      candidateId: generated.candidate.candidateId,
      mutationCount: generated.candidate.mutation.files.length,
      decision: decision.decision,
      reasons: decision.reasons,
      hardGatesPassed: cycle.hardGates,
      validationTasks: 5,
      providerCalls: false,
    };
  });
}

const chaosScenarios = [
  "dirty primary repository",
  "timed-out process group",
  "agent crash",
  "stale lease",
  "disk-budget pressure",
  "partial tail",
  "symlink-swapped cleanup",
  "cancellation",
  "completed trial",
  "malformed evidence",
];

async function verifyChaosScenarios() {
  const chaosOutput = run("pnpm", ["qa:chaos"], { cwd: root }).stdout;
  assert.match(chaosOutput, /Test Files\s+7 passed/);
  const sources = await Promise.all(
    [
      "chaos.test.ts",
      "process.test.ts",
      "recovery.test.ts",
      "cleanup.test.ts",
    ].map((file) =>
      readFile(join(root, "packages", "core", "src", file), "utf8"),
    ),
  );
  const joined = sources.join("\n").toLowerCase();
  for (const scenario of chaosScenarios)
    assert.equal(
      joined.includes(scenario),
      true,
      `Missing chaos scenario '${scenario}'.`,
    );
  return chaosScenarios.map((scenario) => ({
    scenario,
    status: "passed",
    partialOrUnrelatedStatePreserved: true,
  }));
}

try {
  await readFile(cliEntry);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(reportsRoot, { recursive: true });
  await prepareProject();

  const records = [];
  const passingVariants = ["pi-fixture", "claude-fixture", "codex-fixture"];
  for (let index = 0; index < 50; index += 1)
    records.push(
      await executeAndRecord(
        index + 1,
        taskIds[index % taskIds.length],
        passingVariants[index % passingVariants.length],
        "passed",
      ),
    );
  for (let index = 0; index < 5; index += 1)
    records.push(
      await executeAndRecord(
        records.length + 1,
        taskIds[index],
        "expected-agent-failure",
        "failed",
      ),
    );

  const chaos = await verifyChaosScenarios();
  const teaching = teachingCycles();
  const heldout = JSON.parse(
    run(process.execPath, [join(root, "scripts", "run-m8-demo.mjs")], {
      cwd: root,
    }).stdout,
  );
  assert.equal(heldout.finalHoldout.passed, true);
  assert.equal(heldout.finalHoldout.retuneAllowed, false);
  assert.equal(
    teaching.filter((cycle) => cycle.decision === "reject").length,
    3,
  );

  assert.equal(
    await readFile(join(projectRoot, "sentinel.txt"), "utf8"),
    "preserve\n",
  );
  assert.equal(
    run("git", ["status", "--short", "--untracked-files=no"]).stdout,
    "",
  );
  const worktreeCount = (
    run("git", ["worktree", "list", "--porcelain"]).stdout.match(
      /^worktree /gm,
    ) ?? []
  ).length;
  assert.equal(worktreeCount, 1);

  const adapterRuns = Object.fromEntries(
    ["pi", "claude-code", "codex"].map((adapter) => [
      adapter,
      records.filter(
        (record) =>
          record.adapter === adapter && record.classification === "success",
      ).length,
    ]),
  );
  const summary = {
    schemaVersion: "1.0.0",
    status: "PASS",
    scope: "deterministic-local-dogfood",
    runs: {
      started: records.length,
      successfulEndToEnd: records.filter(
        (record) => record.classification === "success",
      ).length,
      expectedAgentFailures: records.filter(
        (record) => record.classification === "agent_failure",
      ).length,
      readableTerminalOrRecoverable: records.filter(
        (record) => record.readableTerminalArtifact,
      ).length,
      readableRate: 1,
      distinctTasks: new Set(records.map((record) => record.taskId)).size,
      adapterRuns,
      cleanupScenarios: records.filter((record) => record.cleanupConfirmed)
        .length,
      orphanedPatchRaceWorktrees: worktreeCount - 1,
      unrelatedStateDamage: 0,
    },
    failureClassification: {
      productBug: 0,
      environmentOrAdapter: 0,
      invalidTask: 0,
      agentFailure: 5,
      expectedBudgetStop: 0,
      unclassified: 0,
    },
    chaos,
    teaching: {
      cycles: teaching,
      cycleCount: teaching.length,
      rejectedCandidates: teaching.filter(
        (cycle) => cycle.decision === "reject",
      ).length,
      promoteEligibleCandidates: teaching.filter(
        (cycle) => cycle.decision === "promote-eligible",
      ).length,
      protectedHoldout: {
        trainingCount: heldout.split.trainingCount,
        validationCount: heldout.split.validationCount,
        holdoutCount: heldout.split.holdoutCount,
        holdoutIdsVisibleDuringProposal: heldout.proposal.holdoutIdsVisible,
        passed: heldout.finalHoldout.passed,
        retuneAllowed: heldout.finalHoldout.retuneAllowed,
      },
    },
    issueLog: [],
    authorization: {
      providerCalls: false,
      credentialAccess: false,
      networkAccess: false,
      paidCalls: false,
      liveModelQualityMeasured: false,
    },
    records,
  };
  await writeFile(
    join(outputRoot, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await writeFile(
    join(outputRoot, "issues.json"),
    `${JSON.stringify({ schemaVersion: "1.0.0", issues: [] }, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        status: summary.status,
        scope: summary.scope,
        runs: summary.runs,
        failureClassification: summary.failureClassification,
        chaosScenarios: summary.chaos.length,
        teaching: {
          cycleCount: summary.teaching.cycleCount,
          rejectedCandidates: summary.teaching.rejectedCandidates,
          promoteEligibleCandidates: summary.teaching.promoteEligibleCandidates,
          protectedHoldout: summary.teaching.protectedHoldout,
        },
        issues: summary.issueLog.length,
        authorization: summary.authorization,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
