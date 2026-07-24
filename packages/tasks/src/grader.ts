import { access, mkdir, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalJson,
  normalizeError,
  sha256,
  type CommandPhaseResultV1,
  type DeterministicCommandEvidenceV1,
  type TaskCommandV1,
  type TaskV1,
} from "@patchrace/contracts";
import {
  runProcess,
  type ProcessRequest,
  type ProcessResult,
} from "@patchrace/core";

export interface RunTaskCommandPhaseOptions {
  readonly task: TaskV1;
  readonly phase: "setup" | "verifier";
  readonly workingDirectory: string;
  readonly evidenceDirectory: string;
  readonly signal?: AbortSignal;
  readonly runProcess?: (request: ProcessRequest) => Promise<ProcessResult>;
  readonly wallNow?: () => Date;
}

function graderError(
  code: string,
  category: "CONFIG" | "CONFLICT" | "SAFETY" | "PREFLIGHT",
  message: string,
  path: string,
  cause?: unknown,
): PatchRaceError {
  return new PatchRaceError(
    { code, category, message, path, retryable: false },
    cause === undefined ? undefined : { cause },
  );
}

function isDescendant(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return (
    path !== "" &&
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
  );
}

async function commandWorkingDirectory(
  root: string,
  command: TaskCommandV1,
  path: string,
): Promise<string> {
  const candidate = resolve(root, command.cwd ?? ".");
  if (candidate !== root && !isDescendant(root, candidate)) {
    throw graderError(
      "GRADER_COMMAND_CWD_UNSAFE",
      "SAFETY",
      `Command '${command.id}' working directory escapes the grader worktree.`,
      path,
    );
  }
  const canonical = await realpath(candidate).catch((error: unknown) => {
    throw graderError(
      "GRADER_COMMAND_CWD_INVALID",
      "PREFLIGHT",
      `Command '${command.id}' working directory does not exist.`,
      path,
      error,
    );
  });
  if (canonical !== root && !isDescendant(root, canonical)) {
    throw graderError(
      "GRADER_COMMAND_CWD_UNSAFE",
      "SAFETY",
      `Command '${command.id}' working directory resolves outside the grader worktree.`,
      path,
    );
  }
  return canonical;
}

function invocation(command: TaskCommandV1): {
  readonly executable: string;
  readonly args: readonly string[];
} {
  if (command.argv !== undefined) {
    const [executable, ...args] = command.argv;
    return { executable, args };
  }
  if (command.shell === undefined || command.shellKind === undefined) {
    throw graderError(
      "GRADER_COMMAND_MODE_INVALID",
      "CONFIG",
      `Command '${command.id}' has no executable form.`,
      `commands.${command.id}`,
    );
  }
  if (command.shellKind === "posix") {
    return { executable: "/bin/sh", args: ["-c", command.shell] };
  }
  return {
    executable: process.platform === "win32" ? "powershell.exe" : "pwsh",
    args: ["-NoProfile", "-NonInteractive", "-Command", command.shell],
  };
}

function phaseStatus(
  commands: readonly DeterministicCommandEvidenceV1[],
): CommandPhaseResultV1["status"] {
  if (commands.some((command) => command.status === "error")) return "error";
  if (commands.some((command) => command.status === "cancelled"))
    return "cancelled";
  if (commands.some((command) => command.status === "failed")) return "failed";
  return "passed";
}

async function pathExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

