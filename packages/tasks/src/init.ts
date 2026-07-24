import {
  access,
  mkdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { stringify } from "yaml";

import {
  PatchRaceError,
  SCHEMA_VERSION,
  sha256,
  type NormalizedSuiteConfig,
  type TaskV1,
} from "@patchrace/contracts";
import { loadSuiteConfig, runProcess } from "@patchrace/core";

import { loadTask } from "./task.js";

export interface InitializeManualSuiteOptions {
  readonly projectRoot: string;
  readonly outputPath?: string;
  readonly force?: boolean;
  readonly gitExecutable?: string;
  readonly now?: () => Date;
}

export interface InitializedManualSuite {
  readonly projectRoot: string;
  readonly suitePath: string;
  readonly taskPath: string;
  readonly instructionPath: string;
  readonly baselineCommit: string;
  readonly suiteHash: `sha256:${string}`;
  readonly taskHash: `sha256:${string}`;
  readonly backupRoot: string | null;
  readonly agentInvoked: false;
}

function initError(
  code: string,
  message: string,
  path: string,
  cause?: unknown,
): PatchRaceError {
  return new PatchRaceError(
    { code, category: "CONFIG", message, path, retryable: false },
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

function logicalPath(value: string): string {
  return value.replaceAll("\\", "/") || ".";
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function currentCommit(
  projectRoot: string,
  gitExecutable: string,
): Promise<string> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const result = await runProcess({
    executable: gitExecutable,
    args: ["rev-parse", "--verify", "HEAD^{commit}"],
    cwd: projectRoot,
    timeoutMs: 10_000,
    maxOutputBytes: 64 * 1024,
    onStdout: (chunk) => {
      stdout.push(Buffer.from(chunk));
    },
    onStderr: (chunk) => {
      stderr.push(Buffer.from(chunk));
    },
  });
  const commit = Buffer.concat(stdout).toString("utf8").trim();
  if (result.status !== "completed" || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new PatchRaceError({
      code: "INIT_GIT_BASELINE_UNAVAILABLE",
      category: "PREFLIGHT",
      message:
        "Manual suite initialization requires a Git repository with a committed HEAD.",
      path: "projectRoot",
      remediation:
        Buffer.concat(stderr).toString("utf8").trim() ||
        "Create an initial commit, then run patchrace init again.",
    });
  }
  return commit;
}

function taskFor(
  commit: string,
  instructionHash: `sha256:${string}`,
  createdAt: string,
): TaskV1 {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "manual-task",
    revision: 1,
    baseline: {
      repository: ".",
      commit,
      submodules: "disabled",
      lfs: "disabled",
    },
    instruction: { file: "instruction.md", hash: instructionHash },
    setup: { commands: [], assets: [] },
    verifier: {
      visibility: "public",
      assets: [],
      commands: [
        {
          id: "diff-check",
          kind: "test",
          argv: ["git", "diff", "--check"],
          timeoutSeconds: 30,
          expectedExitCodes: [0],
          network: "forbidden",
        },
      ],
    },
    assertions: [
      { id: "diff-check", kind: "command", commandId: "diff-check" },
      {
        id: "patch-size",
        kind: "diff-limit",
        maxChangedFiles: 20,
        maxLines: 500,
        allowDependencyChanges: false,
        allowLockfileChanges: false,
      },
    ],
    budgets: {
      trialSeconds: 600,
      setupSeconds: 120,
      graderSeconds: 120,
      maxTokens: null,
      maxCostUsd: null,
      maxOutputBytes: 10 * 1024 * 1024,
      maxPatchLines: 500,
      maxChangedFiles: 20,
      diskMiB: 2048,
    },
    provenance: {
      source: "manual",
      sourceCommit: commit,
      referencePatchHash: sha256(""),
      createdAt,
      reviewedBy: "unreviewed",
    },
    metadata: {
      ecosystem: "unknown",
      category: "manual",
      split: "training",
      reviewRequired: true,
    },
  };
}

function suiteFor(
  projectRoot: string,
  suiteDirectory: string,
): NormalizedSuiteConfig {
  return {
    schemaVersion: SCHEMA_VERSION,
    project: {
      root: logicalPath(relative(suiteDirectory, projectRoot)),
      trustRepositoryCommands: false,
    },
    state: {
      directory: ".patchrace",
      retention: { rawRuns: "manual", cacheDays: 30 },
    },
    defaults: {
      concurrency: 1,
      repeat: 1,
      budgets: {
        wallSeconds: 1200,
        trialSeconds: 600,
        maxTrials: 10,
        maxTokens: null,
        maxCostUsd: null,
        diskMiB: 2048,
      },
      environment: {
        inherit: ["LANG", "LC_ALL", "PATH", "TERM"],
        pass: [],
        redact: [],
      },
    },
    adapters: {
      pi: { kind: "pi", executable: "pi" },
    },
    variants: {
      "pi-default": { adapter: "pi" },
    },
    suites: {
      manual: { tasks: ["manual-task"], split: "training" },
    },
    tasks: {
      "manual-task": { file: "tasks/manual-task/task.yaml" },
    },
    objectives: {
      policy: "correctness-first-v1",
      afterHardGates: ["stability", "cost", "latency", "footprint"],
    },
    report: {
      formats: ["json", "html"],
      includeRawCode: "local-only",
      redactionProfile: "default",
    },
    metadata: { initializedBy: "patchrace", reviewRequired: true },
  };
}

export async function initializeManualSuite(
  options: InitializeManualSuiteOptions,
): Promise<InitializedManualSuite> {
  const projectRoot = await realpath(resolve(options.projectRoot)).catch(
    (error: unknown) => {
      throw initError(
        "INIT_PROJECT_ROOT_INVALID",
        "Project root does not exist.",
        "projectRoot",
        error,
      );
    },
  );
  const suitePath = resolve(
    projectRoot,
    options.outputPath ?? ".patchrace/suite.yaml",
  );
  if (!isDescendant(projectRoot, suitePath)) {
    throw initError(
      "INIT_OUTPUT_PATH_UNSAFE",
      "Suite output must be a non-root descendant of the project root.",
      "outputPath",
    );
  }
  const suiteDirectory = resolve(suitePath, "..");
  const taskDirectory = join(suiteDirectory, "tasks", "manual-task");
  const taskPath = join(taskDirectory, "task.yaml");
  const instructionPath = join(taskDirectory, "instruction.md");
  const [suiteExists, taskExists] = await Promise.all([
    exists(suitePath),
    exists(taskDirectory),
  ]);
  if ((suiteExists || taskExists) && options.force !== true) {
    throw new PatchRaceError({
      code: "INIT_TARGET_EXISTS",
      category: "CONFLICT",
      message:
        "Suite initialization target already exists; use --force to preserve it in a backup and replace the scaffold.",
      path: suiteExists ? "outputPath" : "tasks/manual-task",
    });
  }

  const baselineCommit = await currentCommit(
    projectRoot,
    options.gitExecutable ?? "git",
  );
  const now = (options.now ?? (() => new Date()))();
  const createdAt = now.toISOString();
  let backupRoot: string | null = null;
  const moved: { readonly from: string; readonly to: string }[] = [];
  const created: string[] = [];
  try {
    if (suiteExists || taskExists) {
      backupRoot = join(
        suiteDirectory,
        "backups",
        `init-${String(now.getTime())}`,
      );
      await mkdir(join(suiteDirectory, "backups"), { recursive: true });
      await mkdir(backupRoot, { recursive: false });
      if (suiteExists) {
        const target = join(backupRoot, "suite.yaml");
        await rename(suitePath, target);
        moved.push({ from: target, to: suitePath });
      }
      if (taskExists) {
        const target = join(backupRoot, "manual-task");
        await rename(taskDirectory, target);
        moved.push({ from: target, to: taskDirectory });
      }
    }
    await mkdir(taskDirectory, { recursive: true });
    created.push(taskDirectory);
    const instruction =
      "# Task instruction\n\nDescribe the repository change to implement. Do not include a reference solution or hidden verifier details.\n";
    const task = taskFor(baselineCommit, sha256(instruction), createdAt);
    await writeFile(instructionPath, instruction, { flag: "wx" });
    await writeFile(taskPath, stringify(task, { lineWidth: 0 }), {
      flag: "wx",
    });
    await mkdir(suiteDirectory, { recursive: true });
    const suite = suiteFor(projectRoot, suiteDirectory);
    await writeFile(suitePath, stringify(suite, { lineWidth: 0 }), {
      flag: "wx",
    });
    created.push(suitePath);

    const [loadedSuite, loadedTask] = await Promise.all([
      loadSuiteConfig(suitePath),
      loadTask(taskPath),
    ]);
    if (loadedTask.task.id !== "manual-task") {
      throw initError(
        "INIT_VERIFICATION_FAILED",
        "Generated task identity failed verification.",
        "tasks.manual-task",
      );
    }
    return {
      projectRoot,
      suitePath,
      taskPath,
      instructionPath,
      baselineCommit,
      suiteHash: loadedSuite.configHash,
      taskHash: loadedTask.taskHash,
      backupRoot,
      agentInvoked: false,
    };
  } catch (error) {
    for (const path of created.toReversed()) {
      await rm(path, { recursive: true, force: true }).catch(() => undefined);
    }
    for (const entry of moved.toReversed()) {
      await mkdir(resolve(entry.to, ".."), { recursive: true });
      await rename(entry.from, entry.to).catch(() => undefined);
    }
    if (backupRoot !== null) {
      await rm(backupRoot, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
    throw error;
  }
}
