import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalJson,
  type DiagnosisArtifactEvidenceV1,
  type DiagnosisReportCaseV1,
  type DiagnosisReportV1,
  type EvidenceCitationV1,
} from "@patchrace/contracts";

function evidenceKey(citation: EvidenceCitationV1): string {
  return canonicalJson({
    trialId: citation.trialId,
    logicalPath: citation.logicalPath,
    hash: citation.artifactHash,
  });
}

function artifactKey(artifact: DiagnosisArtifactEvidenceV1): string {
  return canonicalJson({
    trialId: artifact.trialId,
    logicalPath: artifact.logicalPath,
    hash: artifact.hash,
  });
}

function validateCitation(
  citation: EvidenceCitationV1,
  runId: string,
  artifacts: ReadonlyMap<string, DiagnosisArtifactEvidenceV1>,
): void {
  if (citation.runId !== runId)
    throw new PatchRaceError({
      code: "DIAGNOSIS_REPORT_CROSS_RUN_EVIDENCE",
      category: "CONFLICT",
      message: "Diagnosis report evidence must belong to its source run.",
      path: "evidence.runId",
    });
  const artifact = artifacts.get(evidenceKey(citation));
  if (artifact === undefined)
    throw new PatchRaceError({
      code: "DIAGNOSIS_REPORT_ARTIFACT_UNRESOLVED",
      category: "CONFLICT",
      message:
        "Diagnosis report evidence does not resolve to the immutable artifact inventory.",
      path: citation.logicalPath,
    });
  if (citation.eventIds?.some((id) => !artifact.eventIds.includes(id)) === true)
    throw new PatchRaceError({
      code: "DIAGNOSIS_REPORT_EVENT_UNRESOLVED",
      category: "CONFLICT",
      message:
        "Diagnosis report evidence cites an event outside the artifact inventory.",
      path: citation.logicalPath,
    });
  if (
    citation.gradeGateIds?.some((id) => !artifact.gradeGateIds.includes(id)) ===
    true
  )
    throw new PatchRaceError({
      code: "DIAGNOSIS_REPORT_GATE_UNRESOLVED",
      category: "CONFLICT",
      message:
        "Diagnosis report evidence cites a grader gate outside the artifact inventory.",
      path: citation.logicalPath,
    });
}

function caseCitations(
  value: DiagnosisReportCaseV1,
): readonly EvidenceCitationV1[] {
  return [
    value.features.trace,
    ...value.findings.flatMap((finding) => finding.evidence),
    ...value.findings.flatMap((finding) =>
      finding.alternatives.flatMap((alternative) => alternative.evidence ?? []),
    ),
    ...value.classification.evidence,
  ];
}

export function buildDiagnosisReport(options: {
  readonly runId: string;
  readonly planHash: `sha256:${string}`;
  readonly focusVariantId: string;
  readonly cases: readonly DiagnosisReportCaseV1[];
  readonly artifacts: readonly DiagnosisArtifactEvidenceV1[];
  readonly title?: string;
}): DiagnosisReportV1 {
  if (
    options.cases.length === 0 ||
    options.cases.some(
      (item) =>
        item.variantId !== options.focusVariantId ||
        item.trialId !== item.deterministic.trialId ||
        item.trialId !== item.features.trialId ||
        item.trialId !== item.classification.trialId,
    )
  )
    throw new PatchRaceError({
      code: "DIAGNOSIS_REPORT_CASE_INVALID",
      category: "CONFLICT",
      message:
        "Diagnosis report cases must be non-empty and match the focus variant/trial facts.",
      path: "cases",
    });
  const artifacts = new Map(
    options.artifacts.map((artifact) => [artifactKey(artifact), artifact]),
  );
  if (artifacts.size !== options.artifacts.length)
    throw new PatchRaceError({
      code: "DIAGNOSIS_REPORT_ARTIFACT_DUPLICATE",
      category: "CONFLICT",
      message: "Diagnosis artifact inventory entries must be unique.",
      path: "artifacts",
    });
  for (const item of options.cases) {
    for (const finding of item.findings) {
      if (
        finding.evidence.length === 0 ||
        finding.alternatives.length === 0 ||
        (finding.origin === "reflection" &&
          (finding.confidence !== "low" ||
            finding.eligibleMutationTargets.length > 0))
      )
        throw new PatchRaceError({
          code: "DIAGNOSIS_REPORT_FINDING_INVALID",
          category: "CONFLICT",
          message:
            "Every diagnosis finding requires evidence and alternatives; reflection stays low-confidence and non-promotable.",
          path: `cases.${item.trialId}.findings.${finding.id}`,
        });
    }
    if (
      item.classification.recommendation === "no-configuration-mutation" &&
      item.classification.eligibleMutationTargets.length > 0
    )
      throw new PatchRaceError({
        code: "DIAGNOSIS_REPORT_MUTATION_CONFLICT",
        category: "CONFLICT",
        message:
          "A no-configuration-mutation classification cannot expose mutation targets.",
        path: `cases.${item.trialId}.classification`,
      });
    for (const citation of caseCitations(item))
      validateCitation(citation, options.runId, artifacts);
  }
  const cases = [...options.cases].sort(
    (left, right) =>
      left.taskId.localeCompare(right.taskId) ||
      left.trialId.localeCompare(right.trialId),
  );
  const caveats = [
    "diagnosis_uses_observable_evidence_not_hidden_reasoning",
    "deterministic_facts_and_hard_gates_remain_authoritative",
    "findings_apply_only_to_the_recorded_task_variants_and_evidence",
    ...new Set(
      cases.flatMap((item) => [
        ...item.deterministic.limitations,
        ...item.classification.limitations,
        ...item.findings.flatMap((finding) => finding.limitations),
      ]),
    ),
  ].sort();
  return {
    schemaVersion: SCHEMA_VERSION,
    reportSchemaVersion: "1.0.0",
    source: {
      runId: options.runId,
      planHash: options.planHash,
      artifacts: [...options.artifacts].sort(
        (left, right) =>
          left.logicalPath.localeCompare(right.logicalPath) ||
          left.trialId.localeCompare(right.trialId),
      ),
    },
    overview: {
      title: options.title ?? "PatchRace evidence-linked diagnosis",
      focusVariantId: options.focusVariantId,
      caseCount: cases.length,
      findingCount: cases.reduce(
        (total, item) => total + item.findings.length,
        0,
      ),
      claimBoundary:
        "This diagnosis explains only the cited observable events, artifacts, deterministic grader facts, tasks, and variants; it does not reveal hidden reasoning or establish a universal model capability claim.",
    },
    cases,
    caveats,
  };
}
