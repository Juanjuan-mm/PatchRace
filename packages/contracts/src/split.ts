import type { ContentHash, TaskSplit } from "./task.js";

export interface SplitTaskInputV1 {
  readonly id: string;
  readonly taskHash: ContentHash;
  readonly category: string;
}

export interface TaskSplitManifestV1 {
  readonly schemaVersion: "1.0.0";
  readonly algorithm: "category-hash-v1";
  readonly seedHash: ContentHash;
  readonly taskSetHash: ContentHash;
  readonly tasks: readonly SplitTaskInputV1[];
  readonly assignments: Readonly<Record<TaskSplit, readonly string[]>>;
  readonly categories: Readonly<
    Record<
      string,
      Readonly<Record<TaskSplit, number>> & { readonly total: number }
    >
  >;
  readonly holdoutCommitmentHash: ContentHash;
  readonly manifestHash: ContentHash;
}

export interface OptimizationSplitViewV1 {
  readonly schemaVersion: "1.0.0";
  readonly manifestHash: ContentHash;
  readonly trainingTaskIds: readonly string[];
  readonly validationTaskIds: readonly string[];
  readonly holdout: {
    readonly count: number;
    readonly commitmentHash: ContentHash;
  };
}

export interface HoldoutAccessV1 {
  readonly schemaVersion: "1.0.0";
  readonly manifestHash: ContentHash;
  readonly gateId: string;
  readonly openedAt: string;
  readonly taskIds: readonly string[];
  readonly accessHash: ContentHash;
}
