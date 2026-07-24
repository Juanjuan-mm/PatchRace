import type { ContentHash } from "./task.js";
import type { HoldoutAccessV1, OptimizationSplitViewV1 } from "./split.js";
import type {
  DiagnosisMutationTarget,
  EvidenceCitationV1,
} from "./diagnosis.js";

export type PiResourceKind =
  | "agents-guidance"
  | "skill"
  | "prompt-template"
  | "settings"
  | "extension"
  | "package";

export type PiResourceOrigin = "project" | "global";

export interface PiResourceRecordV1 {
  readonly schemaVersion: "1.0.0";
  readonly id: string;
  readonly kind: PiResourceKind;
  readonly origin: PiResourceOrigin;
  readonly logicalPath: string;
  readonly name: string;
  readonly hash: ContentHash;
  readonly byteCount: number;
  readonly estimatedContextTokens: number;
  readonly precedence: number;
  readonly status: "active" | "shadowed" | "informational";
  readonly shadowedBy: string | null;
}

export type PiResourceLintCode =
  | "context-bloat"
  | "duplicate-resource"
  | "settings-conflict"
  | "invalid-settings"
  | "invalid-skill-frontmatter"
  | "secret-like-content"
  | "executable-resource"
  | "symlink-refused"
  | "inventory-limit";

export interface PiResourceLintFindingV1 {
  readonly schemaVersion: "1.0.0";
  readonly code: PiResourceLintCode;
  readonly severity: "info" | "warning" | "error";
  readonly resourceIds: readonly string[];
  readonly message: string;
  readonly mutationAllowed: boolean;
}

export interface PiResourceInventoryV1 {
  readonly schemaVersion: "1.0.0";
  readonly inventorySchemaVersion: "1.0.0";
  readonly roots: readonly {
    readonly origin: PiResourceOrigin;
    readonly label: "project-root" | "explicit-global-root";
    readonly supplied: boolean;
  }[];
  readonly resources: readonly PiResourceRecordV1[];
  readonly findings: readonly PiResourceLintFindingV1[];
  readonly totals: {
    readonly resourceCount: number;
    readonly activeContextTokens: number;
    readonly projectContextTokens: number;
    readonly globalContextTokens: number;
  };
  readonly limitations: readonly string[];
}

export type MutationRouteDisposition =
  "candidate" | "recommendation" | "no-candidate";

export interface DiagnosisMutationRouteV1 {
  readonly schemaVersion: "1.0.0";
  readonly routeSchemaVersion: "1.0.0";
  readonly id: string;
  readonly disposition: MutationRouteDisposition;
  readonly mutationType: DiagnosisMutationTarget | null;
  readonly recommendationKind: "manual-tool" | "model-advice" | null;
  readonly sourceFindingIds: readonly string[];
  readonly evidence: readonly EvidenceCitationV1[];
  readonly rationale: readonly string[];
  readonly invokedWorkflow: string | null;
  readonly limitations: readonly string[];
}

export interface CandidateFileMutationV1 {
  readonly logicalPath: string;
  readonly operation: "create" | "update" | "delete";
  readonly beforeHash: ContentHash | null;
  readonly afterHash: ContentHash | null;
  readonly patchHash: ContentHash;
}

export interface CandidateEvaluationRecordV1 {
  readonly attemptId: string;
  readonly phase: "train" | "validation" | "holdout";
  readonly runIds: readonly string[];
  readonly taskIds: readonly string[];
  readonly planHash: ContentHash;
  readonly objectiveVectorHash: ContentHash | null;
  readonly status:
    "planned" | "completed" | "failed" | "budget-exhausted" | "early-stopped";
  readonly recordedAt: string;
  readonly limitations: readonly string[];
}

