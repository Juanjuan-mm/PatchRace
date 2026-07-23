import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  PatchRaceError,
  SCHEMA_VERSION,
  assertTrialId,
  canonicalHash,
  createSortableId,
  sha256,
  type RunId,
  type TaskValidityAttemptV1,
  type TaskValidityReportV1,
  type TrialId,
} from "@patchrace/contracts";
import { runProcess, type WorktreeManager } from "@patchrace/core";

import { evaluateTaskAssertions } from "./assertions.js";
import { runTaskCommandPhase } from "./grader.js";
import { runHiddenVerifier } from "./hidden-verifier.js";
import type { LoadedTask } from "./task.js";

export interface CheckTaskValidityOptions {
  readonly task: LoadedTask;
  readonly referencePatch: Uint8Array;
  readonly manager: WorktreeManager;
  readonly runId: RunId;
  readonly evidenceDirectory: string;
  readonly repeat?: number;
  readonly nextTrialId?: () => TrialId;
}

interface AttemptInternal {
  readonly public: TaskValidityAttemptV1;
  readonly setupFingerprint: string;
  readonly verifierFingerprint: string;
}

function validityError(
  code: string,
  message: string,
  path: string,
): PatchRaceError {
  return new PatchRaceError({
    code,
    category: "CONFIG",
    message,
    path,
    retryable: false,
  });
}

function defaultTrialId(): TrialId {
  const value = createSortableId("trial");
  assertTrialId(value);
  return value;
}

async function git(
  cwd: string,
  args: readonly string[],
  stdin?: Uint8Array,
): Promise<{ readonly ok: boolean; readonly stdout: Buffer }> {
  const stdout: Buffer[] = [];
  const result = await runProcess({
    executable: "git",
    args,
    cwd,
    inheritEnvironment: ["PATH", "LANG", "LC_ALL"],
    timeoutMs: 30_000,
    maxOutputBytes: 16 * 1024 * 1024,
    ...(stdin === undefined ? {} : { stdin }),
    onStdout: (chunk) => {
      stdout.push(Buffer.from(chunk));
    },
  });
  return { ok: result.status === "completed", stdout: Buffer.concat(stdout) };
}

async function verifyLoadedInputs(task: LoadedTask): Promise<boolean> {
  for (const reference of task.referencedFiles) {
    const bytes = await readFile(reference.sourcePath).catch(() => null);
    if (bytes === null || sha256(bytes) !== reference.contentHash) return false;
  }
  return true;
}

async function setupStateHash(path: string): Promise<`sha256:${string}`> {
  const [diff, status] = await Promise.all([
    git(path, ["diff", "--binary", "--full-index", "HEAD", "--"]),
    git(path, ["status", "--porcelain=v2", "-z", "--untracked-files=all"]),
  ]);
  return canonicalHash({
    diff: sha256(diff.stdout),
    status: sha256(status.stdout),
  });
}

function commandFingerprint(
  commands: readonly {
    readonly id: string;
    readonly status: string;
    readonly exitCode: number | null;
    readonly terminationReason: string;
  }[],
): `sha256:${string}` {
  return canonicalHash(
    commands.map(({ id, status, exitCode, terminationReason }) => ({
      id,
      status,
      exitCode,
      terminationReason,
    })),
  );
}

async function applyReference(
  worktree: string,
  patch: Uint8Array,
): Promise<boolean> {
  if (patch.byteLength === 0) return true;
  return (
    await git(
      worktree,
      ["apply", "--binary", "--whitespace=nowarn", "-"],
      patch,
    )
  ).ok;
}

