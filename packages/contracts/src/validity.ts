import type { ContentHash } from "./task.js";

export interface TaskValidityAttemptV1 {
  readonly kind: "baseline" | "reference";
  readonly attempt: number;
  readonly setupStatus: "passed" | "failed" | "error" | "cancelled";
  readonly verifierStatus:
    "passed" | "failed" | "error" | "cancelled" | "not-run";
  readonly assertionStatus: "passed" | "failed" | "error" | "not-run";
  readonly outcome: "passed" | "failed" | "not-run";
  readonly setupStateHash: ContentHash;
  readonly evidenceHash: ContentHash;
  readonly errorCode: string | null;
}

export interface TaskValidityReportV1 {
  readonly schemaVersion: "1.0.0";
  readonly taskId: string;
  readonly taskHash: ContentHash;
  readonly referencePatchHash: ContentHash;
  readonly repeat: number;
  readonly status: "eligible" | "invalid" | "flaky";
  readonly findings: readonly {
    readonly code: string;
    readonly severity: "error" | "warning";
    readonly message: string;
  }[];
  readonly attempts: readonly TaskValidityAttemptV1[];
  readonly reportHash: ContentHash;
}
