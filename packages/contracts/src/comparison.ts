import type { JsonValue, TrialId } from "./canonical.js";
import type { ContentHash } from "./task.js";
import type { ContentRef, TraceAvailability } from "./trace.js";

export type ComparisonDimension = "model" | "harness" | "workflow";
export type TrialTerminalStatus =
  "completed" | "failed" | "cancelled" | "budget_exhausted";
export type GateStatus = "passed" | "failed" | "error" | "unavailable";

export interface RaceTaskSnapshotV1 {
  readonly taskId: string;
  readonly taskHash: ContentHash;
  readonly baselineCommit: string;
  readonly instructionHash: ContentHash;
}

export interface RaceVariantV1 {
  readonly variantId: string;
  readonly variantHash: ContentHash;
  readonly adapter: {
    readonly id: string;
    readonly kind: string;
    readonly executable: string;
    readonly version: string | null;
  };
  readonly model: string | null;
  readonly harness: Readonly<Record<string, JsonValue>>;
  readonly workflow: Readonly<Record<string, JsonValue>>;
  readonly environmentNames: readonly string[];
}

export interface RaceTrialPlanV1 {
  readonly trialId: TrialId;
  readonly taskId: string;
  readonly taskHash: ContentHash;
  readonly baselineCommit: string;
  readonly variantId: string;
  readonly variantHash: ContentHash;
  readonly repetition: number;
  readonly attempt: number;
  readonly supersedesTrialId: TrialId | null;
}

export interface RacePlanV1 {
  readonly schemaVersion: "1.0.0";
  readonly planHash: ContentHash;
  readonly comparisonDimensions: readonly ComparisonDimension[];
  readonly tasks: readonly RaceTaskSnapshotV1[];
  readonly variants: readonly RaceVariantV1[];
  readonly repeat: number;
  readonly budgets: Readonly<Record<string, JsonValue>>;
  readonly trials: readonly RaceTrialPlanV1[];
}

export interface ComparisonMetricV1 {
  readonly value: number | null;
  readonly unit: string;
  readonly availability: "observed" | "derived" | "unavailable";
  readonly source: string;
}

export interface RaceTrialResultV1 {
  readonly schemaVersion: "1.0.0";
  readonly trialId: TrialId;
  readonly taskId: string;
  readonly taskHash: ContentHash;
  readonly baselineCommit: string;
  readonly variantId: string;
  readonly variantHash: ContentHash;
  readonly repetition: number;
  readonly attempt: number;
  readonly supersedesTrialId: TrialId | null;
  readonly terminalStatus: TrialTerminalStatus;
  readonly integrity: "valid" | "compromised" | "unknown";
  readonly outcome: "passed" | "failed" | "unavailable";
  readonly hardGates: readonly {
    readonly id: string;
    readonly status: GateStatus;
    readonly evidence: readonly string[];
  }[];
  readonly metrics: {
    readonly durationMs: ComparisonMetricV1;
    readonly costUsd: ComparisonMetricV1;
    readonly tokens: ComparisonMetricV1;
    readonly footprintLines: ComparisonMetricV1;
  };
  readonly artifacts: {
    readonly patch: string | null;
    readonly grade: string | null;
    readonly trace: string | null;
    readonly result: string | null;
  };
  readonly limitations: readonly string[];
}

export interface RaceExecutionV1 {
  readonly schemaVersion: "1.0.0";
  readonly plan: RacePlanV1;
  readonly status: "completed" | "partial" | "cancelled" | "budget_exhausted";
  readonly trials: readonly RaceTrialResultV1[];
  readonly scheduler: readonly {
    readonly trialId: TrialId;
    readonly status:
      "completed" | "failed" | "skipped" | "cancelled" | "budget_exhausted";
    readonly errorCode: string | null;
  }[];
}

export type RankingObjective = "stability" | "cost" | "latency" | "footprint";

export interface RankingPolicyV1 {
  readonly schemaVersion: "1.0.0";
  readonly id: string;
  readonly first: "hard-gates";
  readonly afterHardGates: readonly RankingObjective[];
}

export interface VariantAggregateV1 {
  readonly variantId: string;
  readonly variantHash: ContentHash;
  readonly trialCount: number;
  readonly completedCount: number;
  readonly validCount: number;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly hardGatePassRate: number | null;
  readonly allHardGatesPassed: boolean;
  readonly raw: {
    readonly stabilityVariance: ComparisonMetricV1;
    readonly meanCostUsd: ComparisonMetricV1;
    readonly meanLatencyMs: ComparisonMetricV1;
    readonly meanFootprintLines: ComparisonMetricV1;
  };
  readonly caveats: readonly string[];
}

