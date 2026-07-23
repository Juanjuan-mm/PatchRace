import {
  PatchRaceError,
  canonicalHash,
  canonicalJson,
  type DiagnosisFindingV1,
  type DiagnosisMutationRouteV1,
  type EvidenceCitationV1,
  type GapClassificationV1,
  type RuleDiagnosisV1,
} from "@patchrace/contracts";

export interface RouteDiagnosisOptions {
  readonly deterministic: RuleDiagnosisV1;
  readonly classification: GapClassificationV1;
  readonly invokedWorkflow?: {
    readonly name: string;
    readonly evidence: readonly EvidenceCitationV1[];
  };
}

function dedupeEvidence(
  values: readonly EvidenceCitationV1[],
): readonly EvidenceCitationV1[] {
  return [
    ...new Map(values.map((value) => [canonicalJson(value), value])).entries(),
  ]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

function route(
  value: Omit<
    DiagnosisMutationRouteV1,
    "schemaVersion" | "routeSchemaVersion" | "id"
  >,
): DiagnosisMutationRouteV1 {
  const identity = canonicalHash(value).slice(
    "sha256:".length,
    "sha256:".length + 16,
  );
  return {
    schemaVersion: "1.0.0",
    routeSchemaVersion: "1.0.0",
    id: `route_${identity}`,
    ...value,
  };
}

function actionable(
  finding: DiagnosisFindingV1,
  classification: GapClassificationV1,
): boolean {
  return (
    finding.origin === "deterministic-rule" &&
    finding.confidence === "high" &&
    finding.evidence.length > 0 &&
    classification.classification === "workflow-or-configuration-gap" &&
    classification.recommendation === "consider-project-workflow-mutation" &&
    classification.sourceFindingIds.includes(finding.id)
  );
}

function candidateRoute(
  finding: DiagnosisFindingV1,
  options: RouteDiagnosisOptions,
): DiagnosisMutationRouteV1 | null {
  if (finding.category === "context") {
    if (!finding.eligibleMutationTargets.includes("agents-guidance"))
      return null;
    return route({
      disposition: "candidate",
      mutationType: "agents-guidance",
      recommendationKind: null,
      sourceFindingIds: [finding.id],
      evidence: dedupeEvidence(finding.evidence),
      rationale: [
        "stable_project_constraint_belongs_in_project_guidance",
        "narrower_repeatable_workflow_not_observed",
      ],
      invokedWorkflow: null,
      limitations: finding.limitations,
    });
  }
  if (["discovery", "workflow", "verification"].includes(finding.category)) {
    const invoked = options.invokedWorkflow;
    if (
      invoked !== undefined &&
      invoked.name.trim().length > 0 &&
      invoked.evidence.length > 0 &&
      finding.eligibleMutationTargets.includes("prompt-template")
    )
      return route({
        disposition: "candidate",
        mutationType: "prompt-template",
        recommendationKind: null,
        sourceFindingIds: [finding.id],
        evidence: dedupeEvidence([...finding.evidence, ...invoked.evidence]),
        rationale: [
          "repeatable_workflow_was_explicitly_invoked",
          "prompt_template_requires_user_invocation",
        ],
        invokedWorkflow: invoked.name.trim(),
        limitations: finding.limitations,
      });
    if (!finding.eligibleMutationTargets.includes("skill")) return null;
    return route({
      disposition: "candidate",
      mutationType: "skill",
      recommendationKind: null,
      sourceFindingIds: [finding.id],
      evidence: dedupeEvidence(finding.evidence),
      rationale: [
        "repeatable_procedure_supported_by_deterministic_evidence",
        "skill_is_narrower_than_repository_wide_guidance",
      ],
      invokedWorkflow: null,
      limitations: finding.limitations,
    });
  }
  if (finding.category === "tool")
    return route({
      disposition: "recommendation",
      mutationType: null,
      recommendationKind: "manual-tool",
      sourceFindingIds: [finding.id],
      evidence: dedupeEvidence(finding.evidence),
      rationale: [
        "observable_tool_failure_requires_manual_readiness_review",
        "package_installation_and_credentials_are_not_mutation_targets",
      ],
      invokedWorkflow: null,
      limitations: [
        ...finding.limitations,
        "recommendation_does_not_install_or_authenticate_tools",
      ],
    });
  return null;
}

export function routeDiagnosisToMutation(
  options: RouteDiagnosisOptions,
): readonly DiagnosisMutationRouteV1[] {
  if (options.deterministic.trialId !== options.classification.trialId)
    throw new PatchRaceError({
      code: "MUTATION_ROUTE_TRIAL_MISMATCH",
      category: "CONFLICT",
      message: "Diagnosis and classification refer to different trials.",
      path: "classification.trialId",
    });
  if (options.classification.classification === "likely-model-capability-gap")
    return [
      route({
        disposition: "recommendation",
        mutationType: null,
        recommendationKind: "model-advice",
        sourceFindingIds: options.classification.sourceFindingIds,
        evidence: dedupeEvidence(options.classification.evidence),
        rationale: [
          "controlled_evidence_indicates_likely_model_capability",
          "configuration_mutation_is_prohibited",
        ],
        invokedWorkflow: null,
        limitations: options.classification.limitations,
      }),
    ];
  if (
    options.deterministic.deterministicFacts.integrity !== "valid" ||
    options.classification.classification === "insufficient-evidence"
  )
    return [
      route({
        disposition: "no-candidate",
        mutationType: null,
        recommendationKind: null,
        sourceFindingIds: options.classification.sourceFindingIds,
        evidence: dedupeEvidence(options.classification.evidence),
        rationale: [
          options.deterministic.deterministicFacts.integrity !== "valid"
            ? "deterministic_integrity_not_valid"
            : "insufficient_evidence_has_no_mutation_authority",
        ],
        invokedWorkflow: null,
        limitations: options.classification.limitations,
      }),
    ];

  const routes = options.deterministic.findings
    .filter((finding) => actionable(finding, options.classification))
    .map((finding) => candidateRoute(finding, options))
    .filter((value): value is DiagnosisMutationRouteV1 => value !== null);
  return routes.length > 0
    ? routes
    : [
        route({
          disposition: "no-candidate",
          mutationType: null,
          recommendationKind: null,
          sourceFindingIds: options.classification.sourceFindingIds,
          evidence: dedupeEvidence(options.classification.evidence),
          rationale: ["no_safe_supported_route"],
          invokedWorkflow: null,
          limitations: [
            ...options.classification.limitations,
            "unsupported_or_non_actionable_diagnosis_category",
          ],
        }),
      ];
}
