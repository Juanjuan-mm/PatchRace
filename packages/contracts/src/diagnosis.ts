import type { TrialId } from "./canonical.js";
import type { ContentHash } from "./task.js";
import type { ContentRef, TraceAvailability } from "./trace.js";

export type DiagnosticAvailability = "derived" | "unavailable";
export type DiagnosticLane = "file" | "search" | "command" | "edit" | "test";

export interface DiagnosticValueV1<T> {
  readonly value: T | null;
  readonly availability: DiagnosticAvailability;
  readonly evidenceEventIds: readonly string[];
  readonly reason: string | null;
}

export interface EvidenceCitationV1 {
  readonly runId: string;
  readonly trialId: TrialId;
  readonly artifactHash: ContentHash;
  readonly logicalPath: string;
  readonly eventIds?: readonly string[];
  readonly gradeGateIds?: readonly string[];
  readonly excerptHash?: ContentHash;
}

export interface TrajectoryFeaturesV1 {
  readonly schemaVersion: "1.0.0";
  readonly featureSchemaVersion: "1.0.0";
  readonly trialId: TrialId;
  readonly trace: EvidenceCitationV1;
  readonly traceCompleteness: "complete" | "partial" | "unknown";
  readonly fileCoverage: DiagnosticValueV1<{
    readonly relevantPathCount: number;
    readonly observedRelevantPaths: readonly string[];
    readonly ratio: number;
  }>;
  readonly searchLoops: DiagnosticValueV1<
    readonly {
      readonly signature: string;
      readonly repetitions: number;
      readonly eventIds: readonly string[];
    }[]
  >;
  readonly commandFailures: DiagnosticValueV1<{
    readonly count: number;
    readonly eventIds: readonly string[];
  }>;
  readonly timeToFirstTestMs: DiagnosticValueV1<number>;
  readonly testOrder: DiagnosticValueV1<
    readonly {
      readonly eventId: string;
      readonly sequence: number;
      readonly type: string;
      readonly status: "passed" | "failed" | "unknown";
    }[]
  >;
  readonly editFootprint: DiagnosticValueV1<{
    readonly paths: readonly string[];
    readonly changedLines: number | null;
    readonly eventIds: readonly string[];
  }>;
  readonly retries: DiagnosticValueV1<
    readonly {
      readonly signature: string;
      readonly repetitions: number;
      readonly eventIds: readonly string[];
    }[]
  >;
  readonly limitations: readonly string[];
}

export interface TrajectoryFeatureDeltaV1 {
  readonly schemaVersion: "1.0.0";
  readonly leftTrialId: TrialId;
  readonly rightTrialId: TrialId;
  readonly deltas: {
    readonly fileCoverageRatio: DiagnosticValueV1<number>;
    readonly searchLoopCount: DiagnosticValueV1<number>;
    readonly commandFailureCount: DiagnosticValueV1<number>;
    readonly timeToFirstTestMs: DiagnosticValueV1<number>;
    readonly testCount: DiagnosticValueV1<number>;
    readonly editPathCount: DiagnosticValueV1<number>;
    readonly retryCount: DiagnosticValueV1<number>;
  };
  readonly convention: "right-minus-left";
}

export type ObservableActionKind =
  | "inspect-file"
  | "list-files"
  | "search"
  | "run-test"
  | "run-command"
  | "edit-file"
  | "error";

export interface ObservableTrajectoryAlignmentV1 {
  readonly schemaVersion: "1.0.0";
  readonly alignmentSchemaVersion: "1.0.0";
  readonly variants: readonly {
    readonly variantId: string;
    readonly trialId: TrialId;
  }[];
  readonly groups: readonly {
    readonly semanticKey: string;
    readonly action: ObservableActionKind;
    readonly relation: "cross-variant" | "single-variant";
    readonly occurrences: readonly {
      readonly variantId: string;
      readonly trialId: TrialId;
      readonly eventId: string;
      readonly sequence: number;
      readonly ordinal: number;
      readonly type: string;
      readonly availability: TraceAvailability;
      readonly rawRef: ContentRef | null;
    }[];
  }[];
  readonly unavailable: readonly {
    readonly variantId: string;
    readonly action: ObservableActionKind;
    readonly reason: string;
  }[];
  readonly limitations: readonly string[];
}

export type DiagnosisCategory =
  | "discovery"
  | "context"
  | "workflow"
  | "tool"
  | "verification"
  | "capability"
  | "unknown";
export type DiagnosisConfidence = "high" | "medium" | "low";
export type DiagnosisMutationTarget =
  | "agents-guidance"
  | "skill"
  | "prompt-template"
  | "settings"
  | "resource-selection";
export type DiagnosisOrigin = "deterministic-rule" | "reflection";

export interface DiagnosisFindingV1 {
  readonly schemaVersion: "1.0.0";
  readonly id: string;
  readonly category: DiagnosisCategory;
  readonly confidence: DiagnosisConfidence;
  readonly claim: string;
  readonly evidence: readonly EvidenceCitationV1[];
  readonly alternatives: readonly {
    readonly claim: string;
    readonly evidence?: readonly EvidenceCitationV1[];
  }[];
  readonly eligibleMutationTargets: readonly DiagnosisMutationTarget[];
  readonly limitations: readonly string[];
  readonly origin: DiagnosisOrigin;
  readonly ruleId: string | null;
}

