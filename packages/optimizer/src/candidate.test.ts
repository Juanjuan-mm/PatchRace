import { describe, expect, it } from "vitest";

import {
  PatchRaceError,
  sha256,
  type CandidateFileMutationV1,
  type DiagnosisMutationRouteV1,
} from "@patchrace/contracts";

import {
  appendCandidateEvaluation,
  createCandidateSnapshot,
} from "./candidate.js";

const before = sha256("before");
const after = sha256("after");
const patch = sha256("patch");
const route: DiagnosisMutationRouteV1 = {
  schemaVersion: "1.0.0",
  routeSchemaVersion: "1.0.0",
  id: "route_1234567890abcdef",
  disposition: "candidate",
  mutationType: "skill",
  recommendationKind: null,
  sourceFindingIds: ["diag_workflow"],
  evidence: [
    {
      runId: "run_01K0FAKE000000000000000000",
      trialId: "trial_01K0FAKE000000000000000000",
      artifactHash: sha256("artifact"),
      logicalPath: "trials/focus/trace.jsonl",
      eventIds: ["event-1"],
    },
  ],
  rationale: ["repeatable_workflow"],
  invokedWorkflow: null,
  limitations: [],
};
const file: CandidateFileMutationV1 = {
  logicalPath: ".pi/skills/focused-test/SKILL.md",
  operation: "update",
  beforeHash: before,
  afterHash: after,
  patchHash: patch,
};

function candidate() {
  return createCandidateSnapshot({
    baselineId: "pi-main",
    createdAt: "2026-07-23T00:00:00.000Z",
    generator: {
      kind: "builtin-bounded-v1",
      id: "focused-skill-v1",
      version: "1.0.0",
      model: null,
      promptHash: null,
      deterministic: true,
    },
    routes: [route],
    visibleSplitHash: sha256("train"),
    configHash: sha256("config"),
    declaredVariable: "focused-test-workflow",
    files: [file],
    objective: {
      policy: "correctness-first-v1",
      primary: "success-rate",
      constraints: { maxAddedLines: 20, maxContextTokens: 250 },
    },
  });
}

describe("candidate snapshot and lineage", () => {
  it("records fixed provenance, exact files, objective, and stable identity", () => {
    const first = candidate();
    const second = candidate();

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      candidateId: expect.stringMatching(/^cand_[0-9a-f]{20}$/),
      candidateHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      inputs: {
        routeIds: [route.id],
        diagnosisIds: ["diag_workflow"],
        evidenceHashes: [route.evidence[0]!.artifactHash],
      },
      mutation: { type: "skill", files: [file] },
      evaluationHistory: [],
      decision: { state: "staged" },
    });
  });

  it("appends evaluation history without changing candidate identity", () => {
    const initial = candidate();
    const updated = appendCandidateEvaluation(initial, {
      attemptId: "attempt-1",
      phase: "train",
      runIds: ["run-1"],
      taskIds: ["task-1"],
      planHash: sha256("plan"),
      objectiveVectorHash: sha256("objective"),
      status: "completed",
      recordedAt: "2026-07-23T01:00:00Z",
      limitations: [],
    });

    expect(updated.candidateId).toBe(initial.candidateId);
    expect(updated.candidateHash).toBe(initial.candidateHash);
    expect(initial.evaluationHistory).toEqual([]);
    expect(updated.evaluationHistory).toHaveLength(1);
    expect(() =>
      appendCandidateEvaluation(updated, updated.evaluationHistory[0]!),
    ).toThrowError(PatchRaceError);
  });

  it("rejects forbidden paths, ineligible routes, and invalid operations", () => {
    expect(() =>
      createCandidateSnapshot({
        baselineId: "pi-main",
        createdAt: "2026-07-23T00:00:00Z",
        generator: {
          kind: "builtin-bounded-v1",
          id: "bad",
          version: "1",
          model: null,
          promptHash: null,
          deterministic: true,
        },
        routes: [{ ...route, disposition: "recommendation" }],
        visibleSplitHash: sha256("train"),
        configHash: sha256("config"),
        declaredVariable: "bad",
        files: [{ ...file, logicalPath: "../SKILL.md", beforeHash: null }],
        objective: {
          policy: "correctness-first-v1",
          primary: "success-rate",
          constraints: {},
        },
      }),
    ).toThrowError(PatchRaceError);
  });
});