export interface CandidateSnapshotV1 {
  readonly schemaVersion: "1.0.0";
  readonly candidateSchemaVersion: "1.0.0";
  readonly candidateId: string;
  readonly candidateHash: ContentHash;
  readonly parentCandidateId: string | null;
  readonly baselineId: string;
  readonly createdAt: string;
  readonly generator: {
    readonly kind: "builtin-bounded-v1" | "external";
    readonly id: string;
    readonly version: string;
    readonly model: string | null;
    readonly promptHash: ContentHash | null;
    readonly deterministic: boolean;
  };
  readonly inputs: {
    readonly routeIds: readonly string[];
    readonly diagnosisIds: readonly string[];
    readonly evidenceHashes: readonly ContentHash[];
    readonly visibleSplitHash: ContentHash;
    readonly configHash: ContentHash;
  };
  readonly mutation: {
    readonly type: DiagnosisMutationTarget;
    readonly declaredVariable: string;
    readonly files: readonly CandidateFileMutationV1[];
  };
  readonly objective: {
    readonly policy: "correctness-first-v1";
    readonly primary: string;
    readonly constraints: Readonly<Record<string, number>>;
  };
  readonly evaluationHistory: readonly CandidateEvaluationRecordV1[];
  readonly decision: {
    readonly state:
      | "staged"
      | "approved"
      | "validating"
      | "promote-eligible"
      | "held"
      | "rejected"
      | "promoted"
      | "rolled-back";
    readonly reason: string;
  };
}

export interface PiRecommendationV1 {
  readonly schemaVersion: "1.0.0";
  readonly recommendationSchemaVersion: "1.0.0";
  readonly recommendationId: string;
  readonly kind: "settings" | "model" | "tool";
  readonly routeId: string;
  readonly title: string;
  readonly before: Readonly<Record<string, string | number | boolean | null>>;
  readonly proposed: Readonly<Record<string, string | number | boolean | null>>;
  readonly canonicalDiff: string;
  readonly evidence: readonly EvidenceCitationV1[];
  readonly capabilityAware: boolean;
  readonly manualOnly: true;
  readonly autoActions: readonly [];
  readonly warnings: readonly string[];
}

export interface CandidateReviewV1 {
  readonly schemaVersion: "1.0.0";
  readonly reviewSchemaVersion: "1.0.0";
  readonly reviewId: string;
  readonly candidateId: string;
  readonly candidateHash: ContentHash;
  readonly mutationType: DiagnosisMutationTarget;
  readonly sourceDiagnoses: readonly {
    readonly id: string;
    readonly category: string;
    readonly confidence: string;
    readonly claim: string;
    readonly evidence: readonly EvidenceCitationV1[];
  }[];
  readonly exactDiffs: readonly {
    readonly logicalPath: string;
    readonly patchHash: ContentHash;
    readonly unifiedDiff: string;
  }[];
  readonly securityFlags: readonly string[];
  readonly expectedEffect: string;
  readonly cost: {
    readonly addedLines: number;
    readonly removedLines: number;
    readonly contextTokenDelta: number;
    readonly estimatedContextTokensAfter: number;
  };
  readonly limitations: readonly string[];
  readonly controls: {
    readonly approve: boolean;
    readonly reject: boolean;
    readonly validationEnabled: boolean;
    readonly activationEnabled: false;
  };
  readonly decision: {
    readonly state: "pending" | "approved" | "rejected";
    readonly reason: string | null;
    readonly reviewedAt: string | null;
  };
}

export interface FrozenAblationPlanV1 {
  readonly schemaVersion: "1.0.0";
  readonly ablationPlanSchemaVersion: "1.0.0";
  readonly planHash: ContentHash;
  readonly candidateId: string;
  readonly candidateHash: ContentHash;
  readonly phase: "train" | "validation" | "holdout";
  readonly taskSnapshots: readonly {
    readonly taskId: string;
    readonly taskHash: ContentHash;
  }[];
  readonly invariant: {
    readonly adapterId: string;
    readonly adapterVersion: string;
    readonly model: string | null;
    readonly harnessHash: ContentHash;
    readonly budgetsHash: ContentHash;
    readonly environmentNames: readonly string[];
    readonly schedulerHash: ContentHash;
  };
  readonly baseline: {
    readonly variantId: string;
    readonly resourceHash: ContentHash;
  };
  readonly candidate: {
    readonly variantId: string;
    readonly resourceHash: ContentHash;
    readonly declaredVariable: string;
    readonly mutationFiles: readonly CandidateFileMutationV1[];
  };
  readonly repetitionCount: number;
  readonly trials: readonly {
    readonly trialKey: string;
    readonly taskId: string;
    readonly repetition: number;
    readonly arm: "baseline" | "candidate";
    readonly order: number;
  }[];
}

