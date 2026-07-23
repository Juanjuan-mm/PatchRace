import {
  SCHEMA_VERSION,
  canonicalHash,
  type DiagnosisCategory,
  type DiagnosisFindingV1,
  type DiagnosisMutationTarget,
  type EvidenceCitationV1,
  type RaceTrialResultV1,
  type RuleDiagnosisV1,
  type TraceEventV1,
  type TrajectoryFeaturesV1,
} from "@patchrace/contracts";

export interface DiagnoseRulesOptions {
  readonly features: TrajectoryFeaturesV1;
  readonly events: readonly TraceEventV1[];
  readonly result: RaceTrialResultV1;
  readonly grade: {
    readonly runId: string;
    readonly artifactHash: `sha256:${string}`;
    readonly logicalPath: string;
  };
}

interface FindingInput {
  readonly category: DiagnosisCategory;
  readonly confidence: DiagnosisFindingV1["confidence"];
  readonly claim: string;
  readonly eventIds?: readonly string[];
  readonly gateIds?: readonly string[];
  readonly alternatives: DiagnosisFindingV1["alternatives"];
  readonly targets: readonly DiagnosisMutationTarget[];
  readonly limitations?: readonly string[];
  readonly ruleId: string;
}

function citation(
  options: DiagnoseRulesOptions,
  eventIds: readonly string[] = [],
  gateIds: readonly string[] = [],
): readonly EvidenceCitationV1[] {
  return [
    ...(eventIds.length === 0
      ? []
      : [
          {
            ...options.features.trace,
            eventIds,
          },
        ]),
    ...(gateIds.length === 0
      ? []
      : [
          {
            runId: options.grade.runId,
            trialId: options.result.trialId,
            artifactHash: options.grade.artifactHash,
            logicalPath: options.grade.logicalPath,
            gradeGateIds: gateIds,
          },
        ]),
  ];
}

function finding(
  options: DiagnoseRulesOptions,
  input: FindingInput,
): DiagnosisFindingV1 {
  const evidence = citation(options, input.eventIds ?? [], input.gateIds ?? []);
  const identity = canonicalHash({
    trialId: options.result.trialId,
    ruleId: input.ruleId,
    category: input.category,
    evidence,
  }).slice("sha256:".length, "sha256:".length + 16);
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `diag_${identity}`,
    category: input.category,
    confidence: input.confidence,
    claim: input.claim,
    evidence,
    alternatives: input.alternatives,
    eligibleMutationTargets: input.targets,
    limitations: [...new Set(input.limitations ?? [])].sort(),
    origin: "deterministic-rule",
    ruleId: input.ruleId,
  };
}

function isToolError(event: TraceEventV1): boolean {
  if (event.type !== "error.observed") return false;
  const category = event.data["category"];
  const code = event.data["code"];
  return (
    (typeof category === "string" &&
      ["tool", "adapter", "parser", "spawn", "command"].includes(
        category.toLowerCase(),
      )) ||
    (typeof code === "string" &&
      /(spawn|tool|parser|executable|command_not_found)/i.test(code))
  );
}

function isConstraintGate(id: string): boolean {
  return /^(?:assertion:)?(?:instruction|constraint|required|forbidden|protected)(?:[:._-]|$)/i.test(
    id,
  );
}