export interface RuleDiagnosisV1 {
  readonly schemaVersion: "1.0.0";
  readonly diagnosisSchemaVersion: "1.0.0";
  readonly trialId: TrialId;
  readonly deterministicFacts: {
    readonly integrity: "valid" | "compromised" | "unknown";
    readonly outcome: "passed" | "failed" | "unavailable";
    readonly hardGates: readonly {
      readonly id: string;
      readonly status: "passed" | "failed" | "error" | "unavailable";
    }[];
  };
  readonly findings: readonly DiagnosisFindingV1[];
  readonly limitations: readonly string[];
}

export interface ReflectionEvidenceBundleV1 {
  readonly schemaVersion: "1.0.0";
  readonly redaction: "redacted";
  readonly sourceHash: ContentHash;
  readonly items: readonly {
    readonly id: string;
    readonly summary: string;
    readonly citation: EvidenceCitationV1;
  }[];
  readonly limitations: readonly string[];
}

export interface ReflectedDiagnosisV1 {
  readonly schemaVersion: "1.0.0";
  readonly reflectionSchemaVersion: "1.0.0";
  readonly deterministic: RuleDiagnosisV1;
  readonly hypotheses: readonly DiagnosisFindingV1[];
  readonly provider: {
    readonly id: string;
    readonly version: string;
    readonly model: string | null;
  };
  readonly inputHash: ContentHash;
  readonly limitations: readonly string[];
}

export interface GapVariantIdentityV1 {
  readonly taskHash: ContentHash;
  readonly adapterId: string;
  readonly model: string | null;
  readonly harnessHash: ContentHash;
  readonly workflowHash: ContentHash;
}

export interface GapClassificationV1 {
  readonly schemaVersion: "1.0.0";
  readonly classificationSchemaVersion: "1.0.0";
  readonly trialId: TrialId;
  readonly classification:
    | "workflow-or-configuration-gap"
    | "likely-model-capability-gap"
    | "insufficient-evidence";
  readonly confidence: DiagnosisConfidence;
  readonly recommendation:
    "consider-project-workflow-mutation" | "no-configuration-mutation";
  readonly eligibleMutationTargets: readonly DiagnosisMutationTarget[];
  readonly sourceFindingIds: readonly string[];
  readonly evidence: readonly EvidenceCitationV1[];
  readonly reasons: readonly string[];
  readonly limitations: readonly string[];
}

export interface DiagnosisArtifactEvidenceV1 {
  readonly trialId: TrialId;
  readonly logicalPath: string;
  readonly hash: ContentHash;
  readonly eventIds: readonly string[];
  readonly gradeGateIds: readonly string[];
}

export interface DiagnosisReportCaseV1 {
  readonly taskId: string;
  readonly trialId: TrialId;
  readonly variantId: string;
  readonly identity: GapVariantIdentityV1;
  readonly deterministic: RuleDiagnosisV1;
  readonly features: TrajectoryFeaturesV1;
  readonly alignment: ObservableTrajectoryAlignmentV1 | null;
  readonly findings: readonly DiagnosisFindingV1[];
  readonly classification: GapClassificationV1;
  readonly reflection: ReflectedDiagnosisV1["provider"] | null;
}

export interface DiagnosisReportV1 {
  readonly schemaVersion: "1.0.0";
  readonly reportSchemaVersion: "1.0.0";
  readonly source: {
    readonly runId: string;
    readonly planHash: ContentHash;
    readonly artifacts: readonly DiagnosisArtifactEvidenceV1[];
  };
  readonly overview: {
    readonly title: string;
    readonly focusVariantId: string;
    readonly caseCount: number;
    readonly findingCount: number;
    readonly claimBoundary: string;
  };
  readonly cases: readonly DiagnosisReportCaseV1[];
  readonly caveats: readonly string[];
}

export interface LabeledDiagnosisCaseV1 {
  readonly id: string;
  readonly expectedCategory: DiagnosisCategory;
  readonly findings: readonly DiagnosisFindingV1[];
}

export interface DiagnosisQualityReportV1 {
  readonly schemaVersion: "1.0.0";
  readonly qualitySchemaVersion: "1.0.0";
  readonly thresholds: {
    readonly minimumCases: number;
    readonly minimumHighConfidencePrecision: number;
  };
  readonly totals: {
    readonly labeledCases: number;
    readonly highConfidencePredictions: number;
    readonly correctHighConfidencePredictions: number;
    readonly casesWithCorrectHighConfidencePrediction: number;
    readonly unclassifiedCases: number;
  };
  readonly highConfidencePrecision: number | null;
  readonly caseCoverage: number;
  readonly categories: readonly {
    readonly category: DiagnosisCategory;
    readonly support: number;
    readonly correctHighConfidenceCases: number;
  }[];
  readonly falsePositives: readonly {
    readonly caseId: string;
    readonly expected: DiagnosisCategory;
    readonly predicted: DiagnosisCategory;
    readonly findingId: string;
  }[];
  readonly unclassifiedCaseIds: readonly string[];
  readonly unsafeOrSpeculative: readonly {
    readonly caseId: string;
    readonly findingId: string;
    readonly reasons: readonly string[];
  }[];
  readonly passed: boolean;
  readonly failures: readonly string[];
}
