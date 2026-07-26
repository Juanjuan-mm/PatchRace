import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";

import {
  ArtifactAdapterSink,
  ClaudeCodeAdapter,
  CodexAdapter,
  PiCliAdapter,
  type AgentAdapter,
  type RawRecord,
} from "@patchrace/adapters";
import {
  PatchRaceError,
  SCHEMA_VERSION,
  assertRunId,
  canonicalHash,
  createSortableId,
  sha256,
  type DiagnosisArtifactEvidenceV1,
  type DiagnosisReportCaseV1,
  type GapVariantIdentityV1,
  type JsonValue,
  type NormalizedSuiteConfig,
  type PatchComparisonV1,
  type RaceExecutionV1,
  type RacePlanV1,
  type RaceProgressEventV1,
  type RaceTrialResultV1,
  type TraceEventV1,
  type TrialId,
} from "@patchrace/contracts";
import {
  ArtifactStore,
  RunCoordinator,
  WorktreeManager,
  createRacePlan,
  ensureOwnedDirectory,
  executeRedactedReportExport,
  executeRacePlan,
  loadSuiteConfig,
  previewRedactedReportExport,
  recoverRun,
  resolveOwnedPath,
  runProcess,
  type CommandRequest,
  type CommandResult,
  type CommandService,
  type LoadedSuiteConfig,
  type RedactionProfile,
} from "@patchrace/core";
import {
  alignObservableTrajectories,
  buildDiagnosisReport,
  buildTrajectoryTimeline,
  classifyWorkflowOrCapability,
  diagnoseWithRules,
  extractTrajectoryFeatures,
  rankRace,
} from "@patchrace/diagnosis";
import {
  buildPatchComparison,
  buildComparisonReport,
  buildShareableComparisonReport,
  renderDiagnosisReportJson,
  renderDiagnosisStaticHtml,
  renderJUnitXml,
  renderReportJson,
  renderSarifJson,
  renderStaticHtml,
} from "@patchrace/report";
import {
  evaluateTaskAssertions,
  loadTask,
  runHiddenVerifier,
  runTaskCommandPhase,
  type LoadedTask,
} from "@patchrace/tasks";

import { PATCHRACE_VERSION } from "./version.js";

import { TerminalProgressView } from "./terminal.js";

function usage(code: string, message: string, path: string): never {
  throw new PatchRaceError({ code, category: "USAGE", message, path });
}

function agentEnvironmentNames(config: NormalizedSuiteConfig): string[] {
  return [
    ...new Set([
      ...config.defaults.environment.inherit,
      ...config.defaults.environment.pass,
    ]),
  ].sort();
}

function reportRedactionProfile(
  loaded: LoadedSuiteConfig,
  runRoot: string,
  recordedConfigHash: unknown,
): RedactionProfile {
  if (recordedConfigHash !== loaded.configHash)
    throw new PatchRaceError({
      code: "REPORT_EXPORT_CONFIG_DRIFT",
      category: "CONFLICT",
      message:
        "The current redaction configuration does not match the frozen run configuration.",
      path: "config",
      remediation:
        "Restore the exact suite configuration used by the run before creating a shareable export.",
    });
  if (loaded.config.report.redactionProfile !== "default")
    throw new PatchRaceError({
      code: "REPORT_REDACTION_PROFILE_UNSUPPORTED",
      category: "CONFIG",
      message: `Redaction profile '${loaded.config.report.redactionProfile}' is not implemented.`,
      path: "report.redactionProfile",
      remediation:
        "Use the reviewed 'default' profile or wait for a version that explicitly supports the named profile.",
    });
  const literals = loaded.config.defaults.environment.redact.map(
    (environmentName, index) => {
      const value = process.env[environmentName];
      if (value === undefined || value.length < 4)
        throw new PatchRaceError({
          code: "REPORT_REDACTION_VALUE_UNAVAILABLE",
          category: "PREFLIGHT",
          message: `Configured runtime redaction value '${environmentName}' is unavailable or too short.`,
          path: "defaults.environment.redact",
          remediation:
            "Set the explicitly configured environment value for this export without placing it in the suite file or command arguments.",
        });
      return { name: `environment-${index + 1}`, value };
    },
  );
  return {
    paths: [loaded.paths.projectRoot, loaded.paths.stateRoot, runRoot],
    literals,
  };
}

function adapterFor(kind: string): AgentAdapter {
  if (kind === "pi") return new PiCliAdapter();
  if (kind === "claude-code") return new ClaudeCodeAdapter();
  if (kind === "codex") return new CodexAdapter();
  throw new PatchRaceError({
    code: "RACE_ADAPTER_KIND_UNSUPPORTED",
    category: "CONFIG",
    message: `Unsupported adapter kind '${kind}'.`,
    path: "adapters.kind",
  });
}

async function git(
  cwd: string,
  args: readonly string[],
  expectedExitCodes: readonly number[] = [0],
): Promise<Buffer> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const result = await runProcess({
    executable: "git",
    args,
    cwd,
    timeoutMs: 30_000,
    maxOutputBytes: 32 * 1024 * 1024,
    onStdout: (chunk) => {
      stdout.push(Buffer.from(chunk));
    },
    onStderr: (chunk) => {
      stderr.push(Buffer.from(chunk));
    },
  });
  if (result.exitCode === null || !expectedExitCodes.includes(result.exitCode))
    throw new PatchRaceError({
      code: "RACE_GIT_EVIDENCE_FAILED",
      category: "EXECUTION",
      message: `Git evidence command failed: ${args[0] ?? "unknown"}.`,
      remediation: Buffer.concat(stderr).toString("utf8").trim().slice(0, 500),
    });
  return Buffer.concat(stdout);
}

async function capturePatch(worktree: string): Promise<Buffer> {
  const tracked = await git(worktree, [
    "diff",
    "--binary",
    "--full-index",
    "HEAD",
    "--",
  ]);
  const names = (
    await git(worktree, ["ls-files", "--others", "--exclude-standard", "-z"])
  )
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .sort();
  const untracked: Buffer[] = [];
  for (const name of names)
    untracked.push(
      await git(
        worktree,
        ["diff", "--no-index", "--binary", "--", "/dev/null", name],
        [0, 1],
      ),
    );
  return Buffer.concat([tracked, ...untracked]);
}

function changedFilesFromPatch(
  patch: string,
  protectedPaths: ReadonlySet<string>,
): PatchComparisonV1["changedFiles"] {
  const starts = [...patch.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)];
  return starts.map((match, index) => {
    const path = match[2]!;
    const start = match.index ?? 0;
    const end = starts[index + 1]?.index ?? patch.length;
    const block = patch.slice(start, end);
    const status: PatchComparisonV1["changedFiles"][number]["status"] =
      block.includes("Binary files ") || block.includes("GIT binary patch")
        ? "binary"
        : block.includes("\nnew file mode ")
          ? "added"
          : block.includes("\ndeleted file mode ")
            ? "deleted"
            : block.includes("\nrename from ")
              ? "renamed"
              : "modified";
    return {
      path,
      status,
      protectedPathViolation: protectedPaths.has(path),
    };
  });
}

