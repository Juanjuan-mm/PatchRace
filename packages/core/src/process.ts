import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { realpath } from "node:fs/promises";

import { PatchRaceError } from "@patchrace/contracts";

export type ProcessTerminationReason =
  "exit" | "timeout" | "cancelled" | "output_limit" | "spawn_error";

export interface ProcessRequest {
  readonly executable: string;
  readonly args?: readonly string[];
  readonly cwd: string;
  readonly inheritEnvironment?: readonly string[];
  readonly environment?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly terminationGraceMs?: number;
  readonly maxOutputBytes?: number;
  readonly stdin?: Uint8Array | string;
  readonly onStdout?: (chunk: Uint8Array) => void | Promise<void>;
  readonly onStderr?: (chunk: Uint8Array) => void | Promise<void>;
  readonly now?: () => number;
  readonly wallNow?: () => Date;
}

export interface ProcessResult {
  readonly status: "completed" | "failed" | "cancelled" | "budget_exhausted";
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly terminationReason: ProcessTerminationReason;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly processId: number;
  readonly processGroupId: number | null;
  readonly inheritedEnvironmentNames: readonly string[];
  readonly passedEnvironmentNames: readonly string[];
}

function validateRequest(request: ProcessRequest): void {
  if (request.executable.length === 0 || request.executable.includes("\0")) {
    throw new PatchRaceError({
      code: "PROCESS_EXECUTABLE_INVALID",
      category: "EXECUTION",
      message: "Process executable is empty or invalid.",
      path: "executable",
    });
  }
  for (const [index, argument] of (request.args ?? []).entries()) {
    if (argument.includes("\0"))
      throw new PatchRaceError({
        code: "PROCESS_ARGUMENT_INVALID",
        category: "EXECUTION",
        message: `Process argument ${index} contains a NUL byte.`,
        path: `args[${index}]`,
      });
  }
  for (const name of [
    ...(request.inheritEnvironment ?? []),
    ...Object.keys(request.environment ?? {}),
  ]) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
      throw new PatchRaceError({
        code: "PROCESS_ENVIRONMENT_NAME_INVALID",
        category: "CONFIG",
        message: `Invalid environment variable name '${name}'.`,
        path: "environment",
      });
  }
  for (const [name, value] of Object.entries(request.environment ?? {})) {
    if (value.includes("\0"))
      throw new PatchRaceError({
        code: "PROCESS_ENVIRONMENT_VALUE_INVALID",
        category: "CONFIG",
        message: `Environment variable '${name}' contains a NUL byte.`,
        path: `environment.${name}`,
      });
  }
  for (const [name, value] of [
    ["timeoutMs", request.timeoutMs],
    ["terminationGraceMs", request.terminationGraceMs],
    ["maxOutputBytes", request.maxOutputBytes],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0))
      throw new PatchRaceError({
        code: "PROCESS_LIMIT_INVALID",
        category: "CONFIG",
        message: `${name} must be finite and non-negative.`,
        path: name,
      });
  }
}

function environmentFor(request: ProcessRequest): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const name of [
    ...new Set(
      request.inheritEnvironment ?? ["PATH", "LANG", "LC_ALL", "TERM"],
    ),
  ].sort()) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  for (const [name, value] of Object.entries(request.environment ?? {}).sort(
    ([left], [right]) => left.localeCompare(right),
  ))
    environment[name] = value;
  return environment;
}

