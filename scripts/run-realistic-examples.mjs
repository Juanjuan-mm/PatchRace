import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const examplesRoot = join(root, "examples", "realistic");
const outputRoot = join(root, ".artifacts", "examples");
const temporaryRoot = await mkdtemp(
  join(tmpdir(), "patchrace-realistic-examples-"),
);
const cliEntry = join(root, "packages", "cli", "dist", "main.js");
const fixedGitEnvironment = {
  ...process.env,
  GIT_AUTHOR_DATE: "2026-07-23T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-07-23T00:00:00Z",
};

const examples = [
  {
    id: "typescript-retry-after",
    directory: "typescript",
    ecosystem: "typescript",
    target: "src/retry-after.ts",
    verifier: [
      "node",
      "--experimental-strip-types",
      "--test",
      "test/retry-after.test.mjs",
    ],
  },
  {
    id: "python-invoice-totals",
    directory: "python",
    ecosystem: "python",
    target: "invoice_totals.py",
    verifier: ["python3", "test_invoice_totals.py"],
  },
  {
    id: "posix-shell-failure-selector",
    directory: "shell",
    ecosystem: "posix-shell",
    target: "bin/select-failures.sh",
    verifier: ["sh", "test/select-failures.test.sh"],
  },
];

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
  });
  const allowed = options.allowed ?? [0];
  if (result.status === null || !allowed.includes(result.status))
    throw new Error(
      `${executable} ${args.join(" ")} failed (${String(result.status)}): ${result.stderr || result.stdout}`,
    );
  return result;
}

