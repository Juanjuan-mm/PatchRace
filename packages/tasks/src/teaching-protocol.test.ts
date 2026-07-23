import { describe, expect, it } from "vitest";

import {
  PatchRaceError,
  sha256,
  type SplitTaskInputV1,
} from "@patchrace/contracts";

import { createTaskSplit } from "./split.js";
import {
  createTeachingEvidenceView,
  createTeachingProtocolLedger,
  openTeachingFinalHoldout,
  recordTeachingHoldoutOutcome,
} from "./teaching-protocol.js";

function manifest() {
  const tasks: SplitTaskInputV1[] = ["bug", "feature"].flatMap((category) =>
    Array.from({ length: 6 }, (_, index) => ({
      id: `${category}-${index}`,
      category,
      taskHash: sha256(`${category}-${index}`),
    })),
  );
  return createTaskSplit({ tasks, seed: "m8-protocol" });
}

describe("teaching split protocol", () => {
  it("exposes train evidence to proposal while hiding holdout identities", () => {
    const split = manifest();
    const ledger = createTeachingProtocolLedger(split);
    const result = createTeachingEvidenceView({
      ledger,
      manifest: split,
      phase: "candidate-generation",
      evidence: split.assignments.training.map((taskId) => ({
        taskId,
        artifactHashes: [sha256(`evidence-${taskId}`)],
      })),
      recordedAt: "2026-07-23T00:00:00Z",
    });
    const serialized = JSON.stringify(result.view);

    expect(result.view.split.trainingTaskIds).toEqual(
      split.assignments.training,
    );
    for (const taskId of split.assignments.holdout)
      expect(serialized).not.toContain(taskId);
    expect(result.view.split.holdout).toEqual({
      count: split.assignments.holdout.length,
      commitmentHash: split.holdoutCommitmentHash,
    });
  });

  it("separates validation and rejects cross-split evidence", () => {
    const split = manifest();
    const ledger = createTeachingProtocolLedger(split);
    expect(() =>
      createTeachingEvidenceView({
        ledger,
        manifest: split,
        phase: "candidate-selection",
        evidence: [
          {
            taskId: split.assignments.training[0]!,
            artifactHashes: [sha256("wrong-split")],
          },
        ],
        recordedAt: "2026-07-23T00:00:00Z",
      }),
    ).toThrowError(PatchRaceError);
  });

  it("opens one frozen holdout gate and permanently disables retuning", () => {
    const split = manifest();
    const initial = createTeachingProtocolLedger(split);
    const opened = openTeachingFinalHoldout({
      ledger: initial,
      manifest: split,
      frozenCandidateId: "cand_1234567890abcdef1234",
      frozenPolicyHash: sha256("policy"),
      gateId: "m8-final",
      now: () => new Date("2026-07-23T01:00:00Z"),
    });
    expect(opened.gate.access.taskIds).toEqual(split.assignments.holdout);
    expect(() =>
      openTeachingFinalHoldout({
        ledger: opened.ledger,
        manifest: split,
        frozenCandidateId: "cand_1234567890abcdef1234",
        frozenPolicyHash: sha256("policy"),
        gateId: "second",
        now: () => new Date("2026-07-23T02:00:00Z"),
      }),
    ).toThrowError(PatchRaceError);

    const completed = recordTeachingHoldoutOutcome({
      ledger: opened.ledger,
      gate: opened.gate,
      resultHash: sha256("result"),
      passed: false,
      recordedAt: "2026-07-23T02:00:00Z",
    });
    expect(completed.finalHoldout?.outcome).toMatchObject({
      passed: false,
      retuneAllowed: false,
    });
    expect(() =>
      createTeachingEvidenceView({
        ledger: completed,
        manifest: split,
        phase: "candidate-generation",
        evidence: [
          {
            taskId: split.assignments.training[0]!,
            artifactHashes: [sha256("retune")],
          },
        ],
        recordedAt: "2026-07-23T03:00:00Z",
      }),
    ).toThrowError(PatchRaceError);
  });
});