function signalOwnedProcess(
  child: ChildProcess,
  signal: NodeJS.Signals,
  includeExitedPosixGroup = false,
): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform !== "win32") {
      if (
        !includeExitedPosixGroup &&
        (child.exitCode !== null || child.signalCode !== null)
      )
        return;
      process.kill(-child.pid, signal);
    } else {
      if (child.exitCode !== null || child.signalCode !== null) return;
      // Windows has no POSIX process groups. taskkill's explicit PID tree is
      // the platform-equivalent ownership boundary; /F is required because a
      // console CTRL signal cannot be scoped safely to an arbitrary child tree.
      spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

export async function runProcess(
  request: ProcessRequest,
): Promise<ProcessResult> {
  validateRequest(request);
  const cwd = await realpath(request.cwd).catch((error: unknown) => {
    throw new PatchRaceError(
      {
        code: "PROCESS_CWD_INVALID",
        category: "PREFLIGHT",
        message: "Process working directory does not exist.",
        path: "cwd",
      },
      { cause: error },
    );
  });
  if (request.signal?.aborted === true) {
    throw new PatchRaceError({
      code: "PROCESS_CANCELLED_BEFORE_START",
      category: "INTERRUPTED",
      message: "Process was cancelled before it started.",
      retryable: true,
    });
  }
  const monotonicNow = request.now ?? (() => performance.now());
  const wallNow = request.wallNow ?? (() => new Date());
  const startedAt = wallNow().toISOString();
  const started = monotonicNow();
  const inheritedEnvironmentNames = [
    ...new Set(
      request.inheritEnvironment ?? ["PATH", "LANG", "LC_ALL", "TERM"],
    ),
  ].sort();
  const passedEnvironmentNames = Object.keys(request.environment ?? {}).sort();
  const child = spawn(request.executable, [...(request.args ?? [])], {
    cwd,
    env: environmentFor(request),
    detached: process.platform !== "win32",
    shell: false,
    stdio: [request.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const termination = { reason: "exit" as ProcessTerminationReason };
  let terminationRequested = false;
  let forceTimer: NodeJS.Timeout | undefined;
  const terminate = (
    reason: Exclude<ProcessTerminationReason, "exit" | "spawn_error">,
  ): void => {
    if (terminationRequested) return;
    terminationRequested = true;
    termination.reason = reason;
    signalOwnedProcess(child, "SIGTERM");
    if (process.platform !== "win32") {
      forceTimer = setTimeout(
        () => signalOwnedProcess(child, "SIGKILL", true),
        request.terminationGraceMs ?? 2000,
      );
      forceTimer.unref();
    }
  };
  const onAbort = (): void => terminate("cancelled");
  request.signal?.addEventListener("abort", onAbort, { once: true });
  let timeout: NodeJS.Timeout | undefined;
  if (request.timeoutMs !== undefined) {
    timeout = setTimeout(() => terminate("timeout"), request.timeoutMs);
    timeout.unref();
  }
  let stdoutBytes = 0;
  let stderrBytes = 0;
  const consume = async (
    stream: NodeJS.ReadableStream,
    kind: "stdout" | "stderr",
  ): Promise<void> => {
    for await (const raw of stream) {
      const chunk = raw as Buffer;
      if (kind === "stdout") stdoutBytes += chunk.byteLength;
      else stderrBytes += chunk.byteLength;
      if (
        stdoutBytes + stderrBytes >
        (request.maxOutputBytes ?? Number.MAX_SAFE_INTEGER)
      )
        terminate("output_limit");
      if (kind === "stdout") await request.onStdout?.(chunk);
      else await request.onStderr?.(chunk);
    }
  };
  const stdoutPromise = consume(child.stdout!, "stdout");
  const stderrPromise = consume(child.stderr!, "stderr");
  if (request.stdin !== undefined) {
    child.stdin!.end(request.stdin);
  }
  const closed = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolveClose, reject) => {
    child.once("error", (error) => {
      termination.reason = "spawn_error";
      reject(
        new PatchRaceError(
          {
            code: "PROCESS_SPAWN_FAILED",
            category: "EXECUTION",
            message: `Failed to start executable '${request.executable}'.`,
            path: "executable",
            retryable: false,
          },
          { cause: error },
        ),
      );
    });
    child.once("close", (code, signal) => resolveClose({ code, signal }));
  });
  try {
    const outcome = await closed;
    await Promise.all([stdoutPromise, stderrPromise]);
    const durationMs = Math.max(0, monotonicNow() - started);
    const status =
      termination.reason === "cancelled"
        ? "cancelled"
        : termination.reason === "timeout" ||
            termination.reason === "output_limit"
          ? "budget_exhausted"
          : outcome.code === 0
            ? "completed"
            : "failed";
    return {
      status,
      exitCode: outcome.code,
      signal: outcome.signal,
      terminationReason: termination.reason,
      startedAt,
      endedAt: wallNow().toISOString(),
      durationMs,
      stdoutBytes,
      stderrBytes,
      processId: child.pid ?? -1,
      processGroupId: process.platform === "win32" ? null : (child.pid ?? null),
      inheritedEnvironmentNames,
      passedEnvironmentNames,
    };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (forceTimer !== undefined) clearTimeout(forceTimer);
    request.signal?.removeEventListener("abort", onAbort);
  }
}

export interface SignalController {
  readonly signal: AbortSignal;
  dispose(): void;
}

export function createSignalController(
  signals: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"],
): SignalController {
  const controller = new AbortController();
  const listeners = new Map<NodeJS.Signals, () => void>();
  for (const signal of signals) {
    const listener = (): void =>
      controller.abort(new Error(`Received ${signal}`));
    listeners.set(signal, listener);
    process.once(signal, listener);
  }
  return {
    signal: controller.signal,
    dispose: () => {
      for (const [signal, listener] of listeners)
        process.removeListener(signal, listener);
    },
  };
}