function runJson(projectRoot, args, allowed = [0, 1]) {
  const result = run(
    process.execPath,
    [cliEntry, "--project", projectRoot, "--json", ...args],
    { cwd: projectRoot, allowed },
  );
  if (result.stderr !== "")
    throw new Error(`JSON command wrote stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    typeof parsed.command !== "string"
  )
    throw new Error("CLI did not return one machine-readable result.");
  return parsed;
}

async function createAgent(path, target, content) {
  const action =
    content === null
      ? ""
      : `await writeFile(${JSON.stringify(target)}, Buffer.from(${JSON.stringify(content.toString("base64"))}, "base64"));`;
  await writeFile(
    path,
    `#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
if (process.argv.includes("--version")) {
  process.stdout.write("0.81.1\\n");
} else {
  ${action}
  process.stdout.write(JSON.stringify({ type: "agent_end", message: "fixture complete" }) + "\\n");
}
`,
  );
  await chmod(path, 0o755);
}

async function runExample(example) {
  const source = join(examplesRoot, example.directory);
  const projectRoot = join(temporaryRoot, example.id);
  await mkdir(projectRoot, { recursive: true });
  await cp(join(source, "baseline"), projectRoot, { recursive: true });
  await writeFile(join(projectRoot, ".gitignore"), ".patchrace/\n");
  await writeFile(join(projectRoot, "sentinel.txt"), "preserve\n");
  const strongContent = await readFile(join(source, "strong", example.target));
  const weakAgent = join(projectRoot, "fixture-weak.mjs");
  const strongAgent = join(projectRoot, "fixture-strong.mjs");
  await createAgent(weakAgent, example.target, null);
  await createAgent(strongAgent, example.target, strongContent);

  run("git", ["init", "-q", "-b", "main"], { cwd: projectRoot });
  run("git", ["config", "user.name", "PatchRace Example"], {
    cwd: projectRoot,
  });
  run("git", ["config", "user.email", "example@example.invalid"], {
    cwd: projectRoot,
  });
  run("git", ["add", "."], { cwd: projectRoot });
  run("git", ["commit", "-qm", `${example.id} baseline`], {
    cwd: projectRoot,
    env: fixedGitEnvironment,
  });
  const commit = run("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
  }).stdout.trim();

  const stateRoot = join(projectRoot, ".patchrace");
  const taskRoot = join(stateRoot, "task");
  await mkdir(taskRoot, { recursive: true });
  const instruction = await readFile(join(source, "instruction.md"), "utf8");
  await writeFile(join(taskRoot, "instruction.md"), instruction);
  await writeFile(
    join(taskRoot, "task.json"),
    `${JSON.stringify({
      schemaVersion: "1.0.0",
      id: example.id,
      revision: 1,
      baseline: {
        repository: ".",
        commit,
        submodules: "disabled",
        lfs: "disabled",
      },
      instruction: {
        file: "instruction.md",
        hash: sha256(instruction),
      },
      setup: { commands: [], assets: [] },
      verifier: {
        visibility: "public",
        assets: [],
        commands: [
          {
            id: "tests",
            kind: "test",
            argv: example.verifier,
            timeoutSeconds: 30,
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
          maxLines: 120,
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
        trialSeconds: 60,
        maxTokens: null,
        maxCostUsd: null,
        maxOutputBytes: 1024 * 1024,
        maxPatchLines: 120,
        maxChangedFiles: 1,
        diskMiB: 64,
      },
      provenance: {
        source: "manual",
        sourceCommit: commit,
        referencePatchHash: sha256(strongContent),
        createdAt: "2026-07-23T00:00:00.000Z",
        reviewedBy: "patchrace-doc-05",
      },
      metadata: {
        ecosystem: example.ecosystem,
        category: "realistic-bugfix",
        split: "validation",
        fixtureEvidence: true,
      },
    })}\n`,
  );
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
          wallSeconds: 120,
          trialSeconds: 60,
          maxTrials: 2,
          maxTokens: null,
          maxCostUsd: null,
          diskMiB: 128,
        },
        environment: {
          inherit: ["PATH", "LANG", "LC_ALL", "TMPDIR"],
          pass: [],
          redact: [],
        },
      },
      adapters: {
        weak: { kind: "pi", executable: weakAgent },
        strong: { kind: "pi", executable: strongAgent },
      },
      variants: {
        "fixture-no-change": {
          adapter: "weak",
          model: "deterministic-fixture",
          harness: { fixture: "no-change-v1" },
          workflow: {},
        },
        "fixture-reviewed-fix": {
          adapter: "strong",
          model: "deterministic-fixture",
          harness: { fixture: "reviewed-fix-v1" },
          workflow: {},
        },
      },
      suites: {
        validation: { tasks: [example.id], split: "validation" },
      },
      tasks: { [example.id]: { file: "task/task.json" } },
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
        evidence: "deterministic-public-fixture",
        providerCalls: false,
      },
    })}\n`,
  );

  const raced = runJson(projectRoot, [
    "--config",
    ".patchrace/suite.json",
    "race",
    "--suite",
    "validation",
    "--variants",
    "fixture-no-change,fixture-reviewed-fix",
  ]);
  const report = raced.data?.report;
  const runId = raced.data?.runId;
  assert.equal(typeof runId, "string");
  assert.equal(Array.isArray(report?.trials), true);
  assert.equal(report.trials.length, 2);
  const outcomes = Object.fromEntries(
    report.trials.map((trial) => [trial.variantId, trial.outcome]),
  );
  assert.deepEqual(outcomes, {
    "fixture-no-change": "failed",
    "fixture-reviewed-fix": "passed",
  });
  assert.equal(report.ranking.variants[0].variantId, "fixture-reviewed-fix");
  assert.equal(report.ranking.variants[1].variantId, "fixture-no-change");
  assert.equal(report.ranking.variants[1].decisiveDimension, "hard-gates");
  assert.equal(
    report.trials
      .find((trial) => trial.variantId === "fixture-reviewed-fix")
      .hardGates.every((gate) => gate.status === "passed"),
    true,
  );

  const destination = join(outputRoot, example.id);
  await cp(join(stateRoot, "runs", runId, "report"), destination, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  const preview = runJson(projectRoot, [
    "clean",
    "--run",
    runId,
    "--artifacts",
  ]);
  assert.equal(preview.status, "dry-run");
  const cleaned = runJson(projectRoot, [
    "clean",
    "--run",
    runId,
    "--artifacts",
    "--confirm",
  ]);
  assert.equal(cleaned.status, "completed");
  assert.equal(
    await readFile(join(projectRoot, "sentinel.txt"), "utf8"),
    "preserve\n",
  );
  assert.equal(
    run("git", ["status", "--short", "--untracked-files=no"], {
      cwd: projectRoot,
    }).stdout,
    "",
  );

  return {
    id: example.id,
    ecosystem: example.ecosystem,
    comparison: "deterministic-harness-fixture",
    variants: outcomes,
    rank1: "fixture-reviewed-fix",
    decisiveDimensionAgainstRunnerUp: "hard-gates",
    validTrials: 2,
    providerCalls: false,
    credentials: false,
    network: false,
    userWorktreePreserved: true,
    unrelatedStatePreserved: true,
    report: relative(root, join(destination, "report.json")).replaceAll(
      "\\",
      "/",
    ),
    html: relative(root, join(destination, "index.html")).replaceAll("\\", "/"),
    claimBoundary:
      "This deterministic public fixture proves the recorded comparison mechanics; it is not live Agent quality evidence.",
  };
}

try {
  await readFile(cliEntry);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  const comparisons = [];
  for (const example of examples) comparisons.push(await runExample(example));

  const teaching = JSON.parse(
    run(process.execPath, [join(root, "scripts", "run-m8-demo.mjs")], {
      cwd: root,
    }).stdout,
  );
  assert.equal(teaching.proposal.holdoutIdsVisible, false);
  assert.equal(teaching.validation.selection, "promote-eligible");
  assert.equal(teaching.finalHoldout.passed, true);
  assert.equal(teaching.finalHoldout.retuneAllowed, false);

  const summary = {
    schemaVersion: "1.0.0",
    status: "PASS",
    evidence: "deterministic-public-fixtures",
    comparisons,
    teaching: {
      demoId: teaching.demoId,
      trainingCount: teaching.split.trainingCount,
      validationCount: teaching.split.validationCount,
      holdoutCount: teaching.split.holdoutCount,
      holdoutIdsVisibleDuringProposal: teaching.proposal.holdoutIdsVisible,
      oneMutation: true,
      validationSelection: teaching.validation.selection,
      finalHoldoutPassed: teaching.finalHoldout.passed,
      retuneAllowed: teaching.finalHoldout.retuneAllowed,
      decision: "promote-eligible",
      claimBoundary: teaching.claimBoundary,
    },
    providerCalls: false,
    credentialAccess: false,
    networkAccess: false,
    publication: false,
  };
  const expected = JSON.parse(
    await readFile(join(examplesRoot, "expected-summary.json"), "utf8"),
  );
  assert.deepEqual(summary, expected);
  await writeFile(
    join(outputRoot, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
