import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { open, stat, unlink } from "node:fs/promises";
import { resolve } from "node:path";

import {
  PatchRaceError,
  SCHEMA_VERSION,
  assertTrialId,
  canonicalJson,
  sha256,
  type TrialId,
} from "@patchrace/contracts";

import { ArtifactStore } from "./artifacts.js";
import {
  openRegularFileNoFollow,
  readRegularFileNoFollow,
  resolveOwnedPath,
} from "./safety.js";

export type RunState =
  | "planned"
  | "preparing"
  | "running"
  | "grading"
  | "completed"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "interrupted"
  | "budget_exhausted";
export type TrialState =
  | "planned"
  | "preparing"
  | "running"
  | "grading"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "budget_exhausted";
const terminalTrialStates = new Set<TrialState>([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
  "budget_exhausted",
]);

export interface CoordinatorEvent {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly sequence: number;
  readonly type: string;
  readonly runId: string;
  readonly trialId?: TrialId;
  readonly timestamp: string;
  readonly priorState: string | null;
  readonly newState: string;
  readonly artifactHashes: readonly `sha256:${string}`[];
}

export class RunCoordinator {
  readonly #store: ArtifactStore;
  readonly #now: () => Date;
  readonly #trials = new Map<TrialId, TrialState>();
  #runState: RunState = "planned";
  #sequence = 1;
  #operations: Promise<void> = Promise.resolve();

