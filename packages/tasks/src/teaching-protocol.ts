import {
  PatchRaceError,
  canonicalHash,
  type ContentHash,
  type TaskSplitManifestV1,
  type TeachingEvidenceViewV1,
  type TeachingHoldoutGateV1,
  type TeachingProtocolLedgerV1,
} from "@patchrace/contracts";

import {
  assertSplitAccess,
  createOptimizationSplitView,
  openFinalHoldout,
  verifyTaskSplit,
} from "./split.js";

function conflict(code: string, message: string, path: string): never {
  throw new PatchRaceError({ code, category: "CONFLICT", message, path });
}

function assertLedger(
  ledger: TeachingProtocolLedgerV1,
  manifest: TaskSplitManifestV1,
): void {
  verifyTaskSplit(manifest);
  if (ledger.manifestHash !== manifest.manifestHash)
    conflict(
      "TEACHING_PROTOCOL_MANIFEST_MISMATCH",
      "Teaching ledger belongs to a different split manifest.",
      "manifestHash",
    );
}

export function createTeachingProtocolLedger(
  manifest: TaskSplitManifestV1,
): TeachingProtocolLedgerV1 {
  verifyTaskSplit(manifest);
  return {
    schemaVersion: "1.0.0",
    protocolSchemaVersion: "1.0.0",
    manifestHash: manifest.manifestHash,
    accesses: [],
    finalHoldout: null,
  };
}

export function createTeachingEvidenceView(options: {
  readonly ledger: TeachingProtocolLedgerV1;
  readonly manifest: TaskSplitManifestV1;
  readonly phase: TeachingEvidenceViewV1["phase"];
  readonly evidence: TeachingEvidenceViewV1["evidence"];
  readonly recordedAt: string;
}): {
  readonly ledger: TeachingProtocolLedgerV1;
  readonly view: TeachingEvidenceViewV1;
} {
  assertLedger(options.ledger, options.manifest);
  if (options.ledger.finalHoldout !== null)
    conflict(
      "TEACHING_PROTOCOL_REUSE_AFTER_HOLDOUT",
      "A used final holdout cannot feed later proposal or selection.",
      "finalHoldout",
    );
  if (!Number.isFinite(Date.parse(options.recordedAt)))
    conflict(
      "TEACHING_PROTOCOL_TIME_INVALID",
      "Teaching access time is invalid.",
      "recordedAt",
    );
  const taskIds = options.evidence.map((item) => item.taskId);
  if (
    taskIds.length === 0 ||
    new Set(taskIds).size !== taskIds.length ||
    options.evidence.some((item) => item.artifactHashes.length === 0)
  )
    conflict(
      "TEACHING_PROTOCOL_EVIDENCE_INVALID",
      "Teaching evidence must contain unique tasks with artifact hashes.",
      "evidence",
    );
  assertSplitAccess({
    manifest: options.manifest,
    phase: options.phase,
    taskIds,
  });
  const split = createOptimizationSplitView(options.manifest);
  const fixed = {
    schemaVersion: "1.0.0" as const,
    phase: options.phase,
    split,
    evidence: [...options.evidence].sort((left, right) =>
      left.taskId.localeCompare(right.taskId),
    ),
  };
  const view = { ...fixed, accessHash: canonicalHash(fixed) };
  return {
    view,
    ledger: {
      ...options.ledger,
      accesses: [
        ...options.ledger.accesses,
        {
          phase: options.phase,
          accessHash: view.accessHash,
          taskIds: [...taskIds].sort(),
          recordedAt: new Date(options.recordedAt).toISOString(),
        },
      ],
    },
  };
}

export function openTeachingFinalHoldout(options: {
  readonly ledger: TeachingProtocolLedgerV1;
  readonly manifest: TaskSplitManifestV1;
  readonly frozenCandidateId: string;
  readonly frozenPolicyHash: ContentHash;
  readonly gateId: string;
  readonly now: () => Date;
}): {
  readonly ledger: TeachingProtocolLedgerV1;
  readonly gate: TeachingHoldoutGateV1;
} {
  assertLedger(options.ledger, options.manifest);
  if (options.ledger.finalHoldout !== null)
    conflict(
      "TEACHING_HOLDOUT_ALREADY_OPENED",
      "Final holdout can be opened only once for a split manifest.",
      "finalHoldout",
    );
  if (!/^cand_[0-9a-f]{20}$/u.test(options.frozenCandidateId))
    conflict(
      "TEACHING_HOLDOUT_CANDIDATE_INVALID",
      "Final holdout requires a frozen candidate ID.",
      "frozenCandidateId",
    );
  const access = openFinalHoldout(options.manifest, {
    gateId: options.gateId,
    now: options.now,
  });
  const fixed = {
    schemaVersion: "1.0.0" as const,
    gateId: options.gateId,
    frozenCandidateId: options.frozenCandidateId,
    frozenPolicyHash: options.frozenPolicyHash,
    access,
  };
  const gate = { ...fixed, gateHash: canonicalHash(fixed) };
  return {
    gate,
    ledger: {
      ...options.ledger,
      finalHoldout: { gate, outcome: null },
    },
  };
}

export function recordTeachingHoldoutOutcome(options: {
  readonly ledger: TeachingProtocolLedgerV1;
  readonly gate: TeachingHoldoutGateV1;
  readonly resultHash: ContentHash;
  readonly passed: boolean;
  readonly recordedAt: string;
}): TeachingProtocolLedgerV1 {
  const finalHoldout = options.ledger.finalHoldout;
  if (
    finalHoldout === null ||
    finalHoldout.outcome !== null ||
    finalHoldout.gate.gateHash !== options.gate.gateHash ||
    canonicalHash({
      schemaVersion: options.gate.schemaVersion,
      gateId: options.gate.gateId,
      frozenCandidateId: options.gate.frozenCandidateId,
      frozenPolicyHash: options.gate.frozenPolicyHash,
      access: options.gate.access,
    }) !== options.gate.gateHash ||
    !Number.isFinite(Date.parse(options.recordedAt))
  )
    conflict(
      "TEACHING_HOLDOUT_OUTCOME_INVALID",
      "Final holdout outcome does not match one open unused gate.",
      "finalHoldout",
    );
  return {
    ...options.ledger,
    finalHoldout: {
      gate: options.gate,
      outcome: {
        resultHash: options.resultHash,
        passed: options.passed,
        recordedAt: new Date(options.recordedAt).toISOString(),
        retuneAllowed: false,
      },
    },
  };
}
