import {
  PatchRaceError,
  SCHEMA_VERSION,
  type DiagnosisCategory,
  type DiagnosisFindingV1,
  type DiagnosisQualityReportV1,
  type LabeledDiagnosisCaseV1,
} from "@patchrace/contracts";

import { FAILURE_CATEGORIES } from "./taxonomy.js";

function unsafeReasons(finding: DiagnosisFindingV1): readonly string[] {
  return [
    ...(finding.evidence.length === 0 ? ["missing_evidence"] : []),
    ...(finding.alternatives.length === 0 ? ["missing_alternative"] : []),
    ...(finding.origin === "reflection" && finding.confidence !== "low"
      ? ["reflection_confidence_elevated"]
      : []),
    ...(finding.origin === "reflection" &&
    finding.eligibleMutationTargets.length > 0
      ? ["reflection_mutation_authority"]
      : []),
    ...(["capability", "unknown"].includes(finding.category) &&
    finding.eligibleMutationTargets.length > 0
      ? ["non_actionable_category_has_mutation_target"]
      : []),
    ...(finding.category === "capability" && finding.confidence === "high"
      ? ["capability_claim_overconfident"]
      : []),
  ];
}

export function evaluateDiagnosisQuality(
  cases: readonly LabeledDiagnosisCaseV1[],
  thresholds: {
    readonly minimumCases?: number;
    readonly minimumHighConfidencePrecision?: number;
  } = {},
): DiagnosisQualityReportV1 {
  const minimumCases = thresholds.minimumCases ?? 20;
  const minimumHighConfidencePrecision =
    thresholds.minimumHighConfidencePrecision ?? 0.8;
  if (
    !Number.isInteger(minimumCases) ||
    minimumCases <= 0 ||
    minimumHighConfidencePrecision < 0 ||
    minimumHighConfidencePrecision > 1 ||
    new Set(cases.map((item) => item.id)).size !== cases.length
  )
    throw new PatchRaceError({
      code: "DIAGNOSIS_QUALITY_INPUT_INVALID",
      category: "CONFIG",
      message:
        "Diagnosis quality thresholds and labeled case IDs must be valid and unique.",
      path: "quality",
    });
  const high = cases.flatMap((item) =>
    item.findings
      .filter(
        (finding) =>
          finding.origin === "deterministic-rule" &&
          finding.confidence === "high",
      )
      .map((finding) => ({ item, finding })),
  );
  const correct = high.filter(
    ({ item, finding }) => finding.category === item.expectedCategory,
  );
  const correctCases = new Set(correct.map(({ item }) => item.id));
  const unclassifiedCaseIds = cases
    .filter((item) => !correctCases.has(item.id))
    .map((item) => item.id)
    .sort();
  const falsePositives = high
    .filter(({ item, finding }) => finding.category !== item.expectedCategory)
    .map(({ item, finding }) => ({
      caseId: item.id,
      expected: item.expectedCategory,
      predicted: finding.category,
      findingId: finding.id,
    }))
    .sort(
      (left, right) =>
        left.caseId.localeCompare(right.caseId) ||
        left.findingId.localeCompare(right.findingId),
    );
  const unsafeOrSpeculative = cases
    .flatMap((item) =>
      item.findings.flatMap((finding) => {
        const reasons = unsafeReasons(finding);
        return reasons.length === 0
          ? []
          : [{ caseId: item.id, findingId: finding.id, reasons }];
      }),
    )
    .sort(
      (left, right) =>
        left.caseId.localeCompare(right.caseId) ||
        left.findingId.localeCompare(right.findingId),
    );
  const highConfidencePrecision =
    high.length === 0 ? null : correct.length / high.length;
  const coveredCategories = new Set(cases.map((item) => item.expectedCategory));
  const failures = [
    ...(cases.length < minimumCases ? ["minimum_labeled_cases_not_met"] : []),
    ...(FAILURE_CATEGORIES.some((category) => !coveredCategories.has(category))
      ? ["not_all_taxonomy_categories_covered"]
      : []),
    ...(highConfidencePrecision === null ||
    highConfidencePrecision < minimumHighConfidencePrecision
      ? ["high_confidence_precision_below_threshold"]
      : []),
    ...(unsafeOrSpeculative.length > 0
      ? ["unsafe_or_speculative_findings_present"]
      : []),
  ];
  return {
    schemaVersion: SCHEMA_VERSION,
    qualitySchemaVersion: "1.0.0",
    thresholds: { minimumCases, minimumHighConfidencePrecision },
    totals: {
      labeledCases: cases.length,
      highConfidencePredictions: high.length,
      correctHighConfidencePredictions: correct.length,
      casesWithCorrectHighConfidencePrediction: correctCases.size,
      unclassifiedCases: unclassifiedCaseIds.length,
    },
    highConfidencePrecision,
    caseCoverage: cases.length === 0 ? 0 : correctCases.size / cases.length,
    categories: FAILURE_CATEGORIES.map((category: DiagnosisCategory) => ({
      category,
      support: cases.filter((item) => item.expectedCategory === category)
        .length,
      correctHighConfidenceCases: new Set(
        correct
          .filter(({ item }) => item.expectedCategory === category)
          .map(({ item }) => item.id),
      ).size,
    })),
    falsePositives,
    unclassifiedCaseIds,
    unsafeOrSpeculative,
    passed: failures.length === 0,
    failures,
  };
}