async function injectSetupAssets(
  loaded: LoadedTask,
  worktree: string,
): Promise<void> {
  const references = new Map(
    loaded.referencedFiles
      .filter((file) => file.role === "setup")
      .map((file) => [file.logicalPath, file]),
  );
  for (const asset of loaded.task.setup.assets) {
    const reference = references.get(asset.source);
    if (reference === undefined)
      throw new PatchRaceError({
        code: "RACE_SETUP_ASSET_MISSING",
        category: "PREFLIGHT",
        message: `Setup asset '${asset.source}' was not loaded.`,
        path: asset.source,
      });
    const bytes = await readFile(reference.sourcePath);
    if (sha256(bytes) !== asset.hash)
      throw new PatchRaceError({
        code: "RACE_SETUP_ASSET_DRIFT",
        category: "CONFLICT",
        message: `Setup asset '${asset.source}' changed after planning.`,
        path: asset.source,
      });
    const parent = dirname(asset.mount);
    if (parent !== ".") await ensureOwnedDirectory(worktree, parent);
    await writeFile(resolveOwnedPath(worktree, asset.mount), bytes, {
      flag: "wx",
    });
  }
}

async function* rawRecords(
  records: readonly RawRecord[],
): AsyncIterable<RawRecord> {
  for (const record of records) yield record;
}

async function indexIfPresent(
  store: ArtifactStore,
  logicalPath: string,
  mediaType: string,
  sensitivity: "local-sensitive" | "local" = "local-sensitive",
): Promise<void> {
  const exists = await access(join(store.runRoot, logicalPath)).then(
    () => true,
    () => false,
  );
  if (exists)
    await store.indexExisting(logicalPath, {
      mediaType,
      sensitivity,
      producer: "cli/race",
    });
}

function storedPlan(value: unknown): RacePlanV1 {
  if (
    value === null ||
    typeof value !== "object" ||
    (value as { schemaVersion?: unknown }).schemaVersion !== SCHEMA_VERSION ||
    typeof (value as { planHash?: unknown }).planHash !== "string" ||
    !Array.isArray((value as { tasks?: unknown }).tasks) ||
    !Array.isArray((value as { variants?: unknown }).variants) ||
    !Array.isArray((value as { trials?: unknown }).trials)
  )
    throw new PatchRaceError({
      code: "RACE_RESUME_PLAN_INVALID",
      category: "CONFLICT",
      message: "The stored race plan is missing or incompatible.",
      path: "plan.json",
    });
  return value as RacePlanV1;
}

function storedTrialResult(
  value: unknown,
  trialId: TrialId,
): RaceTrialResultV1 {
  if (
    value === null ||
    typeof value !== "object" ||
    (value as { schemaVersion?: unknown }).schemaVersion !== SCHEMA_VERSION ||
    (value as { trialId?: unknown }).trialId !== trialId ||
    !Array.isArray((value as { hardGates?: unknown }).hardGates)
  )
    throw new PatchRaceError({
      code: "RACE_RESUME_RESULT_INVALID",
      category: "CONFLICT",
      message: `Completed trial '${trialId}' has no compatible result.`,
      path: `trials/${trialId}/result.json`,
    });
  return value as RaceTrialResultV1;
}

function protectedPathsFromGrade(value: unknown): ReadonlySet<string> {
  if (value === null || typeof value !== "object") return new Set();
  const assertions = (value as { assertions?: unknown }).assertions;
  if (assertions === null || typeof assertions !== "object") return new Set();
  const records = (assertions as { assertions?: unknown }).assertions;
  if (!Array.isArray(records)) return new Set();
  return new Set(
    records.flatMap((record) => {
      if (
        record === null ||
        typeof record !== "object" ||
        (record as { kind?: unknown }).kind !== "protected-paths"
      )
        return [];
      const evidence = (record as { evidence?: unknown }).evidence;
      if (evidence === null || typeof evidence !== "object") return [];
      const matched = (evidence as { matched?: unknown }).matched;
      return Array.isArray(matched)
        ? matched.filter((path): path is string => typeof path === "string")
        : [];
    }),
  );
}

async function traceEventsFrom(
  store: ArtifactStore,
  trialId: TrialId,
): Promise<readonly TraceEventV1[]> {
  const path = join(store.runRoot, "trials", trialId, "trace.jsonl");
  const content = await readFile(path, "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    },
  );
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TraceEventV1);
}

async function reindexCompletedTrial(
  store: ArtifactStore,
  trialId: TrialId,
): Promise<void> {
  await Promise.all([
    indexIfPresent(
      store,
      `trials/${trialId}/invocation.json`,
      "application/json",
      "local",
    ),
    indexIfPresent(
      store,
      `trials/${trialId}/raw/stdout.log`,
      "application/octet-stream",
    ),
    indexIfPresent(
      store,
      `trials/${trialId}/raw/stderr.log`,
      "application/octet-stream",
    ),
    indexIfPresent(
      store,
      `trials/${trialId}/raw/records.jsonl`,
      "application/x-ndjson",
    ),
    indexIfPresent(
      store,
      `trials/${trialId}/trace.jsonl`,
      "application/x-ndjson",
    ),
    indexIfPresent(store, `trials/${trialId}/patch.diff`, "text/x-diff"),
    indexIfPresent(
      store,
      `trials/${trialId}/grade.json`,
      "application/json",
      "local",
    ),
    indexIfPresent(
      store,
      `trials/${trialId}/metrics.json`,
      "application/json",
      "local",
    ),
    indexIfPresent(
      store,
      `trials/${trialId}/result.json`,
      "application/json",
      "local",
    ),
  ]);
}

function variantObject(value: Readonly<Record<string, unknown>>): {
  readonly adapter: string;
  readonly model: string | null;
  readonly harness: Readonly<Record<string, JsonValue>>;
  readonly workflow: Readonly<Record<string, JsonValue>>;
} {
  return {
    adapter: String(value["adapter"]),
    model: typeof value["model"] === "string" ? value["model"] : null,
    harness: (value["harness"] ?? {}) as Readonly<Record<string, JsonValue>>,
    workflow: (value["workflow"] ?? {}) as Readonly<Record<string, JsonValue>>,
  };
}

export class ComparisonCommandService implements CommandService {
  constructor(
    private readonly fallback: CommandService,
    private readonly stderr: (text: string) => void = (text) =>
      process.stderr.write(text),
  ) {}

  async execute(request: CommandRequest): Promise<CommandResult> {
    if (request.command === "run" || request.command === "race")
      return this.race(request);
    if (request.command === "report") return this.report(request);
    if (request.command === "diagnose") return this.diagnose(request);
    return this.fallback.execute(request);
  }

