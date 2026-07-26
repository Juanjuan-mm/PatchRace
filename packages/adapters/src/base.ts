import { constants } from "node:fs";
import { access, realpath } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";

import {
  PatchRaceError,
  canonicalHash,
  sha256,
  type JsonValue,
} from "@patchrace/contracts";
import { runProcess } from "@patchrace/core";

import {
  ADAPTER_COMPATIBILITY,
  isSupportedVersion,
  normalizeCliVersion,
} from "./compatibility.js";
import { JsonlCollector } from "./jsonl.js";
import {
  emptyMetrics,
  type AdapterCapabilities,
  type AdapterError,
  type AdapterMetrics,
  type AdapterResult,
  type AdapterSink,
  type AgentAdapter,
  type CancelReason,
  type CancelResult,
  type NormalizeContext,
  type PrepareInput,
  type PreparedInvocation,
  type ProbeInput,
  type ProbeResult,
  type RawRecord,
  type RunningHandle,
  type TraceEventV1,
} from "./types.js";

const defaultBudgets = Object.freeze({
  wallMs: 15 * 60 * 1000,
  maxOutputBytes: 16 * 1024 * 1024,
  maxRecords: 10_000,
  maxRecordBytes: 1024 * 1024,
  maxJsonDepth: 64,
  terminationGraceMs: 2_000,
});

interface CaptureResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
}

async function resolveExecutable(
  requested: string,
  environment: Readonly<Record<string, string>>,
): Promise<string | null> {
  const candidates = isAbsolute(requested)
    ? [requested]
    : requested.includes("/") || requested.includes("\\")
      ? [requested]
      : (environment["PATH"] ?? process.env["PATH"] ?? "")
          .split(delimiter)
          .filter(Boolean)
          .map((directory) => join(directory, requested));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return await realpath(candidate);
    } catch {
      // Continue through the declared PATH without invoking a shell.
    }
  }
  return null;
}

async function capture(
  executable: string,
  args: readonly string[],
  input: ProbeInput,
  signal: AbortSignal,
): Promise<CaptureResult> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const result = await runProcess({
    executable,
    args: [...(input.executableArgs ?? []), ...args],
    cwd: input.cwd ?? process.cwd(),
    ...(input.inheritEnvironment === undefined
      ? {}
      : { inheritEnvironment: input.inheritEnvironment }),
    ...(input.environment === undefined
      ? {}
      : { environment: input.environment }),
    signal,
    timeoutMs: input.timeoutMs ?? 5_000,
    maxOutputBytes: 64 * 1024,
    onStdout: (chunk) => {
      stdout.push(Buffer.from(chunk));
    },
    onStderr: (chunk) => {
      stderr.push(Buffer.from(chunk));
    },
  });
  return {
    ok: result.status === "completed",
    stdout: Buffer.concat(stdout).toString("utf8").trim().slice(0, 4096),
    stderr: Buffer.concat(stderr).toString("utf8").trim().slice(0, 4096),
  };
}

export abstract class CliAdapter implements AgentAdapter {
  abstract readonly id: string;
  abstract readonly kind: "pi" | "claude-code" | "codex";
  readonly contractVersion = "1.0.0" as const;
  readonly adapterVersion = "0.1.0";
  protected abstract readonly defaultExecutable: string;
  protected abstract readonly versionArgs: readonly string[];
  protected abstract readonly capabilities: AdapterCapabilities;
  readonly #running = new Map<string, AbortController>();
  readonly #cancelled = new Map<string, CancelReason>();

  protected abstract authArgs(): readonly string[] | null;
  protected abstract parseAuth(result: CaptureResult): ProbeResult["auth"];
  protected abstract buildInvocation(
    input: PrepareInput,
    resolved: {
      readonly cwd: string;
      readonly resourceRoot?: string;
      readonly sessionRoot?: string;
    },
  ): Omit<
    PreparedInvocation,
    | "invocationId"
    | "adapter"
    | "adapterVersion"
    | "executionMode"
    | "trialId"
    | "taskHash"
    | "variantHash"
    | "cwd"
    | "instructionHash"
    | "executableArgumentCount"
    | "inheritEnvironment"
    | "environment"
    | "environmentNames"
    | "budgets"
  >;
  protected abstract extractMetrics(
    records: readonly RawRecord[],
    controllerDurationMs: number,
  ): AdapterMetrics;
  protected abstract vendorErrors(
    records: readonly RawRecord[],
  ): AdapterError[];
  protected environmentFor(
    _input: PrepareInput,
    _resolved: {
      readonly cwd: string;
      readonly resourceRoot?: string;
      readonly sessionRoot?: string;
    },
  ): Readonly<Record<string, string>> {
    return {};
  }
  abstract normalize(
    raw: AsyncIterable<RawRecord>,
    context: NormalizeContext,
  ): AsyncIterable<TraceEventV1>;

