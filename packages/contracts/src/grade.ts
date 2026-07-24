import type { ContentHash, TaskCommandV1 } from "./task.js";
import type { JsonValue } from "./canonical.js";

export type CommandEvidenceStatus = "passed" | "failed" | "error" | "cancelled";

export interface DeterministicCommandEvidenceV1 {
  readonly schemaVersion: "1.0.0";
  readonly id: string;
  readonly kind: NonNullable<TaskCommandV1["kind"]>;
  readonly phase: "setup" | "verifier";
  readonly status: CommandEvidenceStatus;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly terminationReason:
    "exit" | "timeout" | "cancelled" | "output_limit" | "spawn_error";
  readonly expectedExitCodes: readonly number[];
  readonly stdout: {
    readonly evidenceRef: string;
    readonly bytes: number;
    readonly hash: ContentHash;
  };
  readonly stderr: {
    readonly evidenceRef: string;
    readonly bytes: number;
    readonly hash: ContentHash;
  };
  readonly error?: {
    readonly code: string;
    readonly category: string;
  };
}

export interface CommandPhaseResultV1 {
  readonly schemaVersion: "1.0.0";
  readonly phase: "setup" | "verifier";
  readonly status: "passed" | "failed" | "error" | "cancelled";
  readonly commands: readonly DeterministicCommandEvidenceV1[];
}

export interface DeterministicAssertionResultV1 {
  readonly schemaVersion: "1.0.0";
  readonly id: string;
  readonly kind: string;
  readonly status: "passed" | "failed" | "error" | "skipped";
  readonly message: string;
  readonly evidence: Readonly<Record<string, JsonValue>>;
}

export interface AssertionPhaseResultV1 {
  readonly schemaVersion: "1.0.0";
  readonly status: "passed" | "failed" | "error";
  readonly assertions: readonly DeterministicAssertionResultV1[];
  readonly summary: {
    readonly changedFiles: number;
    readonly changedLines: number;
    readonly binaryFiles: number;
    readonly dependencyChanges: readonly string[];
    readonly lockfileChanges: readonly string[];
    readonly untrackedPaths: readonly string[];
    readonly conflictedPaths: readonly string[];
  };
}

export interface HiddenVerifierResultV1 {
  readonly schemaVersion: "1.0.0";
  readonly taskHash: ContentHash;
  readonly agentPatchHash: ContentHash;
  readonly injectedAssets: readonly {
    readonly mount: string;
    readonly hash: ContentHash;
  }[];
  readonly verifier: CommandPhaseResultV1;
  readonly graderWorktreeCleaned: boolean;
}
