import { SCHEMA_VERSION } from "./version.js";

export { SCHEMA_VERSION } from "./version.js";

export enum ExitCode {
  Ok = 0,
  OutcomeNotPassed = 1,
  Usage = 2,
  Config = 3,
  Preflight = 4,
  Execution = 5,
  Grader = 6,
  Interrupted = 7,
  Budget = 8,
  Conflict = 9,
  Safety = 10,
  Internal = 11,
}

export type ErrorCategory =
  | "OUTCOME_NOT_PASSED"
  | "USAGE"
  | "CONFIG"
  | "PREFLIGHT"
  | "EXECUTION"
  | "GRADER"
  | "INTERRUPTED"
  | "BUDGET"
  | "CONFLICT"
  | "SAFETY"
  | "INTERNAL";

const exitCodes: Readonly<Record<ErrorCategory, ExitCode>> = {
  OUTCOME_NOT_PASSED: ExitCode.OutcomeNotPassed,
  USAGE: ExitCode.Usage,
  CONFIG: ExitCode.Config,
  PREFLIGHT: ExitCode.Preflight,
  EXECUTION: ExitCode.Execution,
  GRADER: ExitCode.Grader,
  INTERRUPTED: ExitCode.Interrupted,
  BUDGET: ExitCode.Budget,
  CONFLICT: ExitCode.Conflict,
  SAFETY: ExitCode.Safety,
  INTERNAL: ExitCode.Internal,
};

export interface ErrorDetails {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly message: string;
  readonly path?: string;
  readonly retryable?: boolean;
  readonly remediation?: string;
}

export interface MachineError {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly ok: false;
  readonly error: ErrorDetails;
}

export class PatchRaceError extends Error {
  readonly details: ErrorDetails;

  constructor(details: ErrorDetails, options?: ErrorOptions) {
    super(details.message, options);
    this.name = "PatchRaceError";
    this.details = details;
  }

  get exitCode(): ExitCode {
    return exitCodes[this.details.category];
  }

  toJSON(): MachineError {
    return { schemaVersion: SCHEMA_VERSION, ok: false, error: this.details };
  }
}

export function normalizeError(error: unknown): PatchRaceError {
  if (error instanceof PatchRaceError) return error;
  return new PatchRaceError(
    {
      code: "INTERNAL_UNEXPECTED",
      category: "INTERNAL",
      message: "PatchRace encountered an unexpected internal error.",
      retryable: false,
      remediation:
        "Re-run with --log-level debug and retain the diagnostic bundle.",
    },
    { cause: error },
  );
}

export * from "./canonical.js";
export * from "./comparison.js";
export * from "./diagnosis.js";
export * from "./grade.js";
export * from "./integrity.js";
export * from "./mining.js";
export * from "./optimizer.js";
export * from "./split.js";
export * from "./statistics.js";
export * from "./validity.js";
export * from "./suite-config.js";
export * from "./task.js";
export * from "./trace.js";