export function diagnoseWithRules(
  options: DiagnoseRulesOptions,
): RuleDiagnosisV1 {
  const failedGates = options.result.hardGates.filter(
    (gate) => gate.status === "failed",
  );
  const invalidGates = options.result.hardGates.filter(
    (gate) => gate.status === "error" || gate.status === "unavailable",
  );
  const findings: DiagnosisFindingV1[] = [];
  if (
    options.result.integrity !== "valid" ||
    options.result.outcome === "unavailable" ||
    invalidGates.length > 0
  ) {
    findings.push(
      finding(options, {
        category: "unknown",
        confidence: "high",
        claim:
          "The trial cannot support a narrower Agent failure diagnosis because integrity, outcome, or required deterministic gate evidence is unavailable.",
        eventIds: options.features.trace.eventIds ?? [],
        gateIds: invalidGates.map((gate) => gate.id),
        alternatives: [
          {
            claim:
              "The apparent failure may be grader or evidence infrastructure rather than Agent behavior.",
          },
        ],
        targets: [],
        limitations: [
          `integrity_${options.result.integrity}`,
          `outcome_${options.result.outcome}`,
        ],
        ruleId: "invalid-or-unavailable-evidence-v1",
      }),
    );
    return {
      schemaVersion: SCHEMA_VERSION,
      diagnosisSchemaVersion: "1.0.0",
      trialId: options.result.trialId,
      deterministicFacts: {
        integrity: options.result.integrity,
        outcome: options.result.outcome,
        hardGates: options.result.hardGates.map(({ id, status }) => ({
          id,
          status,
        })),
      },
      findings,
      limitations: [
        ...options.features.limitations,
        "narrow_rules_suppressed_by_invalid_or_unavailable_evidence",
      ],
    };
  }

  const toolErrors = options.events.filter(isToolError);
  if (toolErrors.length > 0)
    findings.push(
      finding(options, {
        category: "tool",
        confidence: "high",
        claim: `${toolErrors.length} observable operational tool or adapter error${toolErrors.length === 1 ? " was" : "s were"} recorded.`,
        eventIds: toolErrors.map((event) => event.eventId),
        alternatives: [
          {
            claim:
              "A repository command may itself be invalid; inspect the cited raw error before changing tool configuration.",
          },
        ],
        targets: ["settings", "resource-selection"],
        ruleId: "observable-tool-error-v1",
      }),
    );

  const testGateIds = failedGates
    .filter((gate) => /test|build|lint|typecheck/i.test(gate.id))
    .map((gate) => gate.id);
  const tests = options.features.testOrder.value;
  const edits = options.events.filter(
    (event) =>
      event.type === "edit.completed" &&
      (event.availability === "observed" || event.availability === "derived"),
  );
  const completedTests = options.events.filter(
    (event) =>
      (event.type === "test.completed" || event.type === "test.failed") &&
      (event.availability === "observed" || event.availability === "derived"),
  );
  const lastEdit = edits.at(-1);
  const lastTest = completedTests.at(-1);
  if (
    testGateIds.length > 0 &&
    options.features.testOrder.availability === "derived" &&
    tests?.length === 0
  )
    findings.push(
      finding(options, {
        category: "verification",
        confidence: "high",
        claim:
          "No test completion was observed on a declared observable test lane before a deterministic test-related gate failed.",
        gateIds: testGateIds,
        alternatives: [
          {
            claim:
              "A validation command may exist outside the normalized test lane; confirm adapter mapping before mutation.",
          },
        ],
        targets: ["agents-guidance", "skill", "prompt-template"],
        ruleId: "missing-observed-verification-v1",
      }),
    );
  else if (
    testGateIds.length > 0 &&
    lastEdit !== undefined &&
    lastTest !== undefined &&
    lastEdit.sequence > lastTest.sequence
  )
    findings.push(
      finding(options, {
        category: "verification",
        confidence: "high",
        claim:
          "The final observable edit occurred after the last completed test, and a deterministic test-related gate failed.",
        eventIds: [lastTest.eventId, lastEdit.eventId],
        gateIds: testGateIds,
        alternatives: [
          {
            claim:
              "The final edit may be unrelated to the failed gate; inspect the cited patch and test evidence.",
          },
        ],
        targets: ["agents-guidance", "skill", "prompt-template"],
        ruleId: "stale-final-verification-v1",
      }),
    );

  const coverage = options.features.fileCoverage.value;
  const loops = options.features.searchLoops.value;
  if (
    options.features.traceCompleteness === "complete" &&
    coverage !== null &&
    coverage.ratio < 1 &&
    loops !== null &&
    loops.length > 0
  )
    findings.push(
      finding(options, {
        category: "discovery",
        confidence: "high",
        claim: `Observable search repeated while only ${coverage.observedRelevantPaths.length}/${coverage.relevantPathCount} declared relevant paths were inspected.`,
        eventIds: [
          ...options.features.fileCoverage.evidenceEventIds,
          ...loops.flatMap((loop) => loop.eventIds),
        ],
        alternatives: [
          {
            claim:
              "The uninspected declared path may not be necessary for this particular solution.",
          },
        ],
        targets: ["agents-guidance", "skill", "prompt-template"],
        ruleId: "search-loop-low-relevant-coverage-v1",
      }),
    );

  const retries = options.features.retries.value;
  const failures = options.features.commandFailures.value;
  if (
    retries !== null &&
    retries.length > 0 &&
    failures !== null &&
    failures.count > 0
  )
    findings.push(
      finding(options, {
        category: "workflow",
        confidence: "high",
        claim:
          "An observably equal command invocation was repeated while failed command evidence was present.",
        eventIds: [
          ...retries.flatMap((retry) => retry.eventIds),
          ...failures.eventIds,
        ],
        alternatives: [
          {
            claim:
              "An external transient condition may justify an identical retry; no transient state is inferred.",
          },
        ],
        targets: ["agents-guidance", "skill", "prompt-template"],
        ruleId: "unchanged-command-retry-v1",
      }),
    );

  const constraintGates = failedGates.filter((gate) =>
    isConstraintGate(gate.id),
  );
  if (constraintGates.length > 0)
    findings.push(
      finding(options, {
        category: "context",
        confidence: "high",
        claim:
          "An explicit deterministic instruction or repository-constraint gate failed.",
        gateIds: constraintGates.map((gate) => gate.id),
        alternatives: [
          {
            claim:
              "The constraint may be invalid for the task revision; validate the task contract before changing Agent context.",
          },
        ],
        targets: ["agents-guidance", "prompt-template"],
        ruleId: "explicit-constraint-gate-failure-v1",
      }),
    );

  if (findings.length === 0)
    findings.push(
      finding(options, {
        category: "unknown",
        confidence: "low",
        claim:
          "No high-confidence deterministic rule explains the recorded failure.",
        eventIds: options.features.trace.eventIds ?? [],
        gateIds: failedGates.map((gate) => gate.id),
        alternatives: [
          {
            claim:
              "A capability limitation or an unmodeled workflow issue may exist, but current evidence does not distinguish them.",
          },
        ],
        targets: [],
        limitations: [
          "insufficient_rule_support",
          ...options.features.limitations,
        ],
        ruleId: "insufficient-deterministic-evidence-v1",
      }),
    );
  return {
    schemaVersion: SCHEMA_VERSION,
    diagnosisSchemaVersion: "1.0.0",
    trialId: options.result.trialId,
    deterministicFacts: {
      integrity: options.result.integrity,
      outcome: options.result.outcome,
      hardGates: options.result.hardGates.map(({ id, status }) => ({
        id,
        status,
      })),
    },
    findings,
    limitations: [...options.features.limitations],
  };
}