  constructor(
    store: ArtifactStore,
    trialIds: readonly TrialId[],
    now: () => Date = () => new Date(),
  ) {
    this.#store = store;
    this.#now = now;
    for (const id of trialIds) {
      assertTrialId(id);
      if (this.#trials.has(id))
        throw new PatchRaceError({
          code: "TRIAL_DUPLICATE",
          category: "CONFIG",
          message: `Duplicate trial ID '${id}'.`,
          path: "trials",
        });
      this.#trials.set(id, "planned");
    }
  }

  static resume(
    store: ArtifactStore,
    recovery: RecoveryResult,
    now: () => Date = () => new Date(),
  ): RunCoordinator {
    if (store.runId !== recovery.runId || recovery.needsInspection)
      throw new PatchRaceError({
        code: "RUN_RESUME_UNSAFE",
        category: "CONFLICT",
        message: "Run recovery state is incompatible or requires inspection.",
        path: "runId",
      });
    const trialIds = store.manifest.trials.flatMap((trial) =>
      typeof trial["trialId"] === "string" ? [trial["trialId"] as TrialId] : [],
    );
    const coordinator = new RunCoordinator(store, trialIds, now);
    coordinator.#runState = recovery.state as RunState;
    coordinator.#sequence = recovery.sequence;
    const terminal = new Set(recovery.completedTrials);
    for (const id of trialIds)
      coordinator.#trials.set(id, terminal.has(id) ? "completed" : "planned");
    return coordinator;
  }

  async initialize(): Promise<void> {
    return this.serialize(async () => {
      await this.append("run.planned", null, null, "planned", []);
      await this.writeStatus();
    });
  }

  async transitionRun(
    state: RunState,
    artifactHashes: readonly `sha256:${string}`[] = [],
  ): Promise<void> {
    return this.serialize(async () => {
      const terminal = new Set<RunState>([
        "completed",
        "cancelled",
        "failed",
        "interrupted",
        "budget_exhausted",
      ]);
      if (
        terminal.has(this.#runState) &&
        !(
          this.#runState === "interrupted" &&
          (state === "preparing" || state === "running")
        )
      )
        throw new PatchRaceError({
          code: "RUN_ALREADY_TERMINAL",
          category: "CONFLICT",
          message:
            "A terminal run cannot transition again except through a verified interrupted-run resume.",
          path: "state",
        });
      const prior = this.#runState;
      this.#runState = state;
      await this.append(`run.${state}`, null, prior, state, artifactHashes);
      await this.writeStatus();
    });
  }

  async transitionTrial(
    trialId: TrialId,
    state: TrialState,
    artifactHashes: readonly `sha256:${string}`[] = [],
  ): Promise<void> {
    return this.serialize(async () => {
      const prior = this.#trials.get(trialId);
      if (prior === undefined)
        throw new PatchRaceError({
          code: "TRIAL_UNKNOWN",
          category: "CONFIG",
          message: `Unknown trial '${trialId}'.`,
          path: "trialId",
        });
      if (terminalTrialStates.has(prior))
        throw new PatchRaceError({
          code: "TRIAL_ALREADY_TERMINAL",
          category: "CONFLICT",
          message: "A completed trial cannot be duplicated or reopened.",
          path: "trialId",
        });
      this.#trials.set(trialId, state);
      await this.append(
        `trial.${state}`,
        trialId,
        prior,
        state,
        artifactHashes,
      );
      await this.writeStatus();
    });
  }

  resumableTrials(): readonly TrialId[] {
    return [...this.#trials]
      .filter(([, state]) => !terminalTrialStates.has(state))
      .map(([id]) => id);
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operations.then(operation, operation);
    this.#operations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async append(
    type: string,
    trialId: TrialId | null,
    priorState: string | null,
    newState: string,
    artifactHashes: readonly `sha256:${string}`[],
  ): Promise<void> {
    this.#sequence += 1;
    const event: CoordinatorEvent = {
      schemaVersion: SCHEMA_VERSION,
      sequence: this.#sequence,
      type,
      runId: this.#store.runId,
      ...(trialId === null ? {} : { trialId }),
      timestamp: this.#now().toISOString(),
      priorState,
      newState,
      artifactHashes,
    };
    await this.#store.appendJsonLine("events.jsonl", event);
  }

  private async writeStatus(): Promise<void> {
    await this.#store.replaceCoordinator("status.json", {
      schemaVersion: SCHEMA_VERSION,
      runId: this.#store.runId,
      state: this.#runState,
      sequence: this.#sequence,
      trials: Object.fromEntries(
        [...this.#trials].sort(([left], [right]) => left.localeCompare(right)),
      ),
      updatedAt: this.#now().toISOString(),
    });
  }
}

export interface RecoveryResult {
  readonly runId: string;
  readonly state: string;
  readonly completedTrials: readonly TrialId[];
  readonly resumableTrials: readonly TrialId[];
  readonly needsInspection: boolean;
  readonly reasons: readonly string[];
  readonly truncatedBytes: number;
  readonly sequence: number;
}

async function acquireLease(runRoot: string): Promise<() => Promise<void>> {
  const path = resolveOwnedPath(runRoot, "lease");
  const nonce = randomBytes(16).toString("hex");
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new PatchRaceError({
        code: "RUN_LEASE_CONFLICT",
        category: "CONFLICT",
        message:
          "Run has an existing lease; refusing unsafe PID-based recovery.",
        path: "lease",
        remediation:
          "Confirm no PatchRace controller owns this run, then inspect and remove only the exact lease file.",
      });
    throw error;
  }
  await handle.writeFile(
    `${canonicalJson({ schemaVersion: SCHEMA_VERSION, pid: process.pid, nonce })}\n`,
  );
  await handle.sync();
  await handle.close();
  return async () => {
    const current = JSON.parse(
      (await readRegularFileNoFollow(path, "lease")).toString("utf8"),
    ) as {
      nonce?: string;
    };
    if (current.nonce !== nonce)
      throw new PatchRaceError({
        code: "RUN_LEASE_OWNERSHIP_LOST",
        category: "CONFLICT",
        message: "Run lease ownership changed; refusing to remove it.",
        path: "lease",
      });
    await unlink(path);
  };
}

async function verifyIndex(runRoot: string, reasons: string[]): Promise<void> {
  const path = resolve(runRoot, "artifact-index.json");
  try {
    await stat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  let index: {
    artifacts?: { logicalPath?: string; hash?: string }[];
  };
  try {
    const parsed = JSON.parse(
      (await readRegularFileNoFollow(path, "artifact-index.json")).toString(
        "utf8",
      ),
    ) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      throw new TypeError("artifact index is not an object");
    index = parsed as typeof index;
  } catch (error) {
    const code =
      error instanceof SyntaxError
        ? "invalid JSON"
        : error instanceof TypeError
          ? error.message
          : ((error as NodeJS.ErrnoException).code ?? "unreadable");
    reasons.push(`artifact-index is invalid (${code})`);
    return;
  }
  if (index.artifacts !== undefined && !Array.isArray(index.artifacts)) {
    reasons.push("artifact-index artifacts field is not an array");
    return;
  }
  for (const artifact of index.artifacts ?? []) {
    if (
      typeof artifact.logicalPath !== "string" ||
      typeof artifact.hash !== "string"
    ) {
      reasons.push("artifact-index contains an invalid record");
      continue;
    }
    try {
      const bytes = await readRegularFileNoFollow(
        resolveOwnedPath(runRoot, artifact.logicalPath),
        artifact.logicalPath,
      );
      if (sha256(bytes) !== artifact.hash)
        reasons.push(`hash mismatch: ${artifact.logicalPath}`);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "unknown";
      reasons.push(`unreadable artifact (${code}): ${artifact.logicalPath}`);
    }
  }
}

export async function recoverRun(
  runRoot: string,
  now: () => Date = () => new Date(),
): Promise<RecoveryResult> {
  const owner = await ArtifactStore.inspectOwner(runRoot);
  const release = await acquireLease(runRoot);
  try {
    const manifest = JSON.parse(
      (
        await readRegularFileNoFollow(
          resolveOwnedPath(runRoot, "manifest.json"),
          "manifest.json",
        )
      ).toString("utf8"),
    ) as { runId?: string; trials?: { trialId?: string }[] };
    if (manifest.runId !== owner.runId)
      throw new PatchRaceError({
        code: "RUN_MANIFEST_OWNERSHIP_MISMATCH",
        category: "SAFETY",
        message: "Manifest run ID does not match the ownership record.",
        path: "manifest.json",
      });
    const eventsPath = resolveOwnedPath(runRoot, "events.jsonl");
    const bytes = await readRegularFileNoFollow(eventsPath, "events.jsonl");
    let validLength = bytes.byteLength;
    let truncatedBytes = 0;
    if (bytes.byteLength > 0 && bytes[bytes.byteLength - 1] !== 0x0a) {
      const lastNewline = bytes.lastIndexOf(0x0a);
      const tail = bytes.subarray(lastNewline + 1);
      try {
        JSON.parse(tail.toString("utf8"));
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        validLength = lastNewline + 1;
        truncatedBytes = bytes.byteLength - validLength;
        const handle = await openRegularFileNoFollow(
          eventsPath,
          constants.O_RDWR,
          { label: "events.jsonl" },
        );
        try {
          await handle.truncate(validLength);
          await handle.sync();
        } finally {
          await handle.close();
        }
      }
    }
    const reasons: string[] = [];
    const content = bytes.subarray(0, validLength).toString("utf8");
    const events: Partial<CoordinatorEvent>[] = [];
    for (const [index, line] of content.split("\n").entries()) {
      if (line.length === 0) continue;
      try {
        const parsed = JSON.parse(line) as unknown;
        if (
          parsed === null ||
          typeof parsed !== "object" ||
          Array.isArray(parsed)
        ) {
          reasons.push(`event line ${index + 1} is not an object`);
          continue;
        }
        events.push(parsed as Partial<CoordinatorEvent>);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        reasons.push(`event line ${index + 1} contains invalid JSON`);
      }
    }
    const completed = new Set<TrialId>();
    let expected = 1;
    let state = "planned";
    for (const event of events) {
      if (event.sequence !== expected)
        reasons.push(
          `event sequence expected ${expected}, found ${String(event.sequence)}`,
        );
      expected = (event.sequence ?? expected) + 1;
      if (typeof event.newState === "string" && event.type?.startsWith("run."))
        state = event.newState;
      if (
        event.trialId !== undefined &&
        terminalTrialStates.has(event.newState as TrialState)
      ) {
        if (completed.has(event.trialId))
          reasons.push(`duplicate terminal event: ${event.trialId}`);
        completed.add(event.trialId);
      }
    }
    await verifyIndex(runRoot, reasons);
    const allTrials = (manifest.trials ?? []).flatMap((trial) =>
      typeof trial.trialId === "string" ? [trial.trialId as TrialId] : [],
    );
    const resumable =
      reasons.length === 0 ? allTrials.filter((id) => !completed.has(id)) : [];
    const sequence = expected;
    const recoveryEvent = {
      schemaVersion: SCHEMA_VERSION,
      sequence,
      type: "recovery.completed",
      runId: owner.runId,
      timestamp: now().toISOString(),
      priorState: state,
      newState: state,
      artifactHashes: [],
      decisions: {
        completedTrials: [...completed].sort(),
        resumableTrials: resumable,
        truncatedBytes,
        needsInspection: reasons.length > 0,
      },
    };
    const handle = await openRegularFileNoFollow(
      eventsPath,
      constants.O_APPEND | constants.O_WRONLY,
      { label: "events.jsonl" },
    );
    try {
      await handle.writeFile(`${canonicalJson(recoveryEvent)}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return {
      runId: owner.runId,
      state,
      completedTrials: [...completed].sort(),
      resumableTrials: resumable,
      needsInspection: reasons.length > 0,
      reasons,
      truncatedBytes,
      sequence,
    };
  } finally {
    await release();
  }
}