export interface RankedVariantV1 {
  readonly rank: number;
  readonly variantId: string;
  readonly variantHash: ContentHash;
  readonly aggregate: VariantAggregateV1;
  readonly decisiveDimension: "hard-gates" | RankingObjective | "tie";
}

export interface RankedComparisonV1 {
  readonly schemaVersion: "1.0.0";
  readonly policy: RankingPolicyV1;
  readonly variants: readonly RankedVariantV1[];
  readonly caveats: readonly string[];
}

export interface RaceProgressEventV1 {
  readonly schemaVersion: "1.0.0";
  readonly sequence: number;
  readonly phase:
    | "planned"
    | "preparing"
    | "running"
    | "grading"
    | "completed"
    | "failed"
    | "cancelled"
    | "budget_exhausted"
    | "interrupted";
  readonly trialId: TrialId | null;
  readonly taskId: string | null;
  readonly variantId: string | null;
  readonly completedTrials: number;
  readonly totalTrials: number;
  readonly message: string | null;
}

export interface ComparisonReportV1 {
  readonly schemaVersion: "1.0.0";
  readonly reportSchemaVersion: "1.0.0";
  readonly source: {
    readonly planHash: ContentHash;
    readonly executionStatus: RaceExecutionV1["status"];
    readonly taskSnapshots: readonly RaceTaskSnapshotV1[];
    readonly variants: readonly RaceVariantV1[];
  };
  readonly overview: {
    readonly title: string;
    readonly taskCount: number;
    readonly variantCount: number;
    readonly plannedTrialCount: number;
    readonly completedEvidenceCount: number;
    readonly claimBoundary: string;
  };
  readonly ranking: RankedComparisonV1;
  readonly trials: readonly RaceTrialResultV1[];
  readonly patches: readonly PatchComparisonV1[];
  readonly timelines: readonly {
    readonly taskId: string;
    readonly repetition: number;
    readonly timeline: TrajectoryTimelineV1;
  }[];
  readonly caveats: readonly string[];
}

export interface PatchComparisonV1 {
  readonly schemaVersion: "1.0.0";
  readonly trialId: TrialId;
  readonly changedFiles: readonly {
    readonly path: string;
    readonly status: "added" | "modified" | "deleted" | "renamed" | "binary";
    readonly protectedPathViolation: boolean;
  }[];
  readonly unifiedDiff: string;
  readonly sideBySide: readonly {
    readonly leftLine: number | null;
    readonly left: string | null;
    readonly rightLine: number | null;
    readonly right: string | null;
    readonly kind: "context" | "removed" | "added" | "changed" | "metadata";
  }[];
  readonly reference: {
    readonly availability: "included" | "withheld" | "unavailable";
    readonly unifiedDiff: string | null;
    readonly reason: string;
  };
  readonly truncated: boolean;
}

export type TrajectoryLane =
  "file" | "search" | "command" | "edit" | "test" | "error";

export interface TrajectoryTimelineV1 {
  readonly schemaVersion: "1.0.0";
  readonly lanes: readonly TrajectoryLane[];
  readonly rows: readonly {
    readonly alignmentKey: string;
    readonly lane: TrajectoryLane;
    readonly occurrences: readonly {
      readonly variantId: string;
      readonly trialId: TrialId;
      readonly eventId: string;
      readonly sequence: number;
      readonly type: string;
      readonly availability: TraceAvailability;
      readonly monotonicMs: number | null;
      readonly rawRef: ContentRef | null;
    }[];
  }[];
  readonly unavailable: readonly {
    readonly variantId: string;
    readonly lane: TrajectoryLane;
    readonly reason: string;
  }[];
  readonly inputEventCount: number;
  readonly retainedEventCount: number;
  readonly truncated: boolean;
}

export interface ComparisonBaselineV1 {
  readonly schemaVersion: "1.0.0";
  readonly baselineSchemaVersion: "1.0.0";
  readonly name: string;
  readonly acceptedAt: string;
  readonly sourcePlanHash: ContentHash;
  readonly taskHashes: readonly ContentHash[];
  readonly policyId: string;
  readonly aggregate: VariantAggregateV1;
}

export interface RegressionComparisonV1 {
  readonly schemaVersion: "1.0.0";
  readonly baselineName: string;
  readonly baselineVariantId: string;
  readonly candidateVariantId: string;
  readonly comparable: boolean;
  readonly deltas: {
    readonly hardGatePassRate: number | null;
    readonly stabilityVariance: number | null;
    readonly meanCostUsd: number | null;
    readonly meanLatencyMs: number | null;
    readonly meanFootprintLines: number | null;
  };
  readonly decision: "promote" | "hold" | "reject";
  readonly reasons: readonly string[];
  readonly unavailableInputs: readonly string[];
}