export interface AblationExecutionV1 {
  readonly schemaVersion: "1.0.0";
  readonly planHash: ContentHash;
  readonly candidateId: string;
  readonly status: "completed" | "failed" | "interrupted";
  readonly outcomes: readonly {
    readonly trialKey: string;
    readonly arm: "baseline" | "candidate";
    readonly status: "passed" | "failed" | "unavailable";
    readonly hardGatesPassed: boolean;
    readonly sourceArtifactHashes: readonly ContentHash[];
    readonly limitations: readonly string[];
  }[];
  readonly contaminationChecks: readonly string[];
}

export interface TeachingEvidenceViewV1 {
  readonly schemaVersion: "1.0.0";
  readonly phase: "candidate-generation" | "candidate-selection";
  readonly split: OptimizationSplitViewV1;
  readonly evidence: readonly {
    readonly taskId: string;
    readonly artifactHashes: readonly ContentHash[];
  }[];
  readonly accessHash: ContentHash;
}

export interface TeachingHoldoutGateV1 {
  readonly schemaVersion: "1.0.0";
  readonly gateId: string;
  readonly frozenCandidateId: string;
  readonly frozenPolicyHash: ContentHash;
  readonly access: HoldoutAccessV1;
  readonly gateHash: ContentHash;
}

export interface TeachingProtocolLedgerV1 {
  readonly schemaVersion: "1.0.0";
  readonly protocolSchemaVersion: "1.0.0";
  readonly manifestHash: ContentHash;
  readonly accesses: readonly {
    readonly phase: "candidate-generation" | "candidate-selection";
    readonly accessHash: ContentHash;
    readonly taskIds: readonly string[];
    readonly recordedAt: string;
  }[];
  readonly finalHoldout: {
    readonly gate: TeachingHoldoutGateV1;
    readonly outcome: {
      readonly resultHash: ContentHash;
      readonly passed: boolean;
      readonly recordedAt: string;
      readonly retuneAllowed: false;
    } | null;
  } | null;
}

export interface SuccessiveHalvingPlanV1 {
  readonly schemaVersion: "1.0.0";
  readonly halvingPlanSchemaVersion: "1.0.0";
  readonly planHash: ContentHash;
  readonly candidateIds: readonly string[];
  readonly reductionFactor: number;
  readonly budgets: {
    readonly maxCandidates: number;
    readonly maxTrials: number;
    readonly maxWallTimeMs: number;
    readonly maxTokens: number | null;
    readonly maxCostUsd: number | null;
  };
  readonly perTrial: {
    readonly maxWallTimeMs: number;
    readonly maxTokens: number | null;
    readonly maxCostUsd: number | null;
  };
  readonly rounds: readonly {
    readonly round: number;
    readonly candidateLimit: number;
    readonly taskIds: readonly string[];
    readonly repetitions: number;
    readonly trialsPerCandidate: number;
  }[];
}

export interface HalvingRoundDecisionV1 {
  readonly schemaVersion: "1.0.0";
  readonly planHash: ContentHash;
  readonly round: number;
  readonly survivors: readonly string[];
  readonly earlyStopped: readonly {
    readonly candidateId: string;
    readonly reason: string;
    readonly fullyEvaluated: false;
  }[];
  readonly rejected: readonly {
    readonly candidateId: string;
    readonly reason: string;
  }[];
  readonly consumed: {
    readonly trials: number;
    readonly wallTimeMs: number;
    readonly tokens: number | null;
    readonly costUsd: number | null;
  };
  readonly rationale: readonly string[];
}