  async probe(input: ProbeInput, signal: AbortSignal): Promise<ProbeResult> {
    const requested = input.executable ?? this.defaultExecutable;
    const environment = { ...input.environment };
    const resolved = await resolveExecutable(requested, environment);
    const compatibility = ADAPTER_COMPATIBILITY[this.kind];
    if (resolved === null) {
      return {
        availability: "unavailable",
        executable: { requested, exists: false },
        version: {
          raw: null,
          normalized: null,
          supported: false,
          range: compatibility.range,
        },
        auth: { state: "unknown" },
        capabilities: this.capabilities,
        limitations: compatibility.degradations,
        remediation: [
          `Install the official ${compatibility.executable} CLI and ensure it is on PATH.`,
        ],
      };
    }
    let versionResult: CaptureResult;
    try {
      versionResult = await capture(resolved, this.versionArgs, input, signal);
    } catch {
      versionResult = { ok: false, stdout: "", stderr: "" };
    }
    const rawVersion = versionResult.ok
      ? versionResult.stdout || versionResult.stderr
      : null;
    const normalized =
      rawVersion === null ? null : normalizeCliVersion(rawVersion);
    const supported =
      rawVersion !== null && isSupportedVersion(this.kind, rawVersion);
    let auth: ProbeResult["auth"] = { state: "unknown" };
    const authArgs = this.authArgs();
    if (supported && authArgs !== null) {
      try {
        auth = this.parseAuth(await capture(resolved, authArgs, input, signal));
      } catch {
        auth = {
          state: "unknown",
          detail: "Official auth status probe did not complete.",
        };
      }
    }
    const remediation: string[] = [];
    if (!versionResult.ok)
      remediation.push(
        "Repair or replace the selected CLI; its version command did not complete successfully.",
      );
    else if (!supported)
      remediation.push(
        `Install a supported ${this.kind} CLI version (${compatibility.range}).`,
      );
    if (auth.state === "missing" || auth.state === "expired")
      remediation.push(
        `Authenticate with the official ${compatibility.executable} login flow.`,
      );
    return {
      availability:
        versionResult.ok && supported && auth.state === "ready"
          ? "ready"
          : versionResult.ok && supported && auth.state === "unknown"
            ? "degraded"
            : "unavailable",
      executable: {
        requested,
        resolvedPathHash: sha256(resolved),
        exists: true,
      },
      version: {
        raw: rawVersion,
        normalized,
        supported,
        range: compatibility.range,
      },
      auth,
      capabilities: this.capabilities,
      limitations: compatibility.degradations,
      remediation,
    };
  }

  async prepare(
    input: PrepareInput,
    signal: AbortSignal,
  ): Promise<PreparedInvocation> {
    if (signal.aborted)
      throw new PatchRaceError({
        code: "ADAPTER_PREPARE_CANCELLED",
        category: "INTERRUPTED",
        message: "Adapter preparation was cancelled before it started.",
      });
    if (input.instruction.length === 0 || input.instruction.includes("\0"))
      throw new PatchRaceError({
        code: "ADAPTER_INSTRUCTION_INVALID",
        category: "CONFIG",
        message:
          "Agent instruction must be non-empty and cannot contain NUL bytes.",
        path: "instruction",
      });
    const cwd = await realpath(input.worktree).catch((error: unknown) => {
      throw new PatchRaceError(
        {
          code: "ADAPTER_WORKTREE_INVALID",
          category: "PREFLIGHT",
          message: "The adapter worktree does not exist.",
          path: "worktree",
        },
        { cause: error },
      );
    });
    const resourceRoot =
      input.resourceRoot === undefined
        ? undefined
        : await realpath(input.resourceRoot).catch((error: unknown) => {
            throw new PatchRaceError(
              {
                code: "ADAPTER_RESOURCE_ROOT_INVALID",
                category: "PREFLIGHT",
                message: "The adapter resource root does not exist.",
                path: "resourceRoot",
              },
              { cause: error },
            );
          });
    const sessionRoot =
      input.sessionRoot === undefined
        ? undefined
        : await realpath(input.sessionRoot).catch((error: unknown) => {
            throw new PatchRaceError(
              {
                code: "ADAPTER_SESSION_ROOT_INVALID",
                category: "PREFLIGHT",
                message: "The adapter session root does not exist.",
                path: "sessionRoot",
              },
              { cause: error },
            );
          });
    const resolved = {
      cwd,
      ...(resourceRoot === undefined ? {} : { resourceRoot }),
      ...(sessionRoot === undefined ? {} : { sessionRoot }),
    };
    const specific = this.buildInvocation(input, resolved);
    const environment = {
      ...input.environment,
      ...this.environmentFor(input, resolved),
    };
    const budgets = { ...defaultBudgets, ...input.budgets };
    for (const [name, value] of Object.entries(budgets)) {
      if (!Number.isFinite(value) || value < 0)
        throw new PatchRaceError({
          code: "ADAPTER_BUDGET_INVALID",
          category: "CONFIG",
          message: `Adapter budget ${name} must be finite and non-negative.`,
          path: `budgets.${name}`,
        });
    }
    return {
      invocationId: `inv_${canonicalHash({ adapter: this.kind, trialId: input.trialId, task: input.taskHash, variant: input.variantHash }).slice(7, 31)}`,
      adapter: this.kind,
      adapterVersion: this.adapterVersion,
      executionMode: "cli",
      trialId: input.trialId,
      taskHash: input.taskHash,
      variantHash: input.variantHash,
      cwd,
      instructionHash: sha256(input.instruction),
      inheritEnvironment: [
        ...new Set(input.inheritEnvironment ?? ["PATH", "LANG", "LC_ALL"]),
      ].sort(),
      environment,
      environmentNames: Object.keys(environment).sort(),
      budgets,
      ...specific,
      executableArgumentCount: input.executableArgs?.length ?? 0,
      args: [...(input.executableArgs ?? []), ...specific.args],
    };
  }