export async function runTaskCommandPhase(
  options: RunTaskCommandPhaseOptions,
): Promise<CommandPhaseResultV1> {
  const workingDirectory = await realpath(
    resolve(options.workingDirectory),
  ).catch((error: unknown) => {
    throw graderError(
      "GRADER_WORKTREE_INVALID",
      "PREFLIGHT",
      "Grader working directory does not exist.",
      "workingDirectory",
      error,
    );
  });
  const requestedEvidenceDirectory = resolve(options.evidenceDirectory);
  if (
    requestedEvidenceDirectory === workingDirectory ||
    isDescendant(workingDirectory, requestedEvidenceDirectory)
  ) {
    throw graderError(
      "GRADER_EVIDENCE_LOCATION_UNSAFE",
      "SAFETY",
      "Command evidence must be stored outside the agent/grader worktree.",
      "evidenceDirectory",
    );
  }
  await mkdir(requestedEvidenceDirectory, { recursive: true });
  const evidenceDirectory = await realpath(requestedEvidenceDirectory);
  if (
    evidenceDirectory === workingDirectory ||
    isDescendant(workingDirectory, evidenceDirectory)
  ) {
    throw graderError(
      "GRADER_EVIDENCE_LOCATION_UNSAFE",
      "SAFETY",
      "Command evidence resolves inside the agent/grader worktree.",
      "evidenceDirectory",
    );
  }
  const commands =
    options.phase === "setup"
      ? options.task.setup.commands
      : options.task.verifier.commands;
  const phaseRoot = join(evidenceDirectory, options.phase);
  await mkdir(phaseRoot, { recursive: true });
  const evidence: DeterministicCommandEvidenceV1[] = [];
  for (const [index, command] of commands.entries()) {
    const commandRoot = join(phaseRoot, command.id);
    if (await pathExists(commandRoot)) {
      throw graderError(
        "GRADER_EVIDENCE_ALREADY_EXISTS",
        "CONFLICT",
        `Evidence for command '${command.id}' already exists.`,
        `${options.phase}.commands[${index}]`,
      );
    }
    const cwd = await commandWorkingDirectory(
      workingDirectory,
      command,
      `${options.phase}.commands[${index}].cwd`,
    );
    await mkdir(commandRoot, { recursive: false });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const expectedExitCodes = command.expectedExitCodes ?? [0];
    let result: ProcessResult | undefined;
    let caught: PatchRaceError | undefined;
    const fallbackStarted = (
      options.wallNow ?? (() => new Date())
    )().toISOString();
    try {
      const commandInvocation = invocation(command);
      result = await (options.runProcess ?? runProcess)({
        executable: commandInvocation.executable,
        args: commandInvocation.args,
        cwd,
        inheritEnvironment: command.environment?.inherit ?? [
          "PATH",
          "LANG",
          "LC_ALL",
          "TERM",
        ],
        environment: command.environment?.pass ?? {},
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        timeoutMs: command.timeoutSeconds * 1000,
        maxOutputBytes: options.task.budgets.maxOutputBytes ?? 10 * 1024 * 1024,
        onStdout: (chunk) => {
          stdout.push(Buffer.from(chunk));
        },
        onStderr: (chunk) => {
          stderr.push(Buffer.from(chunk));
        },
      });
    } catch (error) {
      caught = normalizeError(error);
    }
    const stdoutBytes = Buffer.concat(stdout);
    const stderrBytes = Buffer.concat(stderr);
    const stdoutRef = `${options.phase}/${command.id}/stdout.bin`;
    const stderrRef = `${options.phase}/${command.id}/stderr.bin`;
    await Promise.all([
      writeFile(join(commandRoot, "stdout.bin"), stdoutBytes, { flag: "wx" }),
      writeFile(join(commandRoot, "stderr.bin"), stderrBytes, { flag: "wx" }),
    ]);
    const status: DeterministicCommandEvidenceV1["status"] =
      caught !== undefined
        ? caught.details.category === "INTERRUPTED"
          ? "cancelled"
          : "error"
        : result?.terminationReason === "cancelled"
          ? "cancelled"
          : result?.terminationReason === "exit" &&
              result.exitCode !== null &&
              expectedExitCodes.includes(result.exitCode)
            ? "passed"
            : "failed";
    const endedAt = (options.wallNow ?? (() => new Date()))().toISOString();
    const record: DeterministicCommandEvidenceV1 = {
      schemaVersion: SCHEMA_VERSION,
      id: command.id,
      kind: command.kind ?? "command",
      phase: options.phase,
      status,
      startedAt: result?.startedAt ?? fallbackStarted,
      endedAt: result?.endedAt ?? endedAt,
      durationMs: result?.durationMs ?? 0,
      exitCode: result?.exitCode ?? null,
      signal: result?.signal ?? null,
      terminationReason: result?.terminationReason ?? "spawn_error",
      expectedExitCodes,
      stdout: {
        evidenceRef: stdoutRef,
        bytes: stdoutBytes.byteLength,
        hash: sha256(stdoutBytes),
      },
      stderr: {
        evidenceRef: stderrRef,
        bytes: stderrBytes.byteLength,
        hash: sha256(stderrBytes),
      },
      ...(caught === undefined
        ? {}
        : {
            error: {
              code: caught.details.code,
              category: caught.details.category,
            },
          }),
    };
    await writeFile(
      join(commandRoot, "result.json"),
      `${canonicalJson(record)}\n`,
      {
        flag: "wx",
      },
    );
    evidence.push(record);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    phase: options.phase,
    status: phaseStatus(evidence),
    commands: evidence,
  };
}