  private async race(request: CommandRequest): Promise<CommandResult> {
    const projectRoot = resolve(
      String(request.options["project"] ?? process.cwd()),
    );
    const loadedConfig = await loadSuiteConfig(
      resolve(
        projectRoot,
        String(request.options["config"] ?? ".patchrace/suite.yaml"),
      ),
    );
    const config = loadedConfig.config;
    const inheritedAgentEnvironment = agentEnvironmentNames(config);
    const resumeId =
      request.command === "run" && typeof request.options["resume"] === "string"
        ? request.options["resume"]
        : null;
    const resumeStore =
      resumeId === null
        ? null
        : await ArtifactStore.open(loadedConfig.paths.stateRoot, resumeId);
    const resumePlan =
      resumeStore === null
        ? null
        : storedPlan(
            JSON.parse(
              await readFile(join(resumeStore.runRoot, "plan.json"), "utf8"),
            ),
          );
    if (config.project.trustRepositoryCommands !== true)
      throw new PatchRaceError({
        code: "RACE_REPOSITORY_TRUST_REQUIRED",
        category: "PREFLIGHT",
        message:
          "Race execution requires explicit trustRepositoryCommands: true because setup and verifier commands execute on the host.",
        path: "project.trustRepositoryCommands",
      });
    const suiteId =
      typeof request.options["suite"] === "string"
        ? request.options["suite"]
        : resumeStore !== null &&
            typeof resumeStore.manifest.source["suiteId"] === "string"
          ? resumeStore.manifest.source["suiteId"]
          : Object.keys(config.suites)[0];
    if (suiteId === undefined || config.suites[suiteId] === undefined)
      usage("RACE_SUITE_UNKNOWN", "Select a configured suite.", "suite");
    const suite = config.suites[suiteId]!;
    const selectedVariantIds =
      resumePlan !== null
        ? resumePlan.variants.map((variant) => variant.variantId)
        : request.command === "race"
          ? typeof request.options["variants"] === "string"
            ? request.options["variants"].split(",").filter(Boolean)
            : Object.keys(config.variants)
          : request.options["compare"] === true
            ? Object.keys(config.variants)
            : [
                typeof request.options["variant"] === "string"
                  ? request.options["variant"]
                  : Object.keys(config.variants)[0]!,
              ];
    if (
      resumePlan !== null &&
      ((typeof request.options["variant"] === "string" &&
        (resumePlan.variants.length !== 1 ||
          resumePlan.variants[0]?.variantId !== request.options["variant"])) ||
        (request.options["repeat"] !== undefined &&
          Number(request.options["repeat"]) !== resumePlan.repeat))
    )
      usage(
        "RACE_RESUME_SELECTION_CONFLICT",
        "Resume selectors must match the frozen stored plan.",
        "resume",
      );
    if (
      selectedVariantIds.length === 0 ||
      selectedVariantIds.some((id) => config.variants[id] === undefined)
    )
      usage("RACE_VARIANT_UNKNOWN", "Select configured variants.", "variants");
    const sourceDirectory = dirname(loadedConfig.sourcePath);
    const loadedTasks = await Promise.all(
      suite.tasks.map(async (taskId) => {
        const declaration = config.tasks[taskId];
        if (declaration === undefined)
          usage(
            "RACE_TASK_UNKNOWN",
            `Suite references unknown task '${taskId}'.`,
            "suite.tasks",
          );
        return loadTask(
          resolve(sourceDirectory, declaration.file),
          typeof request.options["verifierRoot"] === "string"
            ? { verifierRoot: request.options["verifierRoot"] }
            : {},
        );
      }),
    );
    const adapterEntries = new Map<
      string,
      {
        adapter: AgentAdapter;
        executable: string;
        executableArgs: readonly string[];
        probe: Awaited<ReturnType<AgentAdapter["probe"]>>;
      }
    >();
    for (const variantId of selectedVariantIds) {
      const variant = variantObject(config.variants[variantId]!);
      const declaration = config.adapters[variant.adapter];
      if (declaration === undefined)
        usage(
          "RACE_ADAPTER_UNKNOWN",
          `Variant '${variantId}' references an unknown adapter.`,
          `variants.${variantId}.adapter`,
        );
      if (!adapterEntries.has(variant.adapter)) {
        const adapter = adapterFor(declaration.kind);
        const probe = await adapter.probe(
          {
            executable: declaration.executable,
            ...(declaration.args === undefined
              ? {}
              : { executableArgs: declaration.args }),
            cwd: loadedConfig.paths.projectRoot,
            inheritEnvironment: inheritedAgentEnvironment,
          },
          new AbortController().signal,
        );
        if (
          probe.availability === "unavailable" ||
          probe.auth.state === "missing" ||
          probe.auth.state === "expired"
        )
          throw new PatchRaceError({
            code: "RACE_ADAPTER_PREFLIGHT_FAILED",
            category: "PREFLIGHT",
            message: `Adapter '${variant.adapter}' is not ready.`,
            path: `adapters.${variant.adapter}`,
            remediation: probe.remediation.join(" "),
          });
        adapterEntries.set(variant.adapter, {
          adapter,
          executable: declaration.executable,
          executableArgs: declaration.args ?? [],
          probe,
        });
      }
    }
    let resumeTrialIndex = 0;
    const computedPlan = createRacePlan({
      tasks: loadedTasks.map((loaded) => ({
        taskId: loaded.task.id,
        taskHash: loaded.taskHash,
        baselineCommit: loaded.task.baseline.commit,
        instructionHash: loaded.task.instruction.hash,
      })),
      variants: selectedVariantIds.map((variantId) => {
        const variant = variantObject(config.variants[variantId]!);
        const declaration = config.adapters[variant.adapter]!;
        return {
          variantId,
          adapter: {
            id: variant.adapter,
            kind: declaration.kind,
            executable: declaration.executable,
            version:
              adapterEntries.get(variant.adapter)?.probe.version.normalized ??
              null,
          },
          model: variant.model,
          harness: variant.harness,
          workflow: variant.workflow,
          environmentNames: [...inheritedAgentEnvironment],
        };
      }),
      repeat:
        resumePlan !== null
          ? resumePlan.repeat
          : request.options["repeat"] === undefined
            ? config.defaults.repeat
            : Number(request.options["repeat"]),
      maxTrials: config.defaults.budgets.maxTrials,
      budgetIdentity: { ...config.defaults.budgets },
      ...(resumePlan === null
        ? {}
        : {
            createTrialId: () => {
              const trial = resumePlan.trials[resumeTrialIndex++];
              if (trial === undefined)
                throw new PatchRaceError({
                  code: "RACE_RESUME_PLAN_INVALID",
                  category: "CONFLICT",
                  message: "Stored plan trial allocation is inconsistent.",
                  path: "plan.json",
                });
              return trial.trialId;
            },
          }),
    });
    if (
      resumePlan !== null &&
      (computedPlan.planHash !== resumePlan.planHash ||
        resumeStore?.manifest.planHash !== resumePlan.planHash ||
        resumeStore.manifest.source["configHash"] !== loadedConfig.configHash)
    )
      throw new PatchRaceError({
        code: "RACE_RESUME_IDENTITY_CONFLICT",
        category: "CONFLICT",
        message:
          "Current configuration, task snapshots, adapter versions, or budgets do not match the frozen run.",
        path: "resume",
        remediation:
          "Restore the exact recorded inputs or start a new explicit attempt.",
      });
    const plan = resumePlan ?? computedPlan;
    let store: ArtifactStore;
    let coordinator: RunCoordinator;
    let priorResults: RaceTrialResultV1[] = [];
    let activeTrials = [...plan.trials];
    if (resumeStore === null) {
      store = await ArtifactStore.create({
        stateRoot: loadedConfig.paths.stateRoot,
        manifest: {
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date().toISOString(),
          planHash: plan.planHash,
          source: {
            repository: {
              logicalPath: ".",
              commit: loadedTasks[0]?.task.baseline.commit ?? null,
            },
            configHash: loadedConfig.configHash,
            suiteId,
            split: suite.split,
          },
          controller: {
            version: PATCHRACE_VERSION,
            node: process.version,
            platform: `${process.platform}-${process.arch}`,
          },
          budgets: {
            wallSeconds: config.defaults.budgets.wallSeconds,
            maxTrials: config.defaults.budgets.maxTrials,
            maxTokens: config.defaults.budgets.maxTokens,
            maxCostUsd: config.defaults.budgets.maxCostUsd,
          },
          trials: plan.trials.map((trial) => ({ ...trial })),
          artifactIndexVersion: SCHEMA_VERSION,
        },
      });
      await store.finalizeJson("plan.json", plan, {
        sensitivity: "local",
        producer: "cli/race",
      });
      coordinator = new RunCoordinator(
        store,
        plan.trials.map((trial) => trial.trialId),
      );
      await coordinator.initialize();
    } else {
      store = resumeStore;
      const recovery = await recoverRun(store.runRoot);
      if (recovery.needsInspection)
        throw new PatchRaceError({
          code: "RACE_RESUME_REQUIRES_INSPECTION",
          category: "CONFLICT",
          message: "The interrupted run failed recovery validation.",
          path: "resume",
          remediation: recovery.reasons.join("; "),
        });
      if (
        ["completed", "cancelled", "failed", "budget_exhausted"].includes(
          recovery.state,
        )
      )
        throw new PatchRaceError({
          code: "RACE_RESUME_RUN_TERMINAL",
          category: "CONFLICT",
          message: `Run '${store.runId}' is already terminal.`,
          path: "resume",
        });
      if (recovery.resumableTrials.length === 0)
        throw new PatchRaceError({
          code: "RACE_RESUME_NOTHING_SAFE",
          category: "CONFLICT",
          message: "No unstarted trial remains safe to resume.",
          path: "resume",
        });
      const knownTrialIds = new Set(plan.trials.map((trial) => trial.trialId));
      if (
        [...recovery.completedTrials, ...recovery.resumableTrials].some(
          (trialId) => !knownTrialIds.has(trialId),
        )
      )
        throw new PatchRaceError({
          code: "RACE_RESUME_TRIAL_CONFLICT",
          category: "CONFLICT",
          message: "Recovery references a trial outside the frozen plan.",
          path: "resume",
        });
      for (const trialId of recovery.resumableTrials) {
        const trialArtifactsExist = await access(
          join(store.runRoot, "trials", trialId),
        ).then(
          () => true,
          () => false,
        );
        const worktreeExists = await access(
          join(loadedConfig.paths.stateRoot, "worktrees", store.runId, trialId),
        ).then(
          () => true,
          () => false,
        );
        if (trialArtifactsExist || worktreeExists)
          throw new PatchRaceError({
            code: "RACE_RESUME_PARTIAL_TRIAL_UNSAFE",
            category: "CONFLICT",
            message:
              "A resumable trial already has partial artifacts or a worktree; refusing to duplicate an Agent attempt.",
            path: `trials/${trialId}`,
            remediation:
              "Retain the evidence for inspection and start a new explicit attempt.",
          });
      }
      priorResults = await Promise.all(
        recovery.completedTrials.map(async (trialId) =>
          storedTrialResult(
            JSON.parse(
              await readFile(
                join(store.runRoot, "trials", trialId, "result.json"),
                "utf8",
              ),
            ),
            trialId,
          ),
        ),
      );
      const resumable = new Set(recovery.resumableTrials);
      activeTrials = plan.trials.filter((trial) =>
        resumable.has(trial.trialId),
      );
      coordinator = RunCoordinator.resume(store, recovery);
      await Promise.all([
        indexIfPresent(store, "manifest.json", "application/json", "local"),
        indexIfPresent(store, "plan.json", "application/json", "local"),
        ...priorResults.map((result) =>
          reindexCompletedTrial(store, result.trialId),
        ),
      ]);
    }
    await coordinator.transitionRun("preparing");
    const manager = await WorktreeManager.open(
      loadedConfig.paths.projectRoot,
      loadedConfig.paths.stateRoot,
    );
    const taskById = new Map(loadedTasks.map((task) => [task.task.id, task]));
    const variantById = new Map(
      selectedVariantIds.map((id) => [id, variantObject(config.variants[id]!)]),
    );
    const patchViews: PatchComparisonV1[] = [];
    const traceViews: {
      readonly taskId: string;
      readonly variantId: string;
      readonly repetition: number;
      readonly events: readonly TraceEventV1[];
    }[] = [];
    for (const result of priorResults) {
      const patch = await readFile(
        join(store.runRoot, "trials", result.trialId, "patch.diff"),
        "utf8",
      );
      const grade = JSON.parse(
        await readFile(
          join(store.runRoot, "trials", result.trialId, "grade.json"),
          "utf8",
        ),
      );
      patchViews.push(
        buildPatchComparison({
          trialId: result.trialId,
          unifiedDiff: patch,
          changedFiles: changedFilesFromPatch(
            patch,
            protectedPathsFromGrade(grade),
          ),
          referenceAccess: "withheld",
        }),
      );
      traceViews.push({
        taskId: result.taskId,
        variantId: result.variantId,
        repetition: result.repetition,
        events: await traceEventsFrom(store, result.trialId),
      });
    }
    const progress = new TerminalProgressView({
      stderr: this.stderr,
      machineMode: request.options["json"] === true,
    });
    let progressSequence = 0;
    let completedTrials = priorResults.length;
    const update = (
      event: Omit<
        RaceProgressEventV1,
        "schemaVersion" | "sequence" | "completedTrials" | "totalTrials"
      >,
    ): void =>
      progress.update({
        schemaVersion: SCHEMA_VERSION,
        sequence: ++progressSequence,
        completedTrials,
        totalTrials: plan.trials.length,
        ...event,
      });
    update({
      phase: "planned",
      trialId: null,
      taskId: null,
      variantId: null,
      message:
        resumeId === null
          ? `${plan.trials.length} trials`
          : `${activeTrials.length} resumable of ${plan.trials.length} trials`,
    });
    await coordinator.transitionRun("running");
    if (
      resumeId !== null &&
      ((config.defaults.budgets.maxTokens !== null &&
        priorResults.some(
          (result) => result.metrics.tokens.availability === "unavailable",
        )) ||
        (config.defaults.budgets.maxCostUsd !== null &&
          priorResults.some(
            (result) => result.metrics.costUsd.availability === "unavailable",
          )))
    )
      throw new PatchRaceError({
        code: "RACE_RESUME_BUDGET_UNAVAILABLE",
        category: "BUDGET",
        message:
          "A bounded token or cost budget cannot be resumed because prior usage is unavailable.",
        path: "resume",
      });
    const priorTokens = priorResults.reduce(
      (total, result) => total + (result.metrics.tokens.value ?? 0),
      0,
    );
    const priorCost = priorResults.reduce(
      (total, result) => total + (result.metrics.costUsd.value ?? 0),
      0,
    );
    const remainingTokens =
      config.defaults.budgets.maxTokens === null
        ? null
        : Math.max(0, config.defaults.budgets.maxTokens - priorTokens);
    const remainingCost =
      config.defaults.budgets.maxCostUsd === null
        ? null
        : Math.max(0, config.defaults.budgets.maxCostUsd - priorCost);
    const priorBoundExhausted = remainingTokens === 0 || remainingCost === 0;
    const activePlan: RacePlanV1 = { ...plan, trials: activeTrials };
    const currentExecution = await executeRacePlan({
      plan: activePlan,
      concurrency: config.defaults.concurrency,
      budgets: {
        wallMs: config.defaults.budgets.wallSeconds * 1000,
        maxTrials: priorBoundExhausted
          ? 0
          : Math.max(
              0,
              config.defaults.budgets.maxTrials - priorResults.length,
            ),
        maxTokens: remainingTokens,
        maxCostUsd: remainingCost,
        maxDiskBytes: config.defaults.budgets.diskMiB * 1024 * 1024,
      },
      executeTrial: async (trial, context): Promise<RaceTrialResultV1> => {
        const loaded = taskById.get(trial.taskId)!;
        const variant = variantById.get(trial.variantId)!;
        const adapterEntry = adapterEntries.get(variant.adapter)!;
        await coordinator.transitionTrial(trial.trialId, "preparing");
        const worktree = await manager.create({
          runId: store.runId,
          trialId: trial.trialId,
          commit: trial.baselineCommit,
        });
        let terminalEmitted = false;
        try {
          update({
            phase: "preparing",
            trialId: trial.trialId,
            taskId: trial.taskId,
            variantId: trial.variantId,
            message: null,
          });
          await injectSetupAssets(loaded, worktree.path);
          const evidenceDirectory = join(
            store.runRoot,
            "trials",
            trial.trialId,
            "commands",
          );
          const setup = await runTaskCommandPhase({
            task: loaded.task,
            phase: "setup",
            workingDirectory: worktree.path,
            evidenceDirectory,
            signal: context.signal,
          });
          const instructionRef = loaded.referencedFiles.find(
            (file) => file.role === "instruction",
          )!;
          const instruction = await readFile(instructionRef.sourcePath, "utf8");
          const prepared = await adapterEntry.adapter.prepare(
            {
              executable: adapterEntry.executable,
              executableArgs: adapterEntry.executableArgs,
              trialId: trial.trialId,
              taskHash: trial.taskHash,
              variantHash: trial.variantHash,
              worktree: worktree.path,
              instruction,
              ...(variant.model === null ? {} : { model: variant.model }),
              sandboxMode:
                variant.harness["sandbox"] === "read-only"
                  ? "read-only"
                  : "workspace-write",
              approvalMode: "never",
              inheritEnvironment: inheritedAgentEnvironment,
              budgets: {
                wallMs: loaded.task.budgets.trialSeconds * 1000,
                maxTokens: loaded.task.budgets.maxTokens,
                maxCostUsd: loaded.task.budgets.maxCostUsd,
                maxOutputBytes:
                  loaded.task.budgets.maxOutputBytes ?? 10 * 1024 * 1024,
                ...(loaded.task.budgets.maxRecords === undefined
                  ? {}
                  : { maxRecords: loaded.task.budgets.maxRecords }),
              },
            },
            context.signal,
          );
          await store.finalizeJson(
            `trials/${trial.trialId}/invocation.json`,
            {
              schemaVersion: SCHEMA_VERSION,
              invocationId: prepared.invocationId,
              adapter: prepared.adapter,
              adapterVersion: prepared.adapterVersion,
              executionMode: prepared.executionMode,
              trialId: prepared.trialId,
              taskHash: prepared.taskHash,
              variantHash: prepared.variantHash,
              executableLogicalName: variant.adapter,
              executablePathHash: sha256(prepared.executable),
              version: adapterEntry.probe.version.normalized,
              authState: adapterEntry.probe.auth.state,
              executableArgumentHashes: prepared.args
                .slice(0, prepared.executableArgumentCount)
                .map((argument) => sha256(argument)),
              args: prepared.args
                .slice(prepared.executableArgumentCount)
                .map((argument) =>
                  argument === instruction
                    ? `[PROMPT:${prepared.instructionHash}]`
                    : argument,
                ),
              worktree: `worktrees/${store.runId}/${trial.trialId}`,
              environmentNames: prepared.environmentNames,
              model: prepared.model ?? null,
              sandboxMode: prepared.sandboxMode,
              approvalMode: prepared.approvalMode,
              budgets: prepared.budgets,
              limitations: prepared.limitations,
            },
            { sensitivity: "local", producer: "cli/race" },
          );
          update({
            phase: "running",
            trialId: trial.trialId,
            taskId: trial.taskId,
            variantId: trial.variantId,
            message: null,
          });
          await coordinator.transitionTrial(trial.trialId, "running");
          const sink = new ArtifactAdapterSink(
            store,
            `trials/${trial.trialId}`,
          );
          const adapterResult = await adapterEntry.adapter.run(
            prepared,
            sink,
            context.signal,
          );
          const traceEvents: TraceEventV1[] = [];
          for await (const event of adapterEntry.adapter.normalize(
            rawRecords(adapterResult.records),
            {
              trialId: trial.trialId,
              rawPath: `trials/${trial.trialId}/raw/records.jsonl`,
            },
          )) {
            traceEvents.push(event);
            await store.appendJsonLine(
              `trials/${trial.trialId}/trace.jsonl`,
              event,
            );
          }
          traceViews.push({
            taskId: trial.taskId,
            variantId: trial.variantId,
            repetition: trial.repetition,
            events: traceEvents,
          });
          await Promise.all([
            indexIfPresent(
              store,
              `trials/${trial.trialId}/raw/stdout.log`,
              "application/octet-stream",
            ),
            indexIfPresent(
              store,
              `trials/${trial.trialId}/raw/stderr.log`,
              "application/octet-stream",
            ),
            indexIfPresent(
              store,
              `trials/${trial.trialId}/raw/records.jsonl`,
              "application/x-ndjson",
            ),
            indexIfPresent(
              store,
              `trials/${trial.trialId}/trace.jsonl`,
              "application/x-ndjson",
            ),
          ]);
          update({
            phase: "grading",
            trialId: trial.trialId,
            taskId: trial.taskId,
            variantId: trial.variantId,
            message: null,
          });
          await coordinator.transitionTrial(trial.trialId, "grading");
          const verifier =
            loaded.task.verifier.visibility === "hidden"
              ? (
                  await runHiddenVerifier({
                    task: loaded,
                    manager,
                    agentWorktree: worktree,
                    graderRunId: store.runId,
                    graderTrialId: createSortableId("trial") as TrialId,
                    evidenceDirectory: join(
                      store.runRoot,
                      "trials",
                      trial.trialId,
                      "hidden-verifier",
                    ),
                    agentProcessStopped: true,
                    signal: context.signal,
                  })
                ).verifier
              : await runTaskCommandPhase({
                  task: loaded.task,
                  phase: "verifier",
                  workingDirectory: worktree.path,
                  evidenceDirectory,
                  signal: context.signal,
                });
          const assertions = await evaluateTaskAssertions({
            task: loaded.task,
            workingDirectory: worktree.path,
            baselineCommit: loaded.task.baseline.commit,
            commandEvidence: [...setup.commands, ...verifier.commands],
          });
          const patch = await capturePatch(worktree.path);
          const protectedPaths = new Set(
            assertions.assertions.flatMap((assertion) => {
              const matched = assertion.evidence["matched"];
              return assertion.kind === "protected-paths" &&
                Array.isArray(matched)
                ? matched.filter(
                    (value): value is string => typeof value === "string",
                  )
                : [];
            }),
          );
          patchViews.push(
            buildPatchComparison({
              trialId: trial.trialId,
              unifiedDiff: patch.toString("utf8"),
              changedFiles: changedFilesFromPatch(
                patch.toString("utf8"),
                protectedPaths,
              ),
              referenceAccess: "withheld",
            }),
          );
          const hardGates = [
            {
              id: "setup",
              status:
                setup.status === "passed"
                  ? ("passed" as const)
                  : ("failed" as const),
              evidence: [`trials/${trial.trialId}/grade.json`],
            },
            {
              id: "verifier",
              status:
                verifier.status === "passed"
                  ? ("passed" as const)
                  : ("failed" as const),
              evidence: [`trials/${trial.trialId}/grade.json`],
            },
            {
              id: "assertions",
              status:
                assertions.status === "passed"
                  ? ("passed" as const)
                  : assertions.status === "error"
                    ? ("error" as const)
                    : ("failed" as const),
              evidence: [`trials/${trial.trialId}/grade.json`],
            },
          ];
          const integrity =
            loaded.task.verifier.visibility === "hidden"
              ? ("unknown" as const)
              : ("valid" as const);
          const outcome =
            adapterResult.status === "completed" &&
            hardGates.every((gate) => gate.status === "passed")
              ? ("passed" as const)
              : ("failed" as const);
          const cost =
            adapterResult.metrics.cost?.currency === "USD"
              ? adapterResult.metrics.cost.amount
              : null;
          const result: RaceTrialResultV1 = {
            schemaVersion: SCHEMA_VERSION,
            ...trial,
            terminalStatus: adapterResult.status,
            integrity,
            outcome,
            hardGates,
            metrics: {
              durationMs: {
                value: adapterResult.metrics.controllerDurationMs,
                unit: "ms",
                availability: "derived",
                source: "controller",
              },
              costUsd: {
                value: cost,
                unit: "USD",
                availability: cost === null ? "unavailable" : "observed",
                source: "adapter",
              },
              tokens: {
                value: adapterResult.metrics.totalTokens,
                unit: "tokens",
                availability:
                  adapterResult.metrics.totalTokens === null
                    ? "unavailable"
                    : "observed",
                source: "adapter",
              },
              footprintLines: {
                value: assertions.summary.changedLines,
                unit: "lines",
                availability: "derived",
                source: "grader",
              },
            },
            artifacts: {
              patch: `trials/${trial.trialId}/patch.diff`,
              grade: `trials/${trial.trialId}/grade.json`,
              trace: `trials/${trial.trialId}/trace.jsonl`,
              result: `trials/${trial.trialId}/result.json`,
            },
            limitations: [
              ...adapterResult.errors.map((error) => error.code),
              ...(integrity === "unknown"
                ? ["host_hidden_verifier_integrity_unknown"]
                : []),
            ],
          };
          await store.finalizeBytes(
            `trials/${trial.trialId}/patch.diff`,
            patch,
            {
              mediaType: "text/x-diff",
              sensitivity: "local-sensitive",
              producer: "cli/race",
            },
          );
          await store.finalizeJson(
            `trials/${trial.trialId}/grade.json`,
            {
              schemaVersion: SCHEMA_VERSION,
              integrity,
              outcome,
              hardGates,
              setup,
              verifier,
              assertions,
            },
            { sensitivity: "local", producer: "cli/race" },
          );
          await store.finalizeJson(
            `trials/${trial.trialId}/metrics.json`,
            result.metrics,
            { sensitivity: "local", producer: "cli/race" },
          );
          const resultRecord = await store.finalizeJson(
            `trials/${trial.trialId}/result.json`,
            result,
            { sensitivity: "local", producer: "cli/race" },
          );
          await coordinator.transitionTrial(trial.trialId, "completed", [
            resultRecord.hash,
          ]);
          context.reportUsage({
            tokens: adapterResult.metrics.totalTokens,
            costUsd: cost,
            diskBytes: patch.byteLength,
          });
          completedTrials += 1;
          update({
            phase: outcome === "passed" ? "completed" : "failed",
            trialId: trial.trialId,
            taskId: trial.taskId,
            variantId: trial.variantId,
            message: outcome,
          });
          terminalEmitted = true;
          return result;
        } catch (error) {
          if (!terminalEmitted) {
            await coordinator
              .transitionTrial(
                trial.trialId,
                context.signal.aborted ? "cancelled" : "failed",
              )
              .catch(() => undefined);
            completedTrials += 1;
            update({
              phase: context.signal.aborted ? "interrupted" : "failed",
              trialId: trial.trialId,
              taskId: trial.taskId,
              variantId: trial.variantId,
              message: error instanceof Error ? error.message : "trial failed",
            });
          }
          throw error;
        } finally {
          await manager
            .cleanup(worktree, { confirm: true, allowDirty: true })
            .catch(() => undefined);
        }
      },
    });
    const planOrder = new Map(
      plan.trials.map((trial, index) => [trial.trialId, index]),
    );
    const execution = {
      ...currentExecution,
      plan,
      trials: [...priorResults, ...currentExecution.trials].sort(
        (left, right) =>
          planOrder.get(left.trialId)! - planOrder.get(right.trialId)!,
      ),
      scheduler: [
        ...priorResults.map((result) => ({
          trialId: result.trialId,
          status: "completed" as const,
          errorCode: null,
        })),
        ...currentExecution.scheduler,
      ].sort(
        (left, right) =>
          planOrder.get(left.trialId)! - planOrder.get(right.trialId)!,
      ),
    };
    await coordinator.transitionRun("grading");
    const ranking = rankRace(execution, {
      schemaVersion: SCHEMA_VERSION,
      id: config.objectives.policy,
      first: "hard-gates",
      afterHardGates: config.objectives.afterHardGates as (
        "stability" | "cost" | "latency" | "footprint"
      )[],
    });
    const timelines = plan.tasks.flatMap((task) =>
      Array.from({ length: plan.repeat }, (_, index) => {
        const repetition = index + 1;
        return {
          taskId: task.taskId,
          repetition,
          timeline: buildTrajectoryTimeline({
            traces: plan.variants.map((variant) => ({
              variantId: variant.variantId,
              events:
                traceViews.find(
                  (trace) =>
                    trace.taskId === task.taskId &&
                    trace.variantId === variant.variantId &&
                    trace.repetition === repetition,
                )?.events ?? [],
            })),
          }),
        };
      }),
    );
    const report = buildComparisonReport({
      execution,
      ranking,
      patches: patchViews,
      timelines,
    });
    const shareableReport = buildShareableComparisonReport(report);
    const executionRecord = await store.finalizeJson(
      "execution.json",
      execution,
      {
        sensitivity: "local",
        producer: "cli/race",
      },
    );
    const rankingRecord = await store.finalizeJson("ranking.json", ranking, {
      sensitivity: "local",
      producer: "cli/race",
    });
    const reportRecord = await store.finalizeJson(
      "report/report.json",
      report,
      {
        sensitivity: "local",
        producer: "report/model",
      },
    );
    const htmlRecord = await store.finalizeBytes(
      "report/index.html",
      Buffer.from(renderStaticHtml(report, { artifactBase: "../" })),
      { mediaType: "text/html", sensitivity: "local", producer: "report/html" },
    );
    const junitRecord = await store.finalizeBytes(
      "report/junit.xml",
      Buffer.from(renderJUnitXml(report)),
      {
        mediaType: "application/xml",
        sensitivity: "local",
        producer: "report/junit",
      },
    );
    const sarifRecord = await store.finalizeBytes(
      "report/results.sarif",
      Buffer.from(renderSarifJson(report)),
      {
        mediaType: "application/sarif+json",
        sensitivity: "local",
        producer: "report/sarif",
      },
    );
    const shareableReportRecord = await store.finalizeJson(
      "report/shareable/report.json",
      shareableReport,
      {
        sensitivity: "local",
        producer: "report/shareable-model",
      },
    );
    const shareableHtmlRecord = await store.finalizeBytes(
      "report/shareable/index.html",
      Buffer.from(renderStaticHtml(shareableReport)),
      {
        mediaType: "text/html",
        sensitivity: "local",
        producer: "report/shareable-html",
      },
    );
    const shareableJunitRecord = await store.finalizeBytes(
      "report/shareable/junit.xml",
      Buffer.from(renderJUnitXml(shareableReport)),
      {
        mediaType: "application/xml",
        sensitivity: "local",
        producer: "report/shareable-junit",
      },
    );
    const shareableSarifRecord = await store.finalizeBytes(
      "report/shareable/results.sarif",
      Buffer.from(renderSarifJson(shareableReport)),
      {
        mediaType: "application/sarif+json",
        sensitivity: "local",
        producer: "report/shareable-sarif",
      },
    );
    const indexRecord = await store.finalizeIndex();
    await coordinator.transitionRun(
      execution.status === "completed"
        ? "completed"
        : execution.status === "cancelled"
          ? "cancelled"
          : execution.status === "budget_exhausted"
            ? "budget_exhausted"
            : "failed",
      [
        executionRecord.hash,
        rankingRecord.hash,
        reportRecord.hash,
        htmlRecord.hash,
        junitRecord.hash,
        sarifRecord.hash,
        shareableReportRecord.hash,
        shareableHtmlRecord.hash,
        shareableJunitRecord.hash,
        shareableSarifRecord.hash,
        indexRecord.hash,
      ],
    );
    return {
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      command: request.command,
      status: "completed",
      sideEffects: [store.runRoot],
      data: { runId: store.runId, executionStatus: execution.status, report },
    };
  }

