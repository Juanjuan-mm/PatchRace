import {
  PatchRaceError,
  SCHEMA_VERSION,
  type ComparisonMetricV1,
  type ComparisonReportV1,
  type PatchComparisonV1,
  type RaceExecutionV1,
  type RankedComparisonV1,
  type TrajectoryTimelineV1,
} from "@patchrace/contracts";

export const REPORT_SCHEMA_VERSION = "1.0.0" as const;
export * from "./diagnosis.js";
export * from "./candidate-review.js";
export * from "./formats.js";
export * from "./patch.js";

export function buildComparisonReport(options: {
  readonly execution: RaceExecutionV1;
  readonly ranking: RankedComparisonV1;
  readonly title?: string;
  readonly patches?: readonly PatchComparisonV1[];
  readonly timelines?: readonly {
    readonly taskId: string;
    readonly repetition: number;
    readonly timeline: TrajectoryTimelineV1;
  }[];
}): ComparisonReportV1 {
  const planVariants = new Map(
    options.execution.plan.variants.map((variant) => [
      variant.variantId,
      variant.variantHash,
    ]),
  );
  for (const ranked of options.ranking.variants)
    if (planVariants.get(ranked.variantId) !== ranked.variantHash)
      throw new PatchRaceError({
        code: "REPORT_RANKING_SOURCE_MISMATCH",
        category: "CONFLICT",
        message: "Ranking evidence does not match the race plan.",
        path: `ranking.variants.${ranked.variantId}`,
      });
  const caveats = [
    ...new Set([
      ...options.ranking.caveats,
      ...options.execution.trials.flatMap((trial) => trial.limitations),
      "results_apply_only_to_the_recorded_tasks_snapshots_and_configuration",
    ]),
  ].sort();
  return {
    schemaVersion: SCHEMA_VERSION,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    source: {
      planHash: options.execution.plan.planHash,
      executionStatus: options.execution.status,
      taskSnapshots: options.execution.plan.tasks,
      variants: options.execution.plan.variants,
    },
    overview: {
      title: options.title ?? "PatchRace comparison",
      taskCount: options.execution.plan.tasks.length,
      variantCount: options.execution.plan.variants.length,
      plannedTrialCount: options.execution.plan.trials.length,
      completedEvidenceCount: options.execution.trials.length,
      claimBoundary:
        "This comparison describes only the recorded tasks, snapshots, variants, and attempts; it does not establish a universally best Agent.",
    },
    ranking: options.ranking,
    trials: options.execution.trials,
    patches: [...(options.patches ?? [])].sort((left, right) =>
      left.trialId.localeCompare(right.trialId),
    ),
    timelines: [...(options.timelines ?? [])].sort(
      (left, right) =>
        left.taskId.localeCompare(right.taskId) ||
        left.repetition - right.repetition,
    ),
    caveats,
  };
}

export function buildShareableComparisonReport(
  report: ComparisonReportV1,
): ComparisonReportV1 {
  const omission = "shareable_export_omits_local_sensitive_evidence";
  return {
    ...report,
    source: {
      ...report.source,
      variants: report.source.variants.map((variant) => ({
        ...variant,
        adapter: {
          ...variant.adapter,
          executable: "[REDACTED:executable]",
        },
        harness: {},
        workflow: {},
        environmentNames: [],
      })),
    },
    trials: report.trials.map((trial) => ({
      ...trial,
      hardGates: trial.hardGates.map((gate) => ({ ...gate, evidence: [] })),
      artifacts: { patch: null, grade: null, trace: null, result: null },
      limitations: [omission],
    })),
    patches: [],
    timelines: [],
    caveats: [
      "results_apply_only_to_the_recorded_tasks_snapshots_and_configuration",
      omission,
    ],
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function metric(metric: ComparisonMetricV1): string {
  return metric.value === null || metric.availability === "unavailable"
    ? `unavailable (${escapeHtml(metric.source)})`
    : `${escapeHtml(String(metric.value))} ${escapeHtml(metric.unit)} (${metric.availability})`;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  });
}

function safeArtifactLink(value: string | null, artifactBase: string): string {
  if (
    value === null ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").includes("..") ||
    /^[a-z][a-z0-9+.-]*:/i.test(value) ||
    hasControlCharacter(value)
  )
    return value === null ? "unavailable" : escapeHtml(value);
  const escaped = escapeHtml(value);
  return `<a href="${escapeHtml(`${artifactBase}${value}`)}">${escaped}</a>`;
}