async function replay(
  options: CheckTaskValidityOptions,
  kind: "baseline" | "reference",
  attempt: number,
  nextTrialId: () => TrialId,
): Promise<AttemptInternal> {
  const record = await options.manager.create({
    runId: options.runId,
    trialId: nextTrialId(),
    commit: options.task.task.baseline.commit,
  });
  let verifierFingerprint = canonicalHash([]);
  try {
    const evidenceRoot = join(
      options.evidenceDirectory,
      `${kind}-${String(attempt)}`,
    );
    const setup = await runTaskCommandPhase({
      task: options.task.task,
      phase: "setup",
      workingDirectory: record.path,
      evidenceDirectory: join(evidenceRoot, "setup"),
    });
    const setupFingerprint = commandFingerprint(setup.commands);
    const stateHash = await setupStateHash(record.path);
    if (setup.status !== "passed") {
      const base = {
        kind,
        attempt,
        setupStatus: setup.status,
        verifierStatus: "not-run" as const,
        assertionStatus: "not-run" as const,
        outcome: "not-run" as const,
        setupStateHash: stateHash,
        errorCode: null,
      };
      return {
        public: { ...base, evidenceHash: canonicalHash(base) },
        setupFingerprint,
        verifierFingerprint,
      };
    }
    if (
      kind === "reference" &&
      !(await applyReference(record.path, options.referencePatch))
    ) {
      const base = {
        kind,
        attempt,
        setupStatus: setup.status,
        verifierStatus: "not-run" as const,
        assertionStatus: "not-run" as const,
        outcome: "not-run" as const,
        setupStateHash: stateHash,
        errorCode: "TASK_REFERENCE_PATCH_APPLY_FAILED",
      };
      return {
        public: { ...base, evidenceHash: canonicalHash(base) },
        setupFingerprint,
        verifierFingerprint,
      };
    }
    try {
      const verifier =
        options.task.task.verifier.visibility === "hidden"
          ? (
              await runHiddenVerifier({
                task: options.task,
                manager: options.manager,
                agentWorktree: record,
                graderRunId: options.runId,
                graderTrialId: nextTrialId(),
                evidenceDirectory: join(evidenceRoot, "verifier"),
                agentProcessStopped: true,
              })
            ).verifier
          : await runTaskCommandPhase({
              task: options.task.task,
              phase: "verifier",
              workingDirectory: record.path,
              evidenceDirectory: join(evidenceRoot, "verifier"),
            });
      verifierFingerprint = commandFingerprint(verifier.commands);
      const assertions = await evaluateTaskAssertions({
        task: options.task.task,
        workingDirectory: record.path,
        commandEvidence: verifier.commands,
      });
      const outcome: TaskValidityAttemptV1["outcome"] =
        verifier.status === "passed" && assertions.status === "passed"
          ? "passed"
          : "failed";
      const base = {
        kind,
        attempt,
        setupStatus: setup.status,
        verifierStatus: verifier.status,
        assertionStatus: assertions.status,
        outcome,
        setupStateHash: stateHash,
        errorCode: null,
      };
      return {
        public: { ...base, evidenceHash: canonicalHash(base) },
        setupFingerprint,
        verifierFingerprint,
      };
    } catch (error) {
      const code =
        error instanceof PatchRaceError
          ? error.details.code
          : "TASK_REPLAY_ERROR";
      const base = {
        kind,
        attempt,
        setupStatus: setup.status,
        verifierStatus: "error" as const,
        assertionStatus: "not-run" as const,
        outcome: "not-run" as const,
        setupStateHash: stateHash,
        errorCode: code,
      };
      return {
        public: { ...base, evidenceHash: canonicalHash(base) },
        setupFingerprint,
        verifierFingerprint,
      };
    }
  } finally {
    await options.manager.cleanup(record, { confirm: true, allowDirty: true });
  }
}

function distinct(values: readonly string[]): number {
  return new Set(values).size;
}

