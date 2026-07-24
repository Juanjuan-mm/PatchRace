import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalHash,
  type DiagnosisCategory,
  type DiagnosisFindingV1,
  type ReflectedDiagnosisV1,
  type ReflectionEvidenceBundleV1,
  type RuleDiagnosisV1,
} from "@patchrace/contracts";

const categories = new Set<DiagnosisCategory>([
  "discovery",
  "context",
  "workflow",
  "tool",
  "verification",
  "capability",
  "unknown",
]);

export interface ReflectionProviderInput {
  readonly schemaVersion: "1.0.0";
  readonly instruction: string;
  readonly deterministicFacts: RuleDiagnosisV1["deterministicFacts"];
  readonly deterministicFindingSummaries: readonly {
    readonly id: string;
    readonly category: DiagnosisCategory;
    readonly claim: string;
  }[];
  readonly evidence: ReflectionEvidenceBundleV1;
  readonly maxHypotheses: number;
}

export interface ReflectionProvider {
  readonly id: string;
  readonly version: string;
  readonly model: string | null;
  reflect(
    input: ReflectionProviderInput,
    signal: AbortSignal,
  ): Promise<unknown>;
}

interface ProviderHypothesis {
  readonly category: DiagnosisCategory;
  readonly claim: string;
  readonly evidenceIds: readonly string[];
  readonly alternatives: readonly string[];
  readonly limitations: readonly string[];
}

function strictObject(
  value: unknown,
  allowedKeys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new PatchRaceError({
      code: "REFLECTION_OUTPUT_SCHEMA_INVALID",
      category: "EXECUTION",
      message: `Reflection output must contain an object at ${path}.`,
      path,
    });
  const object = value as Record<string, unknown>;
  const unknown = Object.keys(object).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (unknown.length > 0)
    throw new PatchRaceError({
      code: "REFLECTION_OUTPUT_SCHEMA_INVALID",
      category: "EXECUTION",
      message: `Reflection output contains unsupported fields at ${path}.`,
      path: `${path}.${unknown[0]}`,
    });
  return object;
}

function stringArray(
  value: unknown,
  path: string,
  maximum: number,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length > maximum ||
    value.some(
      (item) =>
        typeof item !== "string" || item.length === 0 || item.length > 500,
    )
  )
    throw new PatchRaceError({
      code: "REFLECTION_OUTPUT_SCHEMA_INVALID",
      category: "EXECUTION",
      message: `Reflection output has an invalid string list at ${path}.`,
      path,
    });
  return value as readonly string[];
}

function parseHypotheses(
  value: unknown,
  evidenceIds: ReadonlySet<string>,
  maxHypotheses: number,
): readonly ProviderHypothesis[] {
  const root = strictObject(value, ["hypotheses"], "reflection");
  const hypotheses = root["hypotheses"];
  if (!Array.isArray(hypotheses) || hypotheses.length > maxHypotheses)
    throw new PatchRaceError({
      code: "REFLECTION_OUTPUT_SCHEMA_INVALID",
      category: "EXECUTION",
      message:
        "Reflection output hypotheses must be an array within the configured bound.",
      path: "reflection.hypotheses",
    });
  return hypotheses.map((raw, index) => {
    const path = `reflection.hypotheses.${index}`;
    const hypothesis = strictObject(
      raw,
      ["category", "claim", "evidenceIds", "alternatives", "limitations"],
      path,
    );
    if (
      typeof hypothesis["category"] !== "string" ||
      !categories.has(hypothesis["category"] as DiagnosisCategory)
    )
      throw new PatchRaceError({
        code: "REFLECTION_OUTPUT_SCHEMA_INVALID",
        category: "EXECUTION",
        message: `Reflection output has an invalid category at ${path}.`,
        path: `${path}.category`,
      });
    if (
      typeof hypothesis["claim"] !== "string" ||
      hypothesis["claim"].length === 0 ||
      hypothesis["claim"].length > 1_000
    )
      throw new PatchRaceError({
        code: "REFLECTION_OUTPUT_SCHEMA_INVALID",
        category: "EXECUTION",
        message: `Reflection output has an invalid claim at ${path}.`,
        path: `${path}.claim`,
      });
    const selectedEvidence = stringArray(
      hypothesis["evidenceIds"],
      `${path}.evidenceIds`,
      20,
    );
    if (
      selectedEvidence.length === 0 ||
      selectedEvidence.some((id) => !evidenceIds.has(id))
    )
      throw new PatchRaceError({
        code: "REFLECTION_EVIDENCE_REFERENCE_INVALID",
        category: "EXECUTION",
        message:
          "Reflection hypotheses must cite only evidence IDs from the redacted input bundle.",
        path: `${path}.evidenceIds`,
      });
    return {
      category: hypothesis["category"] as DiagnosisCategory,
      claim: hypothesis["claim"],
      evidenceIds: selectedEvidence,
      alternatives: stringArray(
        hypothesis["alternatives"],
        `${path}.alternatives`,
        10,
      ),
      limitations: stringArray(
        hypothesis["limitations"],
        `${path}.limitations`,
        10,
      ),
    };
  });
}

