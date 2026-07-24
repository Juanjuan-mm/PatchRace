import type { JsonValue } from "./canonical.js";
import type { ContentHash } from "./task.js";

export type GraderIntegrityStatus = "valid" | "compromised" | "unknown";

export interface GraderIntegrityFindingV1 {
  readonly code: string;
  readonly severity: "failure" | "error" | "limitation";
  readonly message: string;
  readonly evidence: Readonly<Record<string, JsonValue>>;
}

export interface GraderIntegrityResultV1 {
  readonly schemaVersion: "1.0.0";
  readonly status: GraderIntegrityStatus;
  readonly taskHash: ContentHash;
  readonly configHash: ContentHash;
  readonly baselineCommit: string;
  readonly isolation: "enforced-filesystem" | "host-only";
  readonly checkedPaths: readonly string[];
  readonly findings: readonly GraderIntegrityFindingV1[];
  readonly resultHash: ContentHash;
}
