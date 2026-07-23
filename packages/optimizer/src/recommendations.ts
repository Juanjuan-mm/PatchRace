import {
  PatchRaceError,
  canonicalHash,
  canonicalJson,
  type DiagnosisMutationRouteV1,
  type PiRecommendationV1,
} from "@patchrace/contracts";

type RecommendationValues = Readonly<
  Record<string, string | number | boolean | null>
>;

const allowedSettingKeys = new Set([
  "maxContextTokens",
  "model",
  "resourceSelection",
  "thinkingLevel",
]);
const forbidden =
  /api[_-]?key|access[_-]?token|secret|password|credential|(?:npm|pnpm|yarn|pip|brew)\s+(?:install|add)|curl\s|wget\s|hook|extension|package/iu;

function fail(code: string, message: string, path: string): never {
  throw new PatchRaceError({ code, category: "CONFIG", message, path });
}

function assertSafeValues(values: RecommendationValues, path: string): void {
  for (const [key, value] of Object.entries(values)) {
    if (
      !allowedSettingKeys.has(key) ||
      forbidden.test(key) ||
      (typeof value === "string" &&
        (value.length > 160 || forbidden.test(value) || value.includes("\n")))
    )
      fail(
        "RECOMMENDATION_VALUE_FORBIDDEN",
        "Recommendation contains a forbidden or unbounded setting.",
        `${path}.${key}`,
      );
  }
}

function diff(
  before: RecommendationValues,
  proposed: RecommendationValues,
): string {
  return `--- before.json\n+++ proposed.json\n-${canonicalJson(before)}\n+${canonicalJson(proposed)}\n`;
}

function recommendation(
  value: Omit<
    PiRecommendationV1,
    | "schemaVersion"
    | "recommendationSchemaVersion"
    | "recommendationId"
    | "manualOnly"
    | "autoActions"
  >,
): PiRecommendationV1 {
  const identity = canonicalHash(value).slice(
    "sha256:".length,
    "sha256:".length + 20,
  );
  return {
    schemaVersion: "1.0.0",
    recommendationSchemaVersion: "1.0.0",
    recommendationId: `recommendation_${identity}`,
    ...value,
    manualOnly: true,
    autoActions: [],
  };
}

function assertRoute(
  route: DiagnosisMutationRouteV1,
  expected:
    | { readonly disposition: "candidate"; readonly mutationType: "settings" }
    | {
        readonly disposition: "recommendation";
        readonly recommendationKind: "manual-tool" | "model-advice";
      },
): void {
  if (
    route.evidence.length === 0 ||
    route.disposition !== expected.disposition ||
    ("mutationType" in expected &&
      route.mutationType !== expected.mutationType) ||
    ("recommendationKind" in expected &&
      route.recommendationKind !== expected.recommendationKind)
  )
    fail(
      "RECOMMENDATION_ROUTE_INELIGIBLE",
      "Recommendation requires a matching cited route.",
      "route",
    );
}

export function generateSettingsRecommendation(options: {
  readonly route: DiagnosisMutationRouteV1;
  readonly before: RecommendationValues;
  readonly proposed: RecommendationValues;
}): PiRecommendationV1 {
  assertRoute(options.route, {
    disposition: "candidate",
    mutationType: "settings",
  });
  assertSafeValues(options.before, "before");
  assertSafeValues(options.proposed, "proposed");
  if (canonicalJson(options.before) === canonicalJson(options.proposed))
    fail(
      "RECOMMENDATION_NO_CHANGE",
      "Settings recommendation must contain a visible change.",
      "proposed",
    );
  return recommendation({
    kind: "settings",
    routeId: options.route.id,
    title: "Review project-local Pi settings change",
    before: options.before,
    proposed: options.proposed,
    canonicalDiff: diff(options.before, options.proposed),
    evidence: options.route.evidence,
    capabilityAware: false,
    warnings: [
      "manual_review_required",
      "project_local_candidate_only",
      "authentication_package_extension_keys_forbidden",
    ],
  });
}

export function generateModelRecommendation(options: {
  readonly route: DiagnosisMutationRouteV1;
  readonly currentModel: string | null;
  readonly proposedModel: string;
}): PiRecommendationV1 {
  assertRoute(options.route, {
    disposition: "recommendation",
    recommendationKind: "model-advice",
  });
  if (
    options.proposedModel.trim().length === 0 ||
    options.proposedModel.length > 120 ||
    options.proposedModel.includes("\n") ||
    forbidden.test(options.proposedModel) ||
    options.currentModel === options.proposedModel
  )
    fail(
      "MODEL_RECOMMENDATION_INVALID",
      "Model recommendation must be a bounded visible change.",
      "proposedModel",
    );
  const before = { model: options.currentModel };
  const proposed = { model: options.proposedModel };
  return recommendation({
    kind: "model",
    routeId: options.route.id,
    title: "Consider a controlled model-only comparison",
    before,
    proposed,
    canonicalDiff: diff(before, proposed),
    evidence: options.route.evidence,
    capabilityAware: true,
    warnings: [
      "likely_capability_not_proven",
      "manual_selection_only",
      "revalidate_on_same_task_adapter_harness_and_workflow",
    ],
  });
}

export function generateToolRecommendation(options: {
  readonly route: DiagnosisMutationRouteV1;
  readonly tool: string;
  readonly readiness: "missing" | "expired" | "unknown";
  readonly manualAction: string;
}): PiRecommendationV1 {
  assertRoute(options.route, {
    disposition: "recommendation",
    recommendationKind: "manual-tool",
  });
  const tool = options.tool.trim();
  const action = options.manualAction.trim();
  if (
    !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/u.test(tool) ||
    action.length < 12 ||
    action.length > 200 ||
    action.includes("\n") ||
    forbidden.test(action) ||
    /[`$;&|<>]/u.test(action)
  )
    fail(
      "TOOL_RECOMMENDATION_INVALID",
      "Tool recommendation must be bounded inert prose without install/auth payloads.",
      "manualAction",
    );
  const before = { readiness: options.readiness };
  const proposed = { readiness: "review-required", action };
  return recommendation({
    kind: "tool",
    routeId: options.route.id,
    title: `Review ${tool} readiness`,
    before,
    proposed,
    canonicalDiff: diff(before, proposed),
    evidence: options.route.evidence,
    capabilityAware: false,
    warnings: [
      "manual_readiness_review_only",
      "no_installation_or_authentication_was_performed",
      "credential_values_must_not_be_recorded",
    ],
  });
}