export async function checkTaskValidity(
  options: CheckTaskValidityOptions,
): Promise<TaskValidityReportV1> {
  const repeat = options.repeat ?? 2;
  if (!Number.isSafeInteger(repeat) || repeat < 2 || repeat > 20)
    throw validityError(
      "TASK_VALIDITY_REPEAT_INVALID",
      "Validity replay repeat must be an integer from 2 through 20.",
      "repeat",
    );
  const referencePatchHash = sha256(options.referencePatch);
  if (referencePatchHash !== options.task.task.provenance.referencePatchHash)
    throw validityError(
      "TASK_REFERENCE_PATCH_HASH_MISMATCH",
      "Reference patch does not match task provenance.",
      "referencePatch",
    );
  const nextTrialId = options.nextTrialId ?? defaultTrialId;
  const attempts: AttemptInternal[] = [];
  const findings: TaskValidityReportV1["findings"][number][] = [];
  replayLoop: for (let attempt = 1; attempt <= repeat; attempt += 1) {
    for (const kind of ["baseline", "reference"] as const) {
      if (!(await verifyLoadedInputs(options.task))) {
        findings.push({
          code: "task-input-drift",
          severity: "error",
          message: "A hashed task input changed before replay completed.",
        });
        break replayLoop;
      }
      attempts.push(await replay(options, kind, attempt, nextTrialId));
    }
  }
  const baseline = attempts.filter((item) => item.public.kind === "baseline");
  const reference = attempts.filter((item) => item.public.kind === "reference");
  const all = [...baseline, ...reference];
  if (
    all.some(
      (item) => item.public.errorCode === "TASK_REFERENCE_PATCH_APPLY_FAILED",
    )
  )
    findings.push({
      code: "reference-patch-does-not-apply",
      severity: "error",
      message:
        "The reviewed reference patch does not apply to the task baseline.",
    });
  if (
    all.some(
      (item) =>
        item.public.errorCode !== null &&
        item.public.errorCode !== "TASK_REFERENCE_PATCH_APPLY_FAILED",
    )
  )
    findings.push({
      code: "replay-infrastructure-error",
      severity: "error",
      message:
        "A replay could not complete its deterministic grader lifecycle.",
    });
  const setupStatuses = all.map((item) => item.public.setupStatus);
  const setupStates = all.map((item) => item.public.setupStateHash);
  if (setupStatuses.some((status) => status !== "passed")) {
    findings.push({
      code:
        distinct(setupStatuses) > 1 || distinct(setupStates) > 1
          ? "nondeterministic-setup"
          : "environment-dependent-setup",
      severity: "error",
      message: "Setup did not complete reproducibly in fresh worktrees.",
    });
  } else if (
    distinct(all.map((item) => item.setupFingerprint)) > 1 ||
    distinct(setupStates) > 1
  ) {
    findings.push({
      code: "nondeterministic-setup",
      severity: "error",
      message:
        "Setup command or repository-state evidence varied across replays.",
    });
  }
  const baselineOutcomes = baseline.map((item) => item.public.outcome);
  const referenceOutcomes = reference.map((item) => item.public.outcome);
  if (
    baselineOutcomes.length === repeat &&
    baselineOutcomes.every((value) => value === "passed")
  )
    findings.push({
      code: "baseline-already-passes",
      severity: "error",
      message:
        "The baseline already satisfies the verifier, indicating a leaked or solved task.",
    });
  else if (distinct(baselineOutcomes) > 1)
    findings.push({
      code: "nondeterministic-baseline-verifier",
      severity: "error",
      message: "Baseline verifier outcomes varied across attempts.",
    });
  if (
    referenceOutcomes.length === repeat &&
    referenceOutcomes.every((value) => value === "failed")
  )
    findings.push({
      code: "reference-never-passes",
      severity: "error",
      message: "The reviewed reference solution never satisfies the verifier.",
    });
  else if (distinct(referenceOutcomes) > 1)
    findings.push({
      code: "nondeterministic-reference-verifier",
      severity: "error",
      message: "Reference verifier outcomes varied across attempts.",
    });
  if (
    all.every((item) => item.public.outcome !== "not-run") &&
    distinct(all.map((item) => item.verifierFingerprint)) > 2
  )
    findings.push({
      code: "verifier-evidence-varies",
      severity: "warning",
      message:
        "Verifier command status evidence varied beyond baseline/reference outcome differences.",
    });
  const hasFlake = findings.some((finding) =>
    finding.code.startsWith("nondeterministic"),
  );
  const status = hasFlake
    ? "flaky"
    : findings.some((finding) => finding.severity === "error")
      ? "invalid"
      : "eligible";
  const publicAttempts = attempts.map((attempt) => attempt.public);
  const base = {
    schemaVersion: SCHEMA_VERSION,
    taskId: options.task.task.id,
    taskHash: options.task.taskHash,
    referencePatchHash,
    repeat,
    status,
    findings,
    attempts: publicAttempts,
  } as const;
  return { ...base, reportHash: canonicalHash(base) };
}
