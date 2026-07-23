import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  canonicalHash,
  canonicalJson,
  sha256,
} from "../packages/contracts/dist/index.js";
import {
  createDecisionPolicy,
  createObjectiveVector,
  generateAgentsGuidanceCandidate,
  selectParetoCandidates,
} from "../packages/optimizer/dist/index.js";
import {
  createTaskSplit,
  createTeachingEvidenceView,
  createTeachingProtocolLedger,
  openTeachingFinalHoldout,
  recordTeachingHoldoutOutcome,
} from "../packages/tasks/dist/index.js";

const fixtureUrl = new URL("../fixtures/m8/heldout-demo.json", import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
const taskInputs = fixture.tasks.map((task) => ({
  id: task.id,
  category: task.category,
  taskHash: sha256(canonicalJson(task)),
}));
const manifest = createTaskSplit({
  tasks: taskInputs,
  seed: fixture.seed,
});
let ledger = createTeachingProtocolLedger(manifest);
const training = createTeachingEvidenceView({
  ledger,
  manifest,
  phase: "candidate-generation",
  evidence: manifest.assignments.training.map((taskId) => ({
    taskId,
    artifactHashes: [sha256(`training-diagnosis\0${taskId}`)],
  })),
  recordedAt: "2026-07-23T00:00:00.000Z",
});
ledger = training.ledger;
const proposalBytes = canonicalJson(training.view);
for (const taskId of manifest.assignments.holdout)
  assert.equal(proposalBytes.includes(taskId), false);

const trainingTaskId = manifest.assignments.training[0];
assert.ok(trainingTaskId);
const citation = {
  runId: "run_m8_demo",
  trialId: "trial_m8_demo",
  artifactHash: sha256(`training-diagnosis\0${trainingTaskId}`),
  logicalPath: `training/${trainingTaskId}/grade.json`,
  gradeGateIds: ["constraint:package-manager"],
};
const finding = {
  schemaVersion: "1.0.0",
  id: "diag_m8_package_manager",
  category: "context",
  confidence: "high",
  claim:
    "A deterministic package-manager constraint failed on training evidence.",
  evidence: [citation],
  alternatives: [
    {
      claim:
        "The fixture task could be invalid; its deterministic integrity gate passed.",
    },
  ],
  eligibleMutationTargets: ["agents-guidance"],
  limitations: ["deterministic_fixture_evidence_only"],
  origin: "deterministic-rule",
  ruleId: "explicit-constraint-gate-failure-v1",
};
const route = {
  schemaVersion: "1.0.0",
  routeSchemaVersion: "1.0.0",
  id: "route_m8_package_manager",
  disposition: "candidate",
  mutationType: "agents-guidance",
  recommendationKind: null,
  sourceFindingIds: [finding.id],
  evidence: [citation],
  rationale: ["stable_project_constraint_belongs_in_project_guidance"],
  invokedWorkflow: null,
  limitations: ["deterministic_fixture_evidence_only"],
};
const generated = generateAgentsGuidanceCandidate({
  baselineId: "pi-demo-baseline",
  createdAt: "2026-07-23T00:00:00.000Z",
  route,
  finding,
  visibleSplitHash: training.view.accessHash,
  configHash: sha256("m8-demo-config"),
  currentContent: fixture.baselineGuidance,
  change: { kind: "add-stable-fact", fact: fixture.candidateFact },
  maxAddedLines: 10,
  maxContextTokens: fixture.predeclared.maxContextTokenIncrease,
});
const candidateGuidance = Buffer.from(generated.files[0].after).toString(
  "utf8",
);

const validation = createTeachingEvidenceView({
  ledger,
  manifest,
  phase: "candidate-selection",
  evidence: manifest.assignments.validation.map((taskId) => ({
    taskId,
    artifactHashes: [sha256(`validation\0${taskId}`)],
  })),
  recordedAt: "2026-07-23T01:00:00.000Z",
});
ledger = validation.ledger;

function successRate(guidance, taskIds) {
  const tasks = taskIds.map((taskId) =>
    fixture.tasks.find((task) => task.id === taskId),
  );
  assert.equal(tasks.every(Boolean), true);
  return (
    tasks.filter((task) => guidance.includes(task.requiredFact)).length /
    tasks.length
  );
}

const units = {
  successRate: "ratio",
  stabilityVariance: "ratio2",
  costUsd: "usd",
  latencyMs: "ms",
  footprintLines: "lines",
  contextTokens: "estimated-tokens",
  configComplexity: "points",
};
function metric(dimension, value, taskIds, artifactLabel) {
  return {
    availability: "derived",
    value,
    unit: units[dimension],
    sampleCount: taskIds.length,
    taskIds,
    repetitions: 1,
    variance: 0,
    interval: null,
    sourceArtifactHashes: [sha256(artifactLabel)],
  };
}
function vector(candidateId, phase, guidance, taskIds, artifactLabel) {
  const contextTokens = Math.ceil([...guidance].length / 4);
  return createObjectiveVector({
    candidateId,
    phase,
    hardGates: {
      integrity: true,
      correctness: true,
      safety: true,
      protectedPaths: true,
    },
    metrics: {
      successRate: metric(
        "successRate",
        successRate(guidance, taskIds),
        taskIds,
        artifactLabel,
      ),
      stabilityVariance: metric("stabilityVariance", 0, taskIds, artifactLabel),
      costUsd: metric("costUsd", 0, taskIds, artifactLabel),
      latencyMs: metric("latencyMs", 10, taskIds, artifactLabel),
      footprintLines: metric("footprintLines", 0, taskIds, artifactLabel),
      contextTokens: metric(
        "contextTokens",
        contextTokens,
        taskIds,
        artifactLabel,
      ),
      configComplexity: metric(
        "configComplexity",
        candidateId === "baseline" ? 0 : 1,
        taskIds,
        artifactLabel,
      ),
    },
  });
}

const baselineValidation = vector(
  "baseline",
  "validation",
  fixture.baselineGuidance,
  manifest.assignments.validation,
  "validation-baseline",
);
const candidateValidation = vector(
  generated.candidate.candidateId,
  "validation",
  candidateGuidance,
  manifest.assignments.validation,
  "validation-candidate",
);
const policy = createDecisionPolicy({
  requiredDimensions: [
    "successRate",
    "stabilityVariance",
    "costUsd",
    "latencyMs",
    "footprintLines",
    "contextTokens",
    "configComplexity",
  ],
  minimumSuccessRateImprovement: fixture.predeclared.minimumImprovement,
  maximumRegression: {
    costUsd: fixture.predeclared.maxCostIncreaseUsd,
    latencyMs: fixture.predeclared.maxLatencyIncreaseMs,
    footprintLines: fixture.predeclared.maxFootprintIncreaseLines,
    contextTokens: fixture.predeclared.maxContextTokenIncrease,
    configComplexity: fixture.predeclared.maxConfigComplexityIncrease,
  },
  evidenceTier: "held-out",
});
const selection = selectParetoCandidates({
  baseline: baselineValidation,
  candidates: [candidateValidation],
  policy,
});
assert.equal(selection.decisions[0].decision, "promote-eligible");

const opened = openTeachingFinalHoldout({
  ledger,
  manifest,
  frozenCandidateId: generated.candidate.candidateId,
  frozenPolicyHash: policy.policyHash,
  gateId: "m8-demo-final",
  now: () => new Date("2026-07-23T02:00:00.000Z"),
});
ledger = opened.ledger;
const baselineHoldout = vector(
  "baseline",
  "holdout",
  fixture.baselineGuidance,
  opened.gate.access.taskIds,
  "holdout-baseline",
);
const candidateHoldout = vector(
  generated.candidate.candidateId,
  "holdout",
  candidateGuidance,
  opened.gate.access.taskIds,
  "holdout-candidate",
);
const improvement =
  candidateHoldout.metrics.successRate.value -
  baselineHoldout.metrics.successRate.value;
const contextIncrease =
  candidateHoldout.metrics.contextTokens.value -
  baselineHoldout.metrics.contextTokens.value;
const passed =
  improvement >= fixture.predeclared.minimumImprovement &&
  candidateHoldout.hardGates.integrity &&
  candidateHoldout.hardGates.correctness &&
  candidateHoldout.hardGates.safety &&
  candidateHoldout.hardGates.protectedPaths &&
  candidateHoldout.metrics.costUsd.value -
    baselineHoldout.metrics.costUsd.value <=
    fixture.predeclared.maxCostIncreaseUsd &&
  candidateHoldout.metrics.latencyMs.value -
    baselineHoldout.metrics.latencyMs.value <=
    fixture.predeclared.maxLatencyIncreaseMs &&
  candidateHoldout.metrics.footprintLines.value -
    baselineHoldout.metrics.footprintLines.value <=
    fixture.predeclared.maxFootprintIncreaseLines &&
  contextIncrease <= fixture.predeclared.maxContextTokenIncrease &&
  candidateHoldout.metrics.configComplexity.value -
    baselineHoldout.metrics.configComplexity.value <=
    fixture.predeclared.maxConfigComplexityIncrease;
ledger = recordTeachingHoldoutOutcome({
  ledger,
  gate: opened.gate,
  resultHash: canonicalHash({ baselineHoldout, candidateHoldout }),
  passed,
  recordedAt: "2026-07-23T03:00:00.000Z",
});

const report = {
  schemaVersion: "1.0.0",
  demoId: fixture.demoId,
  split: {
    manifestHash: manifest.manifestHash,
    trainingCount: manifest.assignments.training.length,
    validationCount: manifest.assignments.validation.length,
    holdoutCount: manifest.assignments.holdout.length,
    holdoutCommitmentHash: manifest.holdoutCommitmentHash,
  },
  proposal: {
    viewHash: training.view.accessHash,
    holdoutIdsVisible: false,
    candidateId: generated.candidate.candidateId,
    candidateHash: generated.candidate.candidateHash,
    contextTokenDelta: generated.complexity.contextTokenDelta,
  },
  validation: {
    baselineSuccessRate: baselineValidation.metrics.successRate.value,
    candidateSuccessRate: candidateValidation.metrics.successRate.value,
    selection: selection.decisions[0].decision,
    policyHash: policy.policyHash,
  },
  finalHoldout: {
    gateHash: opened.gate.gateHash,
    baselineSuccessRate: baselineHoldout.metrics.successRate.value,
    candidateSuccessRate: candidateHoldout.metrics.successRate.value,
    improvement,
    minimumImprovement: fixture.predeclared.minimumImprovement,
    hardGatesPassed: Object.values(candidateHoldout.hardGates).every(Boolean),
    costIncreaseUsd:
      candidateHoldout.metrics.costUsd.value -
      baselineHoldout.metrics.costUsd.value,
    latencyIncreaseMs:
      candidateHoldout.metrics.latencyMs.value -
      baselineHoldout.metrics.latencyMs.value,
    footprintIncreaseLines:
      candidateHoldout.metrics.footprintLines.value -
      baselineHoldout.metrics.footprintLines.value,
    contextTokenIncrease: contextIncrease,
    configComplexityIncrease:
      candidateHoldout.metrics.configComplexity.value -
      baselineHoldout.metrics.configComplexity.value,
    passed,
    retuneAllowed: ledger.finalHoldout.outcome.retuneAllowed,
  },
  claimBoundary: fixture.claimBoundary,
};

assert.equal(report.split.trainingCount, 8);
assert.equal(report.split.validationCount, 2);
assert.equal(report.split.holdoutCount, 2);
assert.equal(report.proposal.holdoutIdsVisible, false);
assert.equal(report.finalHoldout.baselineSuccessRate, 0);
assert.equal(report.finalHoldout.candidateSuccessRate, 1);
assert.equal(report.finalHoldout.improvement, 1);
assert.equal(report.finalHoldout.passed, true);
assert.equal(report.finalHoldout.retuneAllowed, false);

const output = `${canonicalJson(report)}\n`;
if (process.argv.includes("--check")) {
  const expected = await readFile(
    new URL("../fixtures/m8/heldout-demo.expected.json", import.meta.url),
    "utf8",
  );
  assert.equal(output, expected);
} else {
  process.stdout.write(output);
}