  private async report(request: CommandRequest): Promise<CommandResult> {
    const runId = String(request.options["runId"] ?? "");
    assertRunId(runId);
    const projectRoot = resolve(
      String(request.options["project"] ?? process.cwd()),
    );
    const stateRoot = resolve(
      projectRoot,
      String(request.options["stateDir"] ?? ".patchrace"),
    );
    const store = await ArtifactStore.open(stateRoot, runId);
    if (request.options["redacted"] === true) {
      if (typeof request.options["output"] !== "string")
        usage(
          "REPORT_EXPORT_DESTINATION_REQUIRED",
          "Redacted report export requires an explicit --output destination.",
          "output",
        );
      const destinationRoot = resolve(projectRoot, request.options["output"]);
      const loadedConfig = await loadSuiteConfig(
        resolve(
          projectRoot,
          String(request.options["config"] ?? ".patchrace/suite.yaml"),
        ),
      );
      const profile = reportRedactionProfile(
        loadedConfig,
        store.runRoot,
        store.manifest.source["configHash"],
      );
      const preview = await previewRedactedReportExport({
        sourceRoot: store.runRoot,
        destinationRoot,
        logicalPaths: [
          "report/shareable/index.html",
          "report/shareable/junit.xml",
          "report/shareable/report.json",
          "report/shareable/results.sarif",
        ],
        profile,
      });
      if (request.options["preview"] === true)
        return {
          schemaVersion: SCHEMA_VERSION,
          ok: true,
          command: "report",
          status: "dry-run",
          sideEffects: [],
          data: preview,
        };
      const exported = await executeRedactedReportExport({
        preview,
        confirmation:
          request.options["confirmExport"] === true
            ? "confirmed"
            : "not-confirmed",
        profile,
      });
      return {
        schemaVersion: SCHEMA_VERSION,
        ok: true,
        command: "report",
        status: "completed",
        sideEffects: [exported.destinationRoot],
        data: exported,
      };
    }
    const report = JSON.parse(
      await readFile(join(store.runRoot, "report", "report.json"), "utf8"),
    );
    const format = String(request.options["format"] ?? "html");
    const sideEffects: string[] = [];
    let target: string | null = null;
    if (typeof request.options["output"] === "string") {
      const requested = resolve(projectRoot, request.options["output"]);
      target =
        extname(requested) === ""
          ? join(
              requested,
              format === "html"
                ? "index.html"
                : format === "junit"
                  ? "junit.xml"
                  : format === "sarif"
                    ? "results.sarif"
                    : "report.json",
            )
          : requested;
    }
    const relativeArtifactRoot =
      target === null
        ? ".."
        : relative(dirname(target), store.runRoot).replaceAll("\\", "/");
    const artifactBase =
      relativeArtifactRoot === "" ? "" : `${relativeArtifactRoot}/`;
    const content =
      format === "json"
        ? renderReportJson(report)
        : format === "html"
          ? renderStaticHtml(report, { artifactBase })
          : format === "junit"
            ? renderJUnitXml(report)
            : format === "sarif"
              ? renderSarifJson(report)
              : usage(
                  "REPORT_FORMAT_UNKNOWN",
                  "Report format must be json, html, junit, or sarif.",
                  "format",
                );
    if (target !== null) {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, { flag: "wx" });
      sideEffects.push(target);
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      command: "report",
      status: "completed",
      sideEffects,
      data: {
        runId,
        format,
        content:
          request.options["json"] === true || sideEffects.length === 0
            ? content
            : null,
      },
    };
  }

  private async diagnose(request: CommandRequest): Promise<CommandResult> {
    const runId = String(request.options["runId"] ?? "");
    assertRunId(runId);
    if (request.options["reflect"] === true)
      throw new PatchRaceError({
        code: "DIAGNOSIS_REFLECTION_PROVIDER_NOT_CONFIGURED",
        category: "PREFLIGHT",
        message:
          "This run has no explicitly configured redacted reflection provider.",
        path: "reflect",
        remediation:
          "Run deterministic diagnosis without --reflect, or configure an approved bounded provider in a future provider-enabled configuration.",
      });
    const projectRoot = resolve(
      String(request.options["project"] ?? process.cwd()),
    );
    const stateRoot = resolve(
      projectRoot,
      String(request.options["stateDir"] ?? ".patchrace"),
    );
    const store = await ArtifactStore.open(stateRoot, runId);
    const execution = JSON.parse(
      await readFile(join(store.runRoot, "execution.json"), "utf8"),
    ) as RaceExecutionV1;
    if (
      execution.schemaVersion !== SCHEMA_VERSION ||
      execution.plan.planHash !== store.manifest.planHash
    )
      throw new PatchRaceError({
        code: "DIAGNOSIS_EXECUTION_SOURCE_INVALID",
        category: "CONFLICT",
        message:
          "Diagnosis requires an execution artifact matching the immutable run plan.",
        path: "execution.json",
      });
    const focusVariantId =
      typeof request.options["focus"] === "string"
        ? request.options["focus"]
        : (execution.plan.variants.find(
            (variant) => variant.adapter.kind === "pi",
          )?.variantId ?? execution.plan.variants[0]?.variantId);
    if (
      focusVariantId === undefined ||
      !execution.plan.variants.some(
        (variant) => variant.variantId === focusVariantId,
      )
    )
      usage(
        "DIAGNOSIS_FOCUS_VARIANT_UNKNOWN",
        "Select a variant recorded in the run.",
        "focus",
      );
    const focusTrials = execution.trials.filter(
      (trial) => trial.variantId === focusVariantId,
    );
    if (focusTrials.length === 0)
      throw new PatchRaceError({
        code: "DIAGNOSIS_FOCUS_EVIDENCE_UNAVAILABLE",
        category: "PREFLIGHT",
        message: `No completed evidence exists for focus variant '${focusVariantId}'.`,
        path: "focus",
      });
    const variants = new Map(
      execution.plan.variants.map((variant) => [variant.variantId, variant]),
    );
    const identity = (variantId: string): GapVariantIdentityV1 => {
      const variant = variants.get(variantId);
      if (variant === undefined)
        throw new PatchRaceError({
          code: "DIAGNOSIS_VARIANT_SOURCE_MISSING",
          category: "CONFLICT",
          message: `Trial references unknown variant '${variantId}'.`,
          path: "execution.trials.variantId",
        });
      return {
        taskHash:
          execution.trials.find((trial) => trial.variantId === variantId)
            ?.taskHash ?? execution.plan.tasks[0]!.taskHash,
        adapterId: variant.adapter.id,
        model: variant.model,
        harnessHash: canonicalHash(variant.harness),
        workflowHash: canonicalHash(variant.workflow),
      };
    };
    const artifactInventory = new Map<string, DiagnosisArtifactEvidenceV1>();
    const addArtifact = async (
      trialId: TrialId,
      logicalPath: string,
      eventIds: readonly string[] = [],
      gradeGateIds: readonly string[] = [],
    ): Promise<DiagnosisArtifactEvidenceV1> => {
      const bytes = await readFile(
        resolveOwnedPath(store.runRoot, logicalPath),
      );
      const artifact = {
        trialId,
        logicalPath,
        hash: sha256(bytes),
        eventIds,
        gradeGateIds,
      };
      artifactInventory.set(
        `${trialId}\0${logicalPath}\0${artifact.hash}`,
        artifact,
      );
      return artifact;
    };
    const traceCache = new Map<TrialId, readonly TraceEventV1[]>();
    const traceFor = async (
      trial: RaceTrialResultV1,
    ): Promise<readonly TraceEventV1[]> => {
      const cached = traceCache.get(trial.trialId);
      if (cached !== undefined) return cached;
      if (trial.artifacts.trace === null)
        throw new PatchRaceError({
          code: "DIAGNOSIS_TRACE_ARTIFACT_UNAVAILABLE",
          category: "PREFLIGHT",
          message: `Trial '${trial.trialId}' has no normalized trace artifact.`,
          path: `trials/${trial.trialId}`,
        });
      const events = await traceEventsFrom(store, trial.trialId);
      if (events.length === 0)
        throw new PatchRaceError({
          code: "DIAGNOSIS_TRACE_EMPTY",
          category: "PREFLIGHT",
          message: `Trial '${trial.trialId}' has no normalized observable events.`,
          path: trial.artifacts.trace,
        });
      traceCache.set(trial.trialId, events);
      return events;
    };
    const cases: DiagnosisReportCaseV1[] = [];
    for (const trial of focusTrials) {
      const events = await traceFor(trial);
      const tracePath = trial.artifacts.trace!;
      const traceArtifact = await addArtifact(
        trial.trialId,
        tracePath,
        events.map((event) => event.eventId),
      );
      if (trial.artifacts.grade === null)
        throw new PatchRaceError({
          code: "DIAGNOSIS_GRADE_ARTIFACT_UNAVAILABLE",
          category: "PREFLIGHT",
          message: `Trial '${trial.trialId}' has no deterministic grade artifact.`,
          path: `trials/${trial.trialId}`,
        });
      const gradeArtifact = await addArtifact(
        trial.trialId,
        trial.artifacts.grade,
        [],
        trial.hardGates.map((gate) => gate.id),
      );
      const completenessEvent = events.find(
        (event) => event.type === "trace.summary",
      );
      const completeness = completenessEvent?.data["completeness"];
      const traceCompleteness =
        completeness === "complete" ||
        completeness === "partial" ||
        completeness === "unknown"
          ? completeness
          : "unknown";
      const features = extractTrajectoryFeatures({
        runId,
        artifactHash: traceArtifact.hash,
        logicalPath: tracePath,
        events,
        traceCompleteness,
      });
      const deterministic = diagnoseWithRules({
        features,
        events,
        result: trial,
        grade: {
          runId,
          artifactHash: gradeArtifact.hash,
          logicalPath: gradeArtifact.logicalPath,
        },
      });
      const comparable = execution.trials.filter(
        (candidate) =>
          candidate.taskId === trial.taskId &&
          candidate.repetition === trial.repetition,
      );
      const comparableTraces = await Promise.all(
        comparable.map(async (candidate) => ({
          variantId: candidate.variantId,
          events: await traceFor(candidate),
        })),
      );
      const alignment =
        new Set(comparableTraces.map((item) => item.variantId)).size >= 2
          ? alignObservableTrajectories({ traces: comparableTraces })
          : null;
      const peers = await Promise.all(
        comparable
          .filter((candidate) => candidate.trialId !== trial.trialId)
          .map(async (candidate) => {
            if (candidate.artifacts.result === null)
              throw new PatchRaceError({
                code: "DIAGNOSIS_PEER_RESULT_UNAVAILABLE",
                category: "PREFLIGHT",
                message: `Peer trial '${candidate.trialId}' has no result artifact.`,
                path: `trials/${candidate.trialId}`,
              });
            const artifact = await addArtifact(
              candidate.trialId,
              candidate.artifacts.result,
            );
            return {
              identity: {
                ...identity(candidate.variantId),
                taskHash: candidate.taskHash,
              },
              result: candidate,
              citation: {
                runId,
                trialId: candidate.trialId,
                artifactHash: artifact.hash,
                logicalPath: artifact.logicalPath,
              },
            };
          }),
      );
      const classification = classifyWorkflowOrCapability({
        deterministic,
        focusIdentity: {
          ...identity(trial.variantId),
          taskHash: trial.taskHash,
        },
        peers,
      });
      cases.push({
        taskId: trial.taskId,
        trialId: trial.trialId,
        variantId: trial.variantId,
        identity: {
          ...identity(trial.variantId),
          taskHash: trial.taskHash,
        },
        deterministic,
        features,
        alignment,
        findings: deterministic.findings,
        classification,
        reflection: null,
      });
    }
    const report = buildDiagnosisReport({
      runId,
      planHash: execution.plan.planHash,
      focusVariantId,
      cases,
      artifacts: [...artifactInventory.values()],
    });
    const format = String(request.options["format"] ?? "html");
    if (format !== "json" && format !== "html")
      usage(
        "DIAGNOSIS_FORMAT_UNKNOWN",
        "Diagnosis format must be json or html.",
        "format",
      );
    const content =
      format === "json"
        ? renderDiagnosisReportJson(report)
        : renderDiagnosisStaticHtml(report);
    const sideEffects: string[] = [];
    if (typeof request.options["output"] === "string") {
      const requested = resolve(projectRoot, request.options["output"]);
      const target =
        extname(requested) === ""
          ? join(
              requested,
              format === "html" ? "diagnosis.html" : "diagnosis.json",
            )
          : requested;
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, { flag: "wx" });
      sideEffects.push(target);
    }
    if (request.options["json"] !== true) {
      this.stderr(
        `diagnosis: ${report.overview.caseCount} case(s), ${report.overview.findingCount} finding(s) for ${focusVariantId}.\n`,
      );
      for (const item of report.cases)
        for (const finding of item.findings)
          this.stderr(
            `  ${item.taskId}: ${finding.category}/${finding.confidence} — ${finding.claim}\n`,
          );
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      command: "diagnose",
      status: "completed",
      sideEffects,
      data: {
        runId,
        format,
        report,
        content:
          request.options["json"] === true || sideEffects.length === 0
            ? content
            : null,
      },
    };
  }
}