export async function reflectDiagnosis(options: {
  readonly deterministic: RuleDiagnosisV1;
  readonly evidence: ReflectionEvidenceBundleV1;
  readonly provider: ReflectionProvider;
  readonly signal: AbortSignal;
  readonly maxHypotheses?: number;
}): Promise<ReflectedDiagnosisV1> {
  const maxHypotheses = options.maxHypotheses ?? 3;
  if (
    !Number.isInteger(maxHypotheses) ||
    maxHypotheses < 0 ||
    maxHypotheses > 10
  )
    throw new PatchRaceError({
      code: "REFLECTION_HYPOTHESIS_BOUND_INVALID",
      category: "CONFIG",
      message: "Reflection maxHypotheses must be an integer from zero to ten.",
      path: "maxHypotheses",
    });
  if (
    options.evidence.redaction !== "redacted" ||
    options.evidence.items.length === 0 ||
    new Set(options.evidence.items.map((item) => item.id)).size !==
      options.evidence.items.length
  )
    throw new PatchRaceError({
      code: "REFLECTION_REDACTED_EVIDENCE_REQUIRED",
      category: "SAFETY",
      message:
        "Reflection requires a non-empty explicitly redacted evidence bundle with unique IDs.",
      path: "evidence",
    });
  const input: ReflectionProviderInput = {
    schemaVersion: SCHEMA_VERSION,
    instruction:
      "Return bounded hypotheses from only the supplied redacted observable evidence. Do not alter deterministic facts, infer hidden reasoning, or claim unsupported actions.",
    deterministicFacts: options.deterministic.deterministicFacts,
    deterministicFindingSummaries: options.deterministic.findings.map(
      ({ id, category, claim }) => ({ id, category, claim }),
    ),
    evidence: options.evidence,
    maxHypotheses,
  };
  const raw = await options.provider.reflect(input, options.signal);
  const parsed = parseHypotheses(
    raw,
    new Set(options.evidence.items.map((item) => item.id)),
    maxHypotheses,
  );
  const items = new Map(options.evidence.items.map((item) => [item.id, item]));
  const hypotheses: DiagnosisFindingV1[] = parsed.map((hypothesis) => {
    const evidence = hypothesis.evidenceIds.map(
      (id) => items.get(id)!.citation,
    );
    const id = canonicalHash({
      provider: {
        id: options.provider.id,
        version: options.provider.version,
        model: options.provider.model,
      },
      category: hypothesis.category,
      claim: hypothesis.claim,
      evidence,
    }).slice("sha256:".length, "sha256:".length + 16);
    return {
      schemaVersion: SCHEMA_VERSION,
      id: `diag_reflect_${id}`,
      category: hypothesis.category,
      confidence: "low",
      claim: hypothesis.claim,
      evidence,
      alternatives: hypothesis.alternatives.map((claim) => ({ claim })),
      eligibleMutationTargets: [],
      limitations: [
        "optional_reflection_hypothesis",
        "requires_deterministic_corroboration_before_mutation",
        ...hypothesis.limitations,
      ],
      origin: "reflection",
      ruleId: null,
    };
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    reflectionSchemaVersion: "1.0.0",
    deterministic: options.deterministic,
    hypotheses,
    provider: {
      id: options.provider.id,
      version: options.provider.version,
      model: options.provider.model,
    },
    inputHash: canonicalHash(input),
    limitations: [
      "reflection_cannot_override_deterministic_facts_or_findings",
      "reflection_received_only_the_recorded_redacted_bundle",
      ...options.evidence.limitations,
    ],
  };
}
