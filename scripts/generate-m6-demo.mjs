import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalHash,
  canonicalJson,
} from "../packages/contracts/dist/index.js";
import { createRacePlan } from "../packages/core/dist/index.js";
import {
  buildTrajectoryTimeline,
  rankRace,
} from "../packages/diagnosis/dist/index.js";
import {
  buildPatchComparison,
  buildComparisonReport,
  renderJUnitXml,
  renderReportJson,
  renderSarifJson,
  renderStaticHtml,
} from "../packages/report/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(root, "fixtures/m6/three-agent-demo");
const taskHash = canonicalHash({
  fixture: "m2/success-typescript",
  revision: 1,
});
const task = {
  taskId: "add-regression",
  taskHash,
  baselineCommit: "1111111111111111111111111111111111111111",
  instructionHash: canonicalHash("Keep the public add behavior correct."),
};
const definitions = [
  ["pi-fixture", "pi", "pi", "0.81.1"],
  ["claude-fixture", "claude", "claude-code", "2.1.104"],
  ["codex-fixture", "codex", "codex", "0.145.0-alpha.18"],
];
const variants = definitions.map(([variantId, adapterId, kind, version]) => ({
  variantId,
  adapter: { id: adapterId, kind, executable: adapterId, version },
  model: null,
  harness: { evidence: "captured-public-fixture", network: false },
  workflow: { candidate: null },
  environmentNames: ["LANG", "PATH"],
}));
const ids = [
  "trial_01J000000000000000000000001",
  "trial_01J000000000000000000000002",
  "trial_01J000000000000000000000003",
];
let idIndex = 0;
const plan = createRacePlan({
  tasks: [task],
  variants,
  repeat: 1,
  maxTrials: 3,
  budgetIdentity: {
    wallSeconds: 0,
    maxTrials: 3,
    maxTokens: null,
    maxCostUsd: null,
  },
  createTrialId: () => ids[idIndex++],
});
const evidence = {
  "pi-fixture": { passed: true, durationMs: 100, lines: 2 },
  "claude-fixture": { passed: true, durationMs: 80, lines: 3 },
  "codex-fixture": { passed: false, durationMs: 70, lines: 1 },
};
const trials = plan.trials.map((trial) => {
  const observed = evidence[trial.variantId];
  return {
    schemaVersion: "1.0.0",
    ...trial,
    terminalStatus: "completed",
    integrity: "valid",
    outcome: observed.passed ? "passed" : "failed",
    hardGates: [
      {
        id: "public-tests",
        status: observed.passed ? "passed" : "failed",
        evidence: [`trials/${trial.trialId}/grade.json`],
      },
    ],
    metrics: {
      durationMs: {
        value: observed.durationMs,
        unit: "ms",
        availability: "derived",
        source: "captured-fixture-controller",
      },
      costUsd: {
        value: null,
        unit: "USD",
        availability: "unavailable",
        source: "captured-fixture",
      },
      tokens: {
        value: null,
        unit: "tokens",
        availability: "unavailable",
        source: "captured-fixture",
      },
      footprintLines: {
        value: observed.lines,
        unit: "lines",
        availability: "derived",
        source: "captured-fixture-patch",
      },
    },
    artifacts: {
      patch: `trials/${trial.trialId}/patch.diff`,
      grade: `trials/${trial.trialId}/grade.json`,
      trace: `trials/${trial.trialId}/trace.jsonl`,
      result: `trials/${trial.trialId}/result.json`,
    },
    limitations: ["captured_fixture_not_live_agent_execution"],
  };
});
const execution = {
  schemaVersion: "1.0.0",
  plan,
  status: "completed",
  trials,
  scheduler: plan.trials.map((trial) => ({
    trialId: trial.trialId,
    status: "completed",
    errorCode: null,
  })),
};
const ranking = rankRace(execution);
const patchFor = (trial) =>
  `diff --git a/target.txt b/target.txt\n--- a/target.txt\n+++ b/target.txt\n@@ -1 +1 @@\n-original\n+${trial.outcome === "passed" ? "correct" : "incorrect"}\n`;
const traceFor = (trial) => ({
  schemaVersion: "1.0.0",
  eventId: `evt_${trial.trialId.slice(-8)}`,
  sequence: 1,
  trialId: trial.trialId,
  type: "test.completed",
  time: { wall: null, monotonicMs: null, precision: "unknown" },
  actor: "controller",
  source: {
    adapter: plan.variants.find(
      (variant) => variant.variantId === trial.variantId,
    ).adapter.kind,
    adapterVersion: "captured-fixture-v1",
    derivedRule: "public-demo-fixture",
  },
  availability: "derived",
  data: { outcome: trial.outcome, suite: "public-fixture" },
  sensitivity: ["public"],
});
const patches = trials.map((trial) =>
  buildPatchComparison({
    trialId: trial.trialId,
    unifiedDiff: patchFor(trial),
    changedFiles: [
      {
        path: "target.txt",
        status: "modified",
        protectedPathViolation: false,
      },
    ],
    referenceAccess: "withheld",
  }),
);
const timelines = [
  {
    taskId: task.taskId,
    repetition: 1,
    timeline: buildTrajectoryTimeline({
      traces: plan.variants.map((variant) => ({
        variantId: variant.variantId,
        events: [
          traceFor(
            trials.find((trial) => trial.variantId === variant.variantId),
          ),
        ],
      })),
    }),
  },
];
const report = buildComparisonReport({
  execution,
  ranking,
  patches,
  timelines,
  title: "PatchRace public three-Agent fixture comparison",
});
const outputs = new Map([
  ["report.json", renderReportJson(report)],
  ["index.html", renderStaticHtml(report)],
  ["junit.xml", renderJUnitXml(report)],
  ["results.sarif", renderSarifJson(report)],
]);
for (const trial of trials) {
  const root = `trials/${trial.trialId}`;
  outputs.set(`${root}/patch.diff`, patchFor(trial));
  outputs.set(
    `${root}/grade.json`,
    `${canonicalJson({
      schemaVersion: "1.0.0",
      integrity: trial.integrity,
      outcome: trial.outcome,
      hardGates: trial.hardGates,
      taskHash: trial.taskHash,
    })}\n`,
  );
  outputs.set(`${root}/trace.jsonl`, `${canonicalJson(traceFor(trial))}\n`);
  outputs.set(`${root}/result.json`, `${canonicalJson(trial)}\n`);
}

if (process.argv.includes("--write")) {
  await mkdir(outputRoot, { recursive: true });
  await Promise.all(
    [...outputs].map(async ([name, content]) => {
      const target = resolve(outputRoot, name);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }),
  );
} else {
  for (const [name, expected] of outputs) {
    const actual = await readFile(resolve(outputRoot, name), "utf8");
    if (actual !== expected) throw new Error(`M6 demo artifact drift: ${name}`);
  }
}
process.stderr.write(
  `M6 demo verified ${outputs.size} deterministic artifacts.\n`,
);