function list(values: readonly string[]): string {
  return values.length === 0
    ? "<p>None recorded.</p>"
    : `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
}

export function renderStaticHtml(
  report: ComparisonReportV1,
  options: { readonly artifactBase?: string } = {},
): string {
  const artifactBase = options.artifactBase ?? "";
  const rankings = report.ranking.variants
    .map(
      (variant) =>
        `<tr><td>${variant.rank}</td><td>${escapeHtml(variant.variantId)}</td><td>${escapeHtml(variant.decisiveDimension)}</td><td>${variant.aggregate.passedCount}/${variant.aggregate.validCount}</td><td>${metric(variant.aggregate.raw.stabilityVariance)}</td><td>${metric(variant.aggregate.raw.meanCostUsd)}</td><td>${metric(variant.aggregate.raw.meanLatencyMs)}</td><td>${metric(variant.aggregate.raw.meanFootprintLines)}</td></tr>`,
    )
    .join("");
  const trials = report.trials
    .map((trial) => {
      const gates = trial.hardGates
        .map(
          (gate) =>
            `<li>${escapeHtml(gate.id)}: ${escapeHtml(gate.status)}${gate.evidence.length === 0 ? "" : ` — ${gate.evidence.map(escapeHtml).join(", ")}`}</li>`,
        )
        .join("");
      return `<article><h3>${escapeHtml(trial.taskId)} / ${escapeHtml(trial.variantId)} / repetition ${trial.repetition}</h3><p>Outcome: ${escapeHtml(trial.outcome)}; integrity: ${escapeHtml(trial.integrity)}; terminal: ${escapeHtml(trial.terminalStatus)}</p><h4>Hard gates</h4><ul>${gates}</ul><h4>Evidence</h4><ul><li>Patch: ${safeArtifactLink(trial.artifacts.patch, artifactBase)}</li><li>Grade: ${safeArtifactLink(trial.artifacts.grade, artifactBase)}</li><li>Trace: ${safeArtifactLink(trial.artifacts.trace, artifactBase)}</li><li>Result: ${safeArtifactLink(trial.artifacts.result, artifactBase)}</li></ul></article>`;
    })
    .join("");
  const patches =
    report.patches.length === 0
      ? "<p>No patch display evidence was included.</p>"
      : report.patches
          .map((patch) => {
            const files = patch.changedFiles
              .map(
                (file) =>
                  `<li>${escapeHtml(file.path)} — ${escapeHtml(file.status)}${file.protectedPathViolation ? " — PROTECTED PATH VIOLATION" : ""}</li>`,
              )
              .join("");
            const rows = patch.sideBySide
              .map(
                (row) =>
                  `<tr><td>${row.leftLine ?? ""}</td><td><pre>${escapeHtml(row.left ?? "")}</pre></td><td>${row.rightLine ?? ""}</td><td><pre>${escapeHtml(row.right ?? "")}</pre></td><td>${escapeHtml(row.kind)}</td></tr>`,
              )
              .join("");
            const reference =
              patch.reference.unifiedDiff === null
                ? `${patch.reference.availability}: ${patch.reference.reason}`
                : patch.reference.unifiedDiff;
            return `<article><h3>${escapeHtml(patch.trialId)}</h3><ul>${files}</ul><details><summary>Unified diff${patch.truncated ? " (truncated)" : ""}</summary><pre>${escapeHtml(patch.unifiedDiff)}</pre></details><table><thead><tr><th>Old</th><th>Before</th><th>New</th><th>After</th><th>Kind</th></tr></thead><tbody>${rows}</tbody></table><details><summary>Human reference patch</summary><pre>${escapeHtml(reference)}</pre></details></article>`;
          })
          .join("");
  const timelines =
    report.timelines.length === 0
      ? "<p>No normalized trajectory display evidence was included.</p>"
      : report.timelines
          .map((entry) => {
            const rows = entry.timeline.rows
              .map(
                (row) =>
                  `<tr><td>${escapeHtml(row.lane)}</td><td>${escapeHtml(row.alignmentKey)}</td><td>${row.occurrences
                    .map(
                      (occurrence) =>
                        `${escapeHtml(occurrence.variantId)}:${escapeHtml(occurrence.type)}#${occurrence.sequence} (${escapeHtml(occurrence.availability)})`,
                    )
                    .join("<br>")}</td></tr>`,
              )
              .join("");
            const unavailable = entry.timeline.unavailable.map(
              (item) => `${item.variantId} ${item.lane}: ${item.reason}`,
            );
            return `<article><h3>${escapeHtml(entry.taskId)} / repetition ${entry.repetition}</h3><p>Retained ${entry.timeline.retainedEventCount}/${entry.timeline.inputEventCount} normalized events${entry.timeline.truncated ? " (truncated)" : ""}.</p><table><thead><tr><th>Lane</th><th>Alignment</th><th>Observable occurrences</th></tr></thead><tbody>${rows}</tbody></table>${list(unavailable)}</article>`;
          })
          .join("");
  const provenance = [
    `Plan hash: ${report.source.planHash}`,
    ...report.source.taskSnapshots.map(
      (task) =>
        `Task ${task.taskId}: ${task.taskHash}, baseline ${task.baselineCommit}, instruction ${task.instructionHash}`,
    ),
    ...report.source.variants.map(
      (variant) =>
        `Variant ${variant.variantId}: ${variant.variantHash}; adapter ${variant.adapter.kind} ${variant.adapter.version ?? "unavailable"}; model ${variant.model ?? "unavailable"}`,
    ),
  ];
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"><title>${escapeHtml(report.overview.title)}</title></head><body><main><h1>${escapeHtml(report.overview.title)}</h1><p>${escapeHtml(report.overview.claimBoundary)}</p><section><h2>Overview</h2><dl><dt>Tasks</dt><dd>${report.overview.taskCount}</dd><dt>Variants</dt><dd>${report.overview.variantCount}</dd><dt>Trials</dt><dd>${report.overview.completedEvidenceCount}/${report.overview.plannedTrialCount}</dd><dt>Status</dt><dd>${escapeHtml(report.source.executionStatus)}</dd></dl></section><section><h2>Correctness-first ranking</h2><table><thead><tr><th>Rank</th><th>Variant</th><th>Decisive dimension</th><th>Hard gates</th><th>Stability variance</th><th>Mean cost</th><th>Mean latency</th><th>Mean footprint</th></tr></thead><tbody>${rankings}</tbody></table></section><section><h2>Trial gates and evidence</h2>${trials}</section><section><h2>Side-by-side patches</h2>${patches}</section><section><h2>Normalized trajectory timelines</h2>${timelines}</section><section><h2>Caveats</h2>${list(report.caveats)}</section><section><h2>Provenance</h2>${list(provenance)}</section></main></body></html>\n`;
}
