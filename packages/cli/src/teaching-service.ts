import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  PatchRaceError,
  SCHEMA_VERSION,
  canonicalHash,
  canonicalJson,
  sha256,
  type CandidateSnapshotV1,
  type DiagnosisReportV1,
  type FrozenAblationPlanV1,
  type ObjectiveVectorV1,
} from "@patchrace/contracts";
import type {
  CommandRequest,
  CommandResult,
  CommandService,
} from "@patchrace/core";
import {
  buildCandidateReview,
  assertOneVariableAblation,
  createAblationPlan,
  createDecisionPolicy,
  createPromotionPlan,
  createSuccessiveHalvingPlan,
  generateAgentsGuidanceCandidate,
  generateModelRecommendation,
  generatePiSkillCandidate,
  generatePromptTemplateCandidate,
  generateToolRecommendation,
  inventoryPiResources,
  recordCandidateReviewDecision,
  routeDiagnosisToMutation,
  selectParetoCandidates,
  stageCandidate,
  type GeneratedCandidate,
} from "@patchrace/optimizer";
import {
  renderCandidateReviewHtml,
  renderCandidateReviewJson,
} from "@patchrace/report";

export interface TeachingValidationResult {
  readonly baseline: ObjectiveVectorV1;
  readonly candidate: ObjectiveVectorV1;
  readonly limitations: readonly string[];
}

export interface TeachingEvaluator {
  validate(options: {
    readonly candidate: CandidateSnapshotV1;
    readonly ablationPlan: FrozenAblationPlanV1;
    readonly budgetUsd: number | null;
    readonly signal: AbortSignal;
  }): Promise<TeachingValidationResult>;
}

export interface TeachingCommandDependencies {
  readonly evaluator?: TeachingEvaluator;
  readonly now?: () => Date;
}

type TeachingPhase =
  "diagnose" | "propose" | "screen" | "validate" | "report" | "all";

function usage(code: string, message: string, path: string): never {
  throw new PatchRaceError({ code, category: "USAGE", message, path });
}

function phase(value: unknown): TeachingPhase {
  const selected = String(value ?? "all");
  if (
    !["diagnose", "propose", "screen", "validate", "report", "all"].includes(
      selected,
    )
  )
    usage(
      "TEACH_PHASE_INVALID",
      "Teach phase must be diagnose, propose, screen, validate, report, or all.",
      "phase",
    );
  return selected as TeachingPhase;
}

async function existingText(path: string): Promise<string | null> {
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
}

function parseBudget(value: unknown): number | null {
  if (value === undefined) return null;
  const budget = Number(value);
  if (!Number.isFinite(budget) || budget <= 0)
    usage(
      "TEACH_BUDGET_INVALID",
      "Teaching cost budget must be a positive number.",
      "budgetUsd",
    );
  return budget;
}

export class TeachingCommandService implements CommandService {
  readonly #evaluator: TeachingEvaluator | undefined;
  readonly #now: () => Date;

  constructor(
    private readonly fallback: CommandService,
    dependencies: TeachingCommandDependencies = {},
  ) {
    this.#evaluator = dependencies.evaluator;
    this.#now = dependencies.now ?? (() => new Date());
  }

  async execute(request: CommandRequest): Promise<CommandResult> {
    if (request.command === "teach pi") return this.teach(request);
    return this.fallback.execute(request);
  }

