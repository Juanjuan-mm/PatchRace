import { PatchRaceError, normalizeError } from "@patchrace/contracts";

import type { BudgetTracker, BudgetUsage } from "./budgets.js";

export interface ScheduledJob<T> {
  readonly id: string;
  readonly dependencies?: readonly string[];
  readonly lockKey?: string;
  readonly run: (context: {
    readonly signal: AbortSignal;
    reportUsage(usage: BudgetUsage): void;
  }) => Promise<T>;
}

export type JobStatus =
  "completed" | "failed" | "skipped" | "cancelled" | "budget_exhausted";

export interface ScheduledResult<T> {
  readonly id: string;
  readonly status: JobStatus;
  readonly value?: T;
  readonly error?: {
    readonly code: string;
    readonly category: string;
    readonly message: string;
  };
}

function validateGraph<T>(jobs: readonly ScheduledJob<T>[]): void {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  if (byId.size !== jobs.length)
    throw new PatchRaceError({
      code: "SCHEDULER_DUPLICATE_JOB",
      category: "CONFIG",
      message: "Scheduler job IDs must be unique.",
      path: "jobs",
    });
  for (const job of jobs) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(job.id))
      throw new PatchRaceError({
        code: "SCHEDULER_JOB_ID_INVALID",
        category: "CONFIG",
        message: `Invalid scheduler job ID '${job.id}'.`,
        path: "jobs",
      });
    for (const dependency of job.dependencies ?? [])
      if (!byId.has(dependency))
        throw new PatchRaceError({
          code: "SCHEDULER_DEPENDENCY_MISSING",
          category: "CONFIG",
          message: `Job '${job.id}' references missing dependency '${dependency}'.`,
          path: `jobs.${job.id}.dependencies`,
        });
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id))
      throw new PatchRaceError({
        code: "SCHEDULER_CYCLE",
        category: "CONFIG",
        message: `Scheduler dependency cycle includes '${id}'.`,
        path: "jobs",
      });
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependencies ?? [])
      visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const job of jobs) visit(job.id);
}

export async function runScheduledJobs<T>(
  jobs: readonly ScheduledJob<T>[],
  options: {
    readonly concurrency: number;
    readonly signal?: AbortSignal;
    readonly budgets?: BudgetTracker;
  },
): Promise<readonly ScheduledResult<T>[]> {
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1)
    throw new PatchRaceError({
      code: "SCHEDULER_CONCURRENCY_INVALID",
      category: "CONFIG",
      message: "Scheduler concurrency must be a positive integer.",
      path: "concurrency",
    });
  validateGraph(jobs);
  const results = new Map<string, ScheduledResult<T>>();
  const running = new Map<string, Promise<void>>();
  const activeLocks = new Set<string>();

  const launch = (job: ScheduledJob<T>): void => {
    if (job.lockKey !== undefined) activeLocks.add(job.lockKey);
    const promise = Promise.resolve().then(async () => {
      try {
        options.budgets?.reserveTrial();
        const value = await job.run({
          signal: options.signal ?? new AbortController().signal,
          reportUsage: (usage) => options.budgets?.consume(usage),
        });
        results.set(job.id, { id: job.id, status: "completed", value });
      } catch (error) {
        const normalized = normalizeError(error);
        const status: JobStatus =
          normalized.details.category === "BUDGET"
            ? "budget_exhausted"
            : normalized.details.category === "INTERRUPTED"
              ? "cancelled"
              : "failed";
        results.set(job.id, {
          id: job.id,
          status,
          error: {
            code: normalized.details.code,
            category: normalized.details.category,
            message: normalized.details.message,
          },
        });
      } finally {
        if (job.lockKey !== undefined) activeLocks.delete(job.lockKey);
        running.delete(job.id);
      }
    });
    running.set(job.id, promise);
  };

  while (results.size < jobs.length) {
    let progressed = false;
    for (const job of jobs) {
      if (results.has(job.id) || running.has(job.id)) continue;
      const dependencyResults = (job.dependencies ?? []).map((id) =>
        results.get(id),
      );
      if (dependencyResults.some((result) => result === undefined)) continue;
      if (dependencyResults.some((result) => result?.status !== "completed")) {
        results.set(job.id, { id: job.id, status: "skipped" });
        progressed = true;
        continue;
      }
      if (options.signal?.aborted === true) {
        results.set(job.id, { id: job.id, status: "cancelled" });
        progressed = true;
        continue;
      }
      if (
        running.size >= options.concurrency ||
        (job.lockKey !== undefined && activeLocks.has(job.lockKey))
      )
        continue;
      launch(job);
      progressed = true;
    }
    if (running.size > 0) await Promise.race(running.values());
    else if (!progressed)
      throw new PatchRaceError({
        code: "SCHEDULER_STALLED",
        category: "INTERNAL",
        message: "Scheduler made no progress despite a validated graph.",
      });
  }
  return jobs.map((job) => results.get(job.id)!);
}