  async run(
    input: PreparedInvocation,
    sink: AdapterSink,
    signal: AbortSignal,
  ): Promise<AdapterResult> {
    if (input.adapter !== this.kind || input.executionMode !== "cli")
      throw new PatchRaceError({
        code: "ADAPTER_INVOCATION_MISMATCH",
        category: "CONFIG",
        message: "Prepared invocation does not belong to this CLI adapter.",
        path: "adapter",
      });
    const started = performance.now();
    const lifecycle: {
      state: AdapterResult["lifecycle"][number]["state"];
      monotonicMs: number;
    }[] = [];
    const mark = (state: AdapterResult["lifecycle"][number]["state"]): void => {
      lifecycle.push({
        state,
        monotonicMs: Math.max(0, performance.now() - started),
      });
    };
    mark("prepared");
    const controller = new AbortController();
    const externalAbort = (): void => controller.abort(signal.reason);
    signal.addEventListener("abort", externalAbort, { once: true });
    if (signal.aborted) externalAbort();
    this.#running.set(input.invocationId, controller);
    const records: RawRecord[] = [];
    let sequence = 0;
    const onRecord = async (record: RawRecord): Promise<void> => {
      await sink.persistRecord(record);
      records.push(record);
    };
    const limits = {
      maxRecords: input.budgets.maxRecords,
      maxRecordBytes: input.budgets.maxRecordBytes,
      maxJsonDepth: input.budgets.maxJsonDepth,
    };
    const stdout = new JsonlCollector({
      stream: "stdout",
      parseJson: true,
      limits,
      nextSequence: () => ++sequence,
      onRecord,
    });
    const stderr = new JsonlCollector({
      stream: "stderr",
      parseJson: false,
      limits,
      nextSequence: () => ++sequence,
      onRecord,
    });
    let processResult: AdapterResult["process"] = null;
    const errors: AdapterError[] = [];
    try {
      mark("spawning");
      mark("running");
      processResult = await runProcess({
        executable: input.executable,
        args: input.args,
        cwd: input.cwd,
        inheritEnvironment: input.inheritEnvironment,
        environment: input.environment,
        signal: controller.signal,
        timeoutMs: input.budgets.wallMs,
        terminationGraceMs: input.budgets.terminationGraceMs,
        maxOutputBytes: input.budgets.maxOutputBytes,
        onStdout: async (chunk) => {
          await sink.persistChunk("stdout", chunk);
          await stdout.push(chunk);
        },
        onStderr: async (chunk) => {
          await sink.persistChunk("stderr", chunk);
          await stderr.push(chunk);
        },
      });
      await Promise.all([stdout.finish(), stderr.finish()]);
      mark("completing");
    } catch (error) {
      const cancelled = controller.signal.aborted;
      errors.push({
        code: cancelled ? "ADAPTER_CANCELLED" : "ADAPTER_PROCESS_FAILED",
        category: cancelled ? "cancelled" : "executable_missing",
        message: cancelled
          ? "Agent invocation was cancelled before completion."
          : "The selected agent executable could not be started.",
        retryable: cancelled ? "yes" : "no",
        ...(cancelled
          ? {}
          : {
              remediation:
                "Run the adapter probe and repair the selected CLI installation.",
            }),
      });
      void error;
    } finally {
      signal.removeEventListener("abort", externalAbort);
      this.#running.delete(input.invocationId);
    }
    for (const record of records) {
      if (record.parseError !== undefined)
        errors.push({
          code: `ADAPTER_${record.parseError.toUpperCase()}`,
          category: "malformed_output",
          message:
            "Agent output contained a malformed or unsupported structured record.",
          rawRef: { path: "raw/records.jsonl", record: record.sequence },
          retryable: "unknown",
        });
    }
    errors.push(...this.vendorErrors(records));
    if (processResult?.terminationReason === "timeout")
      errors.push({
        code: "ADAPTER_TIMEOUT",
        category: "timeout",
        message: "Agent invocation exceeded its wall-time budget.",
        retryable: "yes",
      });
    else if (processResult?.terminationReason === "output_limit")
      errors.push({
        code: "ADAPTER_OUTPUT_BUDGET_EXHAUSTED",
        category: "budget_exhausted",
        message: "Agent invocation exceeded its captured-output budget.",
        retryable: "no",
      });
    else if (processResult?.terminationReason === "cancelled")
      errors.push({
        code: "ADAPTER_CANCELLED",
        category: "cancelled",
        message: "Agent invocation was cancelled.",
        retryable: "yes",
      });
    if (processResult?.status === "failed" && errors.length === 0) {
      const diagnostic = records
        .filter((record) => record.stream === "stderr")
        .map((record) => record.text)
        .join("\n")
        .toLowerCase();
      const permission = /permission denied|operation not permitted/.test(
        diagnostic,
      );
      const auth = /not logged in|authentication|unauthorized|credential/.test(
        diagnostic,
      );
      const network = /network|connection|rate limit|service unavailable/.test(
        diagnostic,
      );
      errors.push({
        code: permission
          ? "ADAPTER_PERMISSION_DENIED"
          : auth
            ? "ADAPTER_AUTH_UNAVAILABLE"
            : network
              ? "ADAPTER_VENDOR_UNAVAILABLE"
              : "ADAPTER_AGENT_EXIT_NONZERO",
        category: permission
          ? "permission_denied"
          : auth
            ? "auth_unavailable"
            : network
              ? "network_or_vendor"
              : "agent_error",
        message: permission
          ? "The agent CLI reported a permission failure."
          : auth
            ? "The agent CLI reported unavailable authentication."
            : network
              ? "The agent CLI reported a network or vendor failure."
              : "The agent CLI exited unsuccessfully.",
        retryable: network ? "yes" : auth || permission ? "no" : "unknown",
      });
    }
    let status: AdapterResult["status"];
    if (processResult === null)
      status = controller.signal.aborted ? "cancelled" : "failed";
    else status = processResult.status;
    if (
      status === "completed" &&
      records.filter(
        (record) => record.stream === "stdout" && record.parsed !== undefined,
      ).length === 0
    ) {
      status = "failed";
      errors.push({
        code: "ADAPTER_STRUCTURED_OUTPUT_MISSING",
        category: "protocol_error",
        message: "Agent completed without any valid structured stdout records.",
        retryable: "unknown",
      });
    }
    if (
      status === "completed" &&
      errors.some(
        (error) =>
          error.category === "auth_unavailable" ||
          error.category === "agent_error",
      )
    )
      status = "failed";
    mark(status);
    const duration = Math.max(0, performance.now() - started);
    return {
      invocationId: input.invocationId,
      status,
      process: processResult,
      records,
      metrics: this.extractMetrics(records, duration),
      errors,
      sessionRefs: input.sessionRoot === undefined ? [] : ["session-root"],
      lifecycle,
    };
  }