export type ObjectiveDimension =
  | "successRate"
  | "stabilityVariance"
  | "costUsd"
  | "latencyMs"
  | "footprintLines"
  | "contextTokens"
  | "configComplexity";

export interface ObjectiveMetricV1 {
  readonly availability: "observed" | "derived" | "unavailable";
  readonly value: number | null;
  readonly unit: string;
  readonly sampleCount: number;
  readonly taskIds: readonly string[];
  readonly repetitions: number;
  readonly variance: number | null;
  readonly interval: readonly [number, number] | null;
  readonly sourceArtifactHashes: readonly ContentHash[];
}

export interface ObjectiveVectorV1 {
  readonly schemaVersion: "1.0.0";
  readonly objectiveSchemaVersion: "1.0.0";
  readonly candidateId: string;
  readonly phase: "train" | "validation" | "holdout";
  readonly hardGates: {
    readonly integrity: boolean;
    readonly correctness: boolean;
    readonly safety: boolean;
    readonly protectedPaths: boolean;
  };
  readonly metrics: Readonly<Record<ObjectiveDimension, ObjectiveMetricV1>>;
  readonly vectorHash: ContentHash;
}

export interface FrozenDecisionPolicyV1 {
  readonly schemaVersion: "1.0.0";
  readonly policyHash: ContentHash;
  readonly requiredDimensions: readonly ObjectiveDimension[];
  readonly minimumSuccessRateImprovement: number;
  readonly maximumRegression: Readonly<
    Partial<Record<Exclude<ObjectiveDimension, "successRate">, number>>
  >;
  readonly evidenceTier: "exploratory" | "validation" | "held-out";
}

export interface ParetoSelectionV1 {
  readonly schemaVersion: "1.0.0";
  readonly policyHash: ContentHash;
  readonly baselineVectorHash: ContentHash;
  readonly frontier: readonly string[];
  readonly decisions: readonly {
    readonly candidateId: string;
    readonly decision: "promote-eligible" | "hold" | "reject";
    readonly dominatedBy: readonly string[];
    readonly reasons: readonly string[];
    readonly limitations: readonly string[];
  }[];
  readonly rationale: readonly string[];
}

export interface PromotionPlanV1 {
  readonly schemaVersion: "1.0.0";
  readonly promotionSchemaVersion: "1.0.0";
  readonly promotionId: string;
  readonly planHash: ContentHash;
  readonly candidateId: string;
  readonly candidateHash: ContentHash;
  readonly reviewId: string;
  readonly policyHash: ContentHash;
  readonly holdoutGateHash: ContentHash | null;
  readonly targets: readonly {
    readonly logicalPath: string;
    readonly operation: "create" | "update" | "delete";
    readonly beforeHash: ContentHash | null;
    readonly afterHash: ContentHash | null;
    readonly patchHash: ContentHash;
  }[];
  readonly dryRun: true;
  readonly requiresConfirmation: true;
}

export interface PromotionRecordV1 {
  readonly schemaVersion: "1.0.0";
  readonly promotionId: string;
  readonly planHash: ContentHash;
  readonly candidateId: string;
  readonly promotedAt: string;
  readonly targets: PromotionPlanV1["targets"];
  readonly state: "promoted" | "rolled-back";
  readonly rollbackRecordHash: ContentHash | null;
}

export interface RollbackPlanV1 {
  readonly schemaVersion: "1.0.0";
  readonly rollbackSchemaVersion: "1.0.0";
  readonly promotionId: string;
  readonly promotionPlanHash: ContentHash;
  readonly targets: readonly {
    readonly logicalPath: string;
    readonly currentHash: ContentHash | null;
    readonly restoreHash: ContentHash | null;
  }[];
  readonly dryRun: true;
  readonly requiresConfirmation: true;
}
