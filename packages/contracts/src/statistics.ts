import type { ContentHash } from "./task.js";

export type RepeatedTrialOutcome = "passed" | "failed" | "not_graded";

export interface RepeatedTrialObservationV1 {
  readonly trialId: string;
  readonly outcome: RepeatedTrialOutcome;
  readonly integrity: "valid" | "compromised" | "unknown";
  readonly failureCategory?: string;
}

export interface RepeatedRunEstimateV1 {
  readonly k: number;
  readonly value: number;
}

export interface RepeatedRunStatisticsV1 {
  readonly schemaVersion: "1.0.0";
  readonly group: {
    readonly taskId: string;
    readonly variantId: string;
  };
  readonly independence: "declared-independent" | "unknown";
  readonly counts: {
    readonly total: number;
    readonly eligible: number;
    readonly passed: number;
    readonly failed: number;
    readonly excluded: number;
    readonly notGraded: number;
    readonly compromised: number;
    readonly integrityUnknown: number;
  };
  readonly successRate: number | null;
  readonly sampleVariance: number | null;
  readonly standardError: number | null;
  readonly wilson95: {
    readonly lower: number;
    readonly upper: number;
  } | null;
  readonly passAtK: readonly RepeatedRunEstimateV1[];
  readonly passPowerK: readonly RepeatedRunEstimateV1[];
  readonly failureCategories: Readonly<Record<string, number>>;
  readonly trialIds: readonly string[];
  readonly sourceHash: ContentHash;
  readonly caveats: readonly {
    readonly code: string;
    readonly message: string;
  }[];
  readonly reportHash: ContentHash;
}
