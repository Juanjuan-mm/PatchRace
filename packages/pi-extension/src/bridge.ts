import { spawn } from "node:child_process";

import type { CommandResult } from "@patchrace/core";

const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;

export interface PatchRaceInvocation {
  readonly cwd: string;
  readonly arguments: readonly string[];
  readonly signal?: AbortSignal;
  readonly onProgress?: (text: string) => void;
}

export interface PatchRaceBridge {
  execute(invocation: PatchRaceInvocation): Promise<CommandResult>;
}

export interface PatchRaceProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface PatchRaceProcessLauncher {
  run(options: {
    readonly executable: string;
    readonly arguments: readonly string[];
    readonly cwd: string;
    readonly signal?: AbortSignal;
    readonly onStderr?: (text: string) => void;
  }): Promise<PatchRaceProcessResult>;
}

function appendBounded(current: string, chunk: Buffer): string {
  const next = current + chunk.toString("utf8");
  if (Buffer.byteLength(next) > MAX_OUTPUT_BYTES)
    throw new Error(
      "PatchRace command output exceeded the 5 MiB safety limit.",
    );
  return next;
}

export class NodePatchRaceProcessLauncher implements PatchRaceProcessLauncher {
  run(options: {
    readonly executable: string;
    readonly arguments: readonly string[];
    readonly cwd: string;
    readonly signal?: AbortSignal;
    readonly onStderr?: (text: string) => void;
  }): Promise<PatchRaceProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(options.executable, [...options.arguments], {
        cwd: options.cwd,
        env: process.env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        child.kill("SIGTERM");
        reject(error);
      };
      child.stdout.on("data", (chunk: Buffer) => {
        try {
          stdout = appendBounded(stdout, chunk);
        } catch (error) {
          fail(error);
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        try {
          const text = chunk.toString("utf8");
          stderr = appendBounded(stderr, chunk);
          options.onStderr?.(text);
        } catch (error) {
          fail(error);
        }
      });
      child.once("error", fail);
      child.once("close", (exitCode, signal) => {
        if (settled) return;
        settled = true;
        resolve({ exitCode, signal, stdout, stderr });
      });
    });
  }
}

function validateArguments(arguments_: readonly string[]): void {
  if (arguments_.length === 0)
    throw new Error("PatchRace invocation requires a command.");
  for (const value of arguments_) {
    if (value.length === 0 || value.includes("\0"))
      throw new Error(
        "PatchRace arguments must be non-empty and contain no NUL.",
      );
  }
}

function parseCommandResult(stdout: string): CommandResult {
  const trimmed = stdout.trim();
  if (trimmed.length === 0)
    throw new Error("PatchRace returned no machine-readable result.");
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (error) {
    throw new Error("PatchRace returned malformed machine-readable output.", {
      cause: error,
    });
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("ok" in value) ||
    value.ok !== true ||
    !("command" in value) ||
    typeof value.command !== "string" ||
    !("status" in value) ||
    typeof value.status !== "string" ||
    !("sideEffects" in value) ||
    !Array.isArray(value.sideEffects)
  )
    throw new Error("PatchRace returned an incompatible command result.");
  return value as CommandResult;
}

export class CliPatchRaceBridge implements PatchRaceBridge {
  constructor(
    private readonly executable = "patchrace",
    private readonly launcher: PatchRaceProcessLauncher = new NodePatchRaceProcessLauncher(),
  ) {}

  async execute(invocation: PatchRaceInvocation): Promise<CommandResult> {
    validateArguments(invocation.arguments);
    const result = await this.launcher.run({
      executable: this.executable,
      arguments: [
        "--json",
        "--project",
        invocation.cwd,
        ...invocation.arguments,
      ],
      cwd: invocation.cwd,
      ...(invocation.signal === undefined ? {} : { signal: invocation.signal }),
      ...(invocation.onProgress === undefined
        ? {}
        : { onStderr: invocation.onProgress }),
    });
    if (result.exitCode !== 0)
      throw new Error(
        `PatchRace exited with ${String(result.exitCode)}${result.signal === null ? "" : ` (${result.signal})`}: ${result.stderr.trim() || "no diagnostic output"}`,
      );
    return parseCommandResult(result.stdout);
  }
}
