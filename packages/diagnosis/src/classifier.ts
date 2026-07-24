import {
  SCHEMA_VERSION,
  canonicalJson,
  type EvidenceCitationV1,
  type GapClassificationV1,
  type GapVariantIdentityV1,
  type RaceTrialResultV1,
  type ReflectedDiagnosisV1,
  type RuleDiagnosisV1,
} from "@patchrace/contracts";

export interface CapabilityPeerEvidence {
  readonly identity: GapVariantIdentityV1;
  readonly result: RaceTrialResultV1;
  readonly citation: EvidenceCitationV1;
}

function dedupeEvidence(
  citations: readonly EvidenceCitationV1[],
): readonly EvidenceCitationV1[] {
  const unique = new Map(
    citations.map((citation) => [canonicalJson(citation), citation]),
  );
  return [...unique.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, citation]) => citation);
}

function sameControlledIdentity(
  focus: GapVariantIdentityV1,
  peer: GapVariantIdentityV1,
): boolean {
  return (
    focus.taskHash === peer.taskHash &&
    focus.adapterId === peer.adapterId &&
    focus.harnessHash === peer.harnessHash &&
    focus.workflowHash === peer.workflowHash &&
    focus.model !== null &&
    peer.model !== null &&
    focus.model !== peer.model
  );
}

export function classifyWorkflowOrCapability(options: {
  readonly deterministic: RuleDiagnosisV1;
  readonly focusIdentity: GapVariantIdentityV1;
  readonly peers?: readonly CapabilityPeerEvidence[];
  readonly reflected?: ReflectedDiagnosisV1;
}): GapClassificationV1 {
  const actionable = options.deterministic.findings.filter(
    (finding) =>
      finding.origin === "deterministic-rule" &&
      finding.confidence === "high" &&
      ["discovery", "context", "workflow", "tool", "verification"].includes(
        finding.category,
      ) &&
      finding.eligibleMutationTargets.length > 0,
  );
  if (actionable.length > 0) {
    const targets = [
      ...new Set(
        actionable.flatMap((finding) => finding.eligibleMutationTargets),
      ),
    ].sort();
    return {
      schemaVersion: SCHEMA_VERSION,
      classificationSchemaVersion: "1.0.0",
      trialId: options.deterministic.trialId,
      classification: "workflow-or-configuration-gap",
      confidence: "high",
      recommendation: "consider-project-workflow-mutation",
      eligibleMutationTargets: targets,
      sourceFindingIds: actionable.map((finding) => finding.id).sort(),
      evidence: dedupeEvidence(
        actionable.flatMap((finding) => finding.evidence),
      ),
      reasons: [
        "high_confidence_deterministic_actionable_finding",
        "narrow_deterministic_explanation_precedes_capability",
      ],
      limitations: [
        ...(options.reflected === undefined
          ? []
          : ["reflection_did_not_change_classification"]),
      ],
    };
  }

  const peers = options.peers ?? [];
  const controlledPeers = peers.filter((peer) =>
    sameControlledIdentity(options.focusIdentity, peer.identity),
  );
  const successfulPeers = controlledPeers.filter(
    (peer) =>
      peer.result.integrity === "valid" &&
      peer.result.outcome === "passed" &&
      peer.result.hardGates.length > 0 &&
      peer.result.hardGates.every((gate) => gate.status === "passed"),
  );
  const focusEligible =
    options.deterministic.deterministicFacts.integrity === "valid" &&
    options.deterministic.deterministicFacts.outcome === "failed" &&
    options.focusIdentity.model !== null &&
    !options.deterministic.limitations.some((limitation) =>
      /trace_(?:partial|unknown)|unavailable/i.test(limitation),
    );
  if (focusEligible && successfulPeers.length >= 2)
    return {
      schemaVersion: SCHEMA_VERSION,
      classificationSchemaVersion: "1.0.0",
      trialId: options.deterministic.trialId,
      classification: "likely-model-capability-gap",
      confidence: "medium",
      recommendation: "no-configuration-mutation",
      eligibleMutationTargets: [],
      sourceFindingIds: options.deterministic.findings
        .filter((finding) => finding.category === "unknown")
        .map((finding) => finding.id)
        .sort(),
      evidence: dedupeEvidence([
        ...options.deterministic.findings.flatMap(
          (finding) => finding.evidence,
        ),
        ...successfulPeers.map((peer) => peer.citation),
      ]),
      reasons: [
        "focus_trial_valid_failure",
        "at_least_two_valid_successful_model_only_peer_trials",
        "no_high_confidence_actionable_deterministic_gap",
      ],
      limitations: [
        "capability_is_likely_not_proven",
        "classification_applies_only_to_the_recorded_task_and_variants",
        ...(options.reflected === undefined
          ? []
          : ["reflection_did_not_change_classification"]),
      ],
    };

  const reasons = [
    ...(options.deterministic.deterministicFacts.integrity !== "valid"
      ? ["focus_integrity_not_valid"]
      : []),
    ...(options.deterministic.deterministicFacts.outcome !== "failed"
      ? ["focus_outcome_not_failed"]
      : []),
    ...(options.focusIdentity.model === null
      ? ["focus_model_unavailable"]
      : []),
    ...(successfulPeers.length < 2
      ? ["fewer_than_two_valid_model_only_successful_peers"]
      : []),
    ...(controlledPeers.length < peers.length
      ? ["one_or_more_peers_confounded_or_incomparable"]
      : []),
    ...(options.deterministic.limitations.length > 0
      ? ["deterministic_evidence_has_limitations"]
      : []),
  ];
  return {
    schemaVersion: SCHEMA_VERSION,
    classificationSchemaVersion: "1.0.0",
    trialId: options.deterministic.trialId,
    classification: "insufficient-evidence",
    confidence: "low",
    recommendation: "no-configuration-mutation",
    eligibleMutationTargets: [],
    sourceFindingIds: options.deterministic.findings
      .map((finding) => finding.id)
      .sort(),
    evidence: dedupeEvidence(
      options.deterministic.findings.flatMap((finding) => finding.evidence),
    ),
    reasons:
      reasons.length === 0 ? ["no_supported_gap_classification"] : reasons,
    limitations: [
      "do_not_mutate_configuration_from_insufficient_evidence",
      ...(options.reflected === undefined
        ? []
        : ["reflection_alone_cannot_elevate_classification"]),
    ],
  };
}