  async cancel(
    handle: RunningHandle,
    reason: CancelReason,
  ): Promise<CancelResult> {
    const prior = this.#cancelled.get(handle.invocationId);
    if (prior !== undefined)
      return {
        invocationId: handle.invocationId,
        status: "already_requested",
        reason: prior,
      };
    const controller = this.#running.get(handle.invocationId);
    if (controller === undefined)
      return {
        invocationId: handle.invocationId,
        status: "not_running",
        reason,
      };
    this.#cancelled.set(handle.invocationId, reason);
    controller.abort(new Error(`Adapter cancellation: ${reason}`));
    return { invocationId: handle.invocationId, status: "requested", reason };
  }

  protected metricsWithDuration(controllerDurationMs: number): AdapterMetrics {
    return emptyMetrics(controllerDurationMs);
  }
}

export function recordObject(
  record: RawRecord,
): Readonly<Record<string, JsonValue>> | null {
  const parsed = record.parsed;
  return parsed !== undefined &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    typeof parsed === "object"
    ? (parsed as Readonly<Record<string, JsonValue>>)
    : null;
}

export function objectValue(
  value: JsonValue | undefined,
): Readonly<Record<string, JsonValue>> | null {
  return value !== undefined &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value === "object"
    ? (value as Readonly<Record<string, JsonValue>>)
    : null;
}

export function numberValue(value: JsonValue | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function stringValue(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}