  private async teach(request: CommandRequest): Promise<CommandResult> {
    const selectedPhase = phase(request.options["phase"]);
    const runId = String(request.options["runId"] ?? "");
    if (runId.length === 0)
      usage(
        "TEACH_RUN_REQUIRED",
        "Teaching from evidence requires a run ID.",
        "runId",
      );
    const diagnosisResult = await this.fallback.execute({
      command: "diagnose",
      options: {
        ...request.options,
        runId,
        format: "json",
        reflect: false,
        output: undefined,
      },
    });
    const diagnosis = (
      diagnosisResult.data as
        { readonly report?: DiagnosisReportV1 } | undefined
    )?.report;
    if (diagnosis === undefined)
      throw new PatchRaceError({
        code: "TEACH_DIAGNOSIS_UNAVAILABLE",
        category: "PREFLIGHT",
        message: "Teaching requires a durable diagnosis report.",
        path: "runId",
      });
    if (selectedPhase === "diagnose")
      return {
        schemaVersion: SCHEMA_VERSION,
        ok: true,
        command: "teach pi",
        status: "completed",
        sideEffects: [],
        data: { phase: "diagnose", diagnosis },
      };

    const projectRoot = resolve(
      String(request.options["project"] ?? process.cwd()),
    );
    const stateRoot = resolve(
      projectRoot,
      String(request.options["stateDir"] ?? ".patchrace"),
    );
    const inventory = await inventoryPiResources({
      projectRoot,
      ...(typeof request.options["globalRoot"] === "string"
        ? { globalRoot: request.options["globalRoot"] }
        : {}),
    });
    const selectedCase = diagnosis.cases.find((item) =>
      item.findings.some(
        (finding) =>
          finding.origin === "deterministic-rule" &&
          finding.confidence === "high",
      ),
    );
    if (selectedCase === undefined)
      return {
        schemaVersion: SCHEMA_VERSION,
        ok: true,
        command: "teach pi",
        status: "completed",
        sideEffects: [],
        data: {
          phase: "propose",
          diagnosis,
          inventory,
          decision: "no-candidate",
          reason: "no-high-confidence-deterministic-finding",
        },
      };
    const workflowName =
      typeof request.options["workflowName"] === "string"
        ? request.options["workflowName"]
        : null;
    const routes = routeDiagnosisToMutation({
      deterministic: selectedCase.deterministic,
      classification: selectedCase.classification,
      ...(workflowName === null
        ? {}
        : {
            invokedWorkflow: {
              name: workflowName,
              evidence: selectedCase.classification.evidence,
            },
          }),
    });
    const selectedRoute = routes.find(
      (route) => route.disposition === "candidate",
    );
    if (selectedRoute === undefined) {
      const route = routes[0]!;
      const recommendation =
        route.recommendationKind === "model-advice"
          ? generateModelRecommendation({
              route,
              currentModel: selectedCase.identity.model,
              proposedModel: String(
                request.options["modelAdvice"] ?? "review-alternative-model",
              ),
            })
          : route.recommendationKind === "manual-tool"
            ? generateToolRecommendation({
                route,
                tool: String(request.options["tool"] ?? "Pi tool"),
                readiness: "unknown",
                manualAction:
                  "Review official readiness guidance outside this teaching run.",
              })
            : null;
      return {
        schemaVersion: SCHEMA_VERSION,
        ok: true,
        command: "teach pi",
        status: "completed",
        sideEffects: [],
        data: {
          phase: "propose",
          diagnosis,
          inventory,
          routes,
          decision: "no-candidate",
          recommendation,
        },
      };
    }
    const finding = selectedCase.findings.find((item) =>
      selectedRoute.sourceFindingIds.includes(item.id),
    )!;
    const createdAt = await this.createdAt(stateRoot, runId);
    const common = {
      baselineId: String(request.options["baseline"] ?? "pi-main"),
      createdAt,
      route: selectedRoute,
      finding,
      visibleSplitHash: sha256(
        diagnosis.cases
          .map((item) => item.taskId)
          .sort()
          .join("\0"),
      ),
      configHash: canonicalHash({
        planHash: diagnosis.source.planHash,
        target: request.options["target"] ?? null,
      }),
    };
    let generated: GeneratedCandidate;
    if (selectedRoute.mutationType === "agents-guidance") {
      if (typeof request.options["fact"] !== "string")
        usage(
          "TEACH_STABLE_FACT_REQUIRED",
          "Guidance candidates require an explicit --fact supported by the cited constraint.",
          "fact",
        );
      generated = generateAgentsGuidanceCandidate({
        ...common,
        currentContent: await existingText(join(projectRoot, "AGENTS.md")),
        change: {
          kind: "add-stable-fact",
          fact: request.options["fact"],
        },
      });
    } else if (selectedRoute.mutationType === "skill") {
      generated = generatePiSkillCandidate({
        ...common,
        name: workflowName ?? "evidence-guided-verification",
        description:
          "Apply a focused observable workflow before broad verification",
        trigger:
          "Use when a recorded workflow failure repeats without new evidence",
        steps: [
          "Inspect the cited observable failure and identify the smallest changed condition.",
          "Change one workflow choice and run the narrowest relevant verification.",
          "Record the result before expanding the verification scope.",
        ],
      });
    } else if (selectedRoute.mutationType === "prompt-template") {
      if (workflowName === null)
        usage(
          "TEACH_WORKFLOW_NAME_REQUIRED",
          "Prompt candidates require --workflow-name.",
          "workflowName",
        );
      generated = generatePromptTemplateCandidate({
        ...common,
        name: workflowName,
        description:
          "Review an explicitly selected workflow using recorded evidence",
        arguments: [],
        steps: [
          "Inspect the cited observable evidence for this invoked workflow.",
          "Change one workflow choice and report the narrow verification result.",
        ],
      });
    } else
      throw new PatchRaceError({
        code: "TEACH_MUTATION_GENERATOR_UNAVAILABLE",
        category: "PREFLIGHT",
        message: `No bounded generator is configured for '${selectedRoute.mutationType}'.`,
        path: "target",
      });
    const staged = await stageCandidate({
      projectRoot,
      ...(request.options["stateDir"] === undefined ? {} : { stateRoot }),
      candidate: generated.candidate,
      files: generated.files,
      lint: {
        inventoryFindings: inventory.findings,
        changeEvidence: generated.changeEvidence,
        complexity: generated.complexity,
        securityFlags: generated.securityFlags,
      },
    });
    const pending = buildCandidateReview({
      generated,
      findings: [finding],
      expectedEffect: String(
        request.options["expectedEffect"] ??
          "Improve the recorded failure mode without regressing hard gates.",
      ),
      limitations: selectedCase.classification.limitations,
    });
    const review =
      request.options["approve"] === true
        ? recordCandidateReviewDecision(pending, {
            decision: "approved",
            reason: String(
              request.options["reviewReason"] ??
                "Explicit CLI approval after reviewing the exact candidate diff.",
            ),
            reviewedAt: this.#now().toISOString(),
          })
        : pending;
    await this.writeReviewArtifacts(
      projectRoot,
      staged.relativeRoot,
      review.review,
    );
    if (
      selectedPhase === "propose" ||
      selectedPhase === "report" ||
      review.review.decision.state !== "approved"
    )
      return {
        schemaVersion: SCHEMA_VERSION,
        ok: true,
        command: "teach pi",
        status: "completed",
        sideEffects: [join(projectRoot, staged.relativeRoot)],
        data: {
          phase: selectedPhase === "report" ? "report" : ("review" as const),
          diagnosis,
          inventory,
          routes,
          candidate: review.candidate,
          review: review.review,
          nextAction:
            review.review.decision.state === "pending"
              ? "approve-or-reject-before-validation"
              : "run-screen-or-validation",
        },
      };

    const budgetUsd = parseBudget(request.options["budgetUsd"]);
    const taskIds = [
      ...new Set(diagnosis.cases.map((item) => item.taskId)),
    ].sort();
    const screening = createSuccessiveHalvingPlan({
      candidateIds: [review.candidate.candidateId],
      taskIds,
      budgets: {
        maxCandidates: 1,
        maxTrials: Math.max(2, taskIds.length * 2),
        maxWallTimeMs: 30 * 60_000,
        maxTokens: null,
        maxCostUsd: budgetUsd,
      },
      perTrial: {
        maxWallTimeMs: 10 * 60_000,
        maxTokens: null,
        maxCostUsd:
          budgetUsd === null
            ? null
            : budgetUsd / Math.max(2, taskIds.length * 2),
      },
      maxRepetitions: 1,
    });
    if (selectedPhase === "screen")
      return {
        schemaVersion: SCHEMA_VERSION,
        ok: true,
        command: "teach pi",
        status: "completed",
        sideEffects: [join(projectRoot, staged.relativeRoot)],
        data: {
          phase: "screen",
          candidate: review.candidate,
          review: review.review,
          screening,
        },
      };
    if (this.#evaluator === undefined)
      throw new PatchRaceError({
        code: "TEACH_EVALUATOR_NOT_CONFIGURED",
        category: "PREFLIGHT",
        message:
          "Validation requires an explicitly configured local teaching evaluator.",
        path: "phase",
        remediation:
          "Review the staged candidate, then configure an evaluator with explicit Agent and budget authorization.",
      });
    const baselineFiles = generated.files
      .filter((file) => file.before !== null)
      .map((file) => ({
        logicalPath: file.logicalPath,
        hash: sha256(file.before!),
      }));
    const candidateFiles = generated.files
      .filter((file) => file.after !== null)
      .map((file) => ({
        logicalPath: file.logicalPath,
        hash: sha256(file.after!),
      }));
    const ablationPlan = createAblationPlan({
      candidate: review.candidate,
      phase: "validation",
      taskSnapshots: diagnosis.cases.map((item) => ({
        taskId: item.taskId,
        taskHash: item.identity.taskHash,
      })),
      invariant: {
        adapterId: selectedCase.identity.adapterId,
        adapterVersion: "recorded-in-source-run",
        model: selectedCase.identity.model,
        harnessHash: selectedCase.identity.harnessHash,
        budgetsHash: canonicalHash(screening.budgets),
        environmentNames: [],
        schedulerHash: canonicalHash(screening.rounds),
      },
      baseline: {
        variantId: common.baselineId,
        resourceHash: canonicalHash(baselineFiles),
      },
      candidateResourceHash: canonicalHash(candidateFiles),
      repetitionCount: 1,
    });
    assertOneVariableAblation({
      plan: ablationPlan,
      baseline: { files: baselineFiles },
      candidate: { files: candidateFiles },
    });
    const controller = new AbortController();
    const validation = await this.#evaluator.validate({
      candidate: review.candidate,
      ablationPlan,
      budgetUsd,
      signal: controller.signal,
    });
    const policy = createDecisionPolicy({
      requiredDimensions: [
        "successRate",
        "stabilityVariance",
        "latencyMs",
        "footprintLines",
        "contextTokens",
        "configComplexity",
      ],
      minimumSuccessRateImprovement: Number(
        request.options["minimumImprovement"] ?? 0.1,
      ),
      maximumRegression: {
        latencyMs: 0,
        footprintLines: 0,
        contextTokens: generated.complexity.afterContextTokens,
        configComplexity: 10,
      },
      evidenceTier: "validation",
    });
    const selection = selectParetoCandidates({
      baseline: validation.baseline,
      candidates: [validation.candidate],
      policy,
    });
    if (selectedPhase === "validate")
      return {
        schemaVersion: SCHEMA_VERSION,
        ok: true,
        command: "teach pi",
        status: "completed",
        sideEffects: [join(projectRoot, staged.relativeRoot)],
        data: {
          phase: "validate",
          candidate: review.candidate,
          screening,
          ablationPlan,
          validation,
          policy,
          selection,
        },
      };
    const promotion =
      selection.decisions[0]?.decision === "promote-eligible"
        ? await createPromotionPlan({
            projectRoot,
            candidate: review.candidate,
            files: generated.files,
            review: review.review,
            selection,
            policy,
          })
        : null;
    const report = {
      schemaVersion: SCHEMA_VERSION,
      runId,
      phase: "complete",
      inventory,
      routes,
      candidate: review.candidate,
      review: review.review,
      screening,
      ablationPlan,
      validation,
      policy,
      selection,
      promotion,
      claimBoundary:
        "This recommendation applies only to the recorded tasks, snapshots, configuration, and validation evidence.",
    };
    await this.writeTeachingReport(projectRoot, staged.relativeRoot, report);
    return {
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      command: "teach pi",
      status: "completed",
      sideEffects: [join(projectRoot, staged.relativeRoot)],
      data: report,
    };
  }

  private async createdAt(stateRoot: string, runId: string): Promise<string> {
    const value = await readFile(
      join(stateRoot, "runs", runId, "manifest.json"),
      "utf8",
    )
      .then(
        (content) => JSON.parse(content) as { readonly createdAt?: unknown },
      )
      .catch(() => null);
    return typeof value?.createdAt === "string"
      ? value.createdAt
      : this.#now().toISOString();
  }

  private async writeReviewArtifacts(
    projectRoot: string,
    relativeRoot: string,
    review: Parameters<typeof renderCandidateReviewJson>[0],
  ): Promise<void> {
    const root = join(projectRoot, relativeRoot, "review");
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "review.json"),
      renderCandidateReviewJson(review),
      {
        flag: "wx",
      },
    );
    await writeFile(
      join(root, "index.html"),
      renderCandidateReviewHtml(review),
      {
        flag: "wx",
      },
    );
  }

  private async writeTeachingReport(
    projectRoot: string,
    relativeRoot: string,
    report: unknown,
  ): Promise<void> {
    const root = join(projectRoot, relativeRoot, "teaching");
    await mkdir(dirname(join(root, "report.json")), { recursive: true });
    await writeFile(join(root, "report.json"), `${canonicalJson(report)}\n`, {
      flag: "wx",
    });
  }
}
