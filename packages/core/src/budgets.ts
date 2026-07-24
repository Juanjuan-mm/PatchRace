import { PatchRaceError } from "@patchrace/contracts";

export interface BudgetLimits {
  readonly wallMs: number | null;
  readonly maxTrials: number | null;
  readonly maxTokens: number | null;
  readonly maxCostUsd: number | null;
  readonly maxDiskBytes: number | null;
}

export interface BudgetUsage {
  readonly tokens?: number | null;
  readonly costUsd?: number | null;
  readonly diskBytes?: number;
}

export type BudgetDimension = "wall" | "trials" | "tokens" | "cost" | "disk";

export interface BudgetSnapshot {
  readonly status: "within" | "exhausted";
  readonly limits: BudgetLimits;
  readonly consumed: {
    readonly wallMs: number;
    readonly trials: number;
    readonly tokens: number | null;
    readonly costUsd: number | null;
    readonly diskBytes: number;
  };
  readonly exhausted: readonly BudgetDimension[];
}

function validateLimit(
  value: number | null,
  path: string,
  integer = false,
): void {
  if (
    value !== null &&
    (!Number.isFinite(value) ||
      value < 0 ||
      (integer && !Number.isInteger(value)))
  ) {
    throw new PatchRaceError({
      code: "BUDGET_LIMIT_INVALID",
      category: "CONFIG",
      message: `Budget ${path} must be finite and non-negative.`,
      path,
    });
  }
}

export class BudgetTracker {
  readonly limits: BudgetLimits;
  readonly #now: () => number;
  readonly #started: number;
  #trials = 0;
  #tokens: number | null = null;
  #costUsd: number | null = null;
  #diskBytes = 0;

  constructor(
    limits: BudgetLimits,
    now: () => number = () => performance.now(),
  ) {
    validateLimit(limits.wallMs, "wallMs");
    validateLimit(limits.maxTrials, "maxTrials", true);
    validateLimit(limits.maxTokens, "maxTokens");
    validateLimit(limits.maxCostUsd, "maxCostUsd");
    validateLimit(limits.maxDiskBytes, "maxDiskBytes");
    this.limits = Object.freeze({ ...limits });
    this.#now = now;
    this.#started = now();
  }

  reserveTrial(): void {
    const exhausted = this.snapshot().exhausted.filter(
      (dimension) => dimension !== "trials",
    );
    if (exhausted.length > 0) this.throwExhausted(exhausted);
    if (
      this.limits.maxTrials !== null &&
      this.#trials + 1 > this.limits.maxTrials
    )
      this.throwExhausted(["trials"]);
    this.#trials += 1;
  }

  consume(usage: BudgetUsage): void {
    if (usage.tokens !== undefined && usage.tokens !== null) {
      validateLimit(usage.tokens, "usage.tokens");
      this.#tokens = (this.#tokens ?? 0) + usage.tokens;
    }
    if (usage.costUsd !== undefined && usage.costUsd !== null) {
      validateLimit(usage.costUsd, "usage.costUsd");
      this.#costUsd = (this.#costUsd ?? 0) + usage.costUsd;
    }
    if (usage.diskBytes !== undefined) {
      validateLimit(usage.diskBytes, "usage.diskBytes");
      this.#diskBytes += usage.diskBytes;
    }
    const exhausted = this.snapshot().exhausted.filter(
      (dimension) => dimension !== "trials",
    );
    if (exhausted.length > 0) this.throwExhausted(exhausted);
  }

  assertAvailable(): void {
    const snapshot = this.snapshot();
    if (snapshot.exhausted.length > 0) this.throwExhausted(snapshot.exhausted);
  }

  snapshot(): BudgetSnapshot {
    const consumed = {
      wallMs: Math.max(0, this.#now() - this.#started),
      trials: this.#trials,
      tokens: this.#tokens,
      costUsd: this.#costUsd,
      diskBytes: this.#diskBytes,
    };
    const exhausted: BudgetDimension[] = [];
    if (this.limits.wallMs !== null && consumed.wallMs >= this.limits.wallMs)
      exhausted.push("wall");
    if (
      this.limits.maxTrials !== null &&
      consumed.trials >= this.limits.maxTrials
    )
      exhausted.push("trials");
    if (
      this.limits.maxTokens !== null &&
      consumed.tokens !== null &&
      consumed.tokens >= this.limits.maxTokens
    )
      exhausted.push("tokens");
    if (
      this.limits.maxCostUsd !== null &&
      consumed.costUsd !== null &&
      consumed.costUsd >= this.limits.maxCostUsd
    )
      exhausted.push("cost");
    if (
      this.limits.maxDiskBytes !== null &&
      consumed.diskBytes >= this.limits.maxDiskBytes
    )
      exhausted.push("disk");
    return {
      status: exhausted.length === 0 ? "within" : "exhausted",
      limits: this.limits,
      consumed,
      exhausted,
    };
  }

  private throwExhausted(dimensions: readonly BudgetDimension[]): never {
    throw new PatchRaceError({
      code: "BUDGET_EXHAUSTED",
      category: "BUDGET",
      message: `Budget exhausted: ${dimensions.join(", ")}.`,
      path: "budgets",
      retryable: false,
    });
  }
}
