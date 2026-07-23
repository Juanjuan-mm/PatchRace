import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdir, open, rename, rm, unlink } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import {
  PatchRaceError,
  SCHEMA_VERSION,
  assertRunId,
  canonicalJson,
  createSortableId,
  sha256,
  type RunId,
} from "@patchrace/contracts";

import {
  assertSafeRoot,
  ensureOwnedDirectory,
  openRegularFileNoFollow,
  readRegularFileNoFollow,
  resolveOwnedPath,
} from "./safety.js";

export interface ArtifactRecord {
  readonly logicalPath: string;
  readonly mediaType: string;
  readonly schemaVersion?: string;
  readonly sensitivity: "local-sensitive" | "local" | "export-safe";
  readonly size: number;
  readonly hash: `sha256:${string}`;
  readonly producer: string;
  readonly dependencies: readonly string[];
}

export interface RunManifest {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly runId: RunId;
  readonly createdAt: string;
  readonly planHash: `sha256:${string}`;
  readonly source: Readonly<Record<string, unknown>>;
  readonly controller: Readonly<Record<string, unknown>>;
  readonly budgets: Readonly<Record<string, number | null>>;
  readonly trials: readonly Readonly<Record<string, unknown>>[];
  readonly artifactIndexVersion: typeof SCHEMA_VERSION;
}

export interface CreateRunOptions {
  readonly stateRoot: string;
  readonly manifest: Omit<RunManifest, "runId"> & { readonly runId?: RunId };
  readonly now?: () => Date;
  readonly random?: (size: number) => Uint8Array;
}

interface OwnerRecord {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly kind: "patchrace-run-root";
  readonly runId: RunId;
  readonly nonce: string;
}

async function writeAll(
  handle: Awaited<ReturnType<typeof open>>,
  bytes: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = await handle.write(
      bytes,
      offset,
      bytes.byteLength - offset,
      null,
    );
    offset += written.bytesWritten;
  }
}

export class ArtifactStore {
  readonly stateRoot: string;
  readonly runRoot: string;
  readonly runId: RunId;
  readonly manifest: RunManifest;
  readonly #records = new Map<string, ArtifactRecord>();

  private constructor(
    stateRoot: string,
    runRoot: string,
    manifest: RunManifest,
  ) {
    this.stateRoot = stateRoot;
    this.runRoot = runRoot;
    this.runId = manifest.runId;
    this.manifest = manifest;
  }

  static async create(options: CreateRunOptions): Promise<ArtifactStore> {
    const stateRoot = assertSafeRoot(options.stateRoot, "stateRoot");
    await ensureOwnedDirectory(stateRoot, "runs");
    const idOptions =
      options.random === undefined
        ? { now: () => (options.now ?? (() => new Date()))().getTime() }
        : {
            now: () => (options.now ?? (() => new Date()))().getTime(),
            random: options.random,
          };
    const runId =
      options.manifest.runId ?? (createSortableId("run", idOptions) as RunId);
    assertRunId(runId);
    const runRoot = resolve(stateRoot, "runs", runId);
    try {
      await mkdir(runRoot, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new PatchRaceError({
          code: "RUN_ID_COLLISION",
          category: "CONFLICT",
          message: `Run root already exists: ${runId}.`,
          path: "runId",
        });
      }
      throw error;
    }
    const owner: OwnerRecord = {
      schemaVersion: SCHEMA_VERSION,
      kind: "patchrace-run-root",
      runId,
      nonce: Buffer.from((options.random ?? randomBytes)(16)).toString("hex"),
    };
    const manifest: RunManifest = { ...options.manifest, runId };
    const store = new ArtifactStore(stateRoot, runRoot, manifest);
    try {
      await store.finalizeJson("owner.json", owner, {
        sensitivity: "local",
        producer: "core/artifact-store",
        index: false,
      });
      await store.finalizeJson("manifest.json", manifest, {
        sensitivity: "local",
        producer: "core/artifact-store",
      });
      await store.appendJsonLine("events.jsonl", {
        schemaVersion: SCHEMA_VERSION,
        sequence: 1,
        type: "run.reserved",
        runId,
        timestamp: (options.now ?? (() => new Date()))().toISOString(),
      });
    } catch (error) {
      await rm(runRoot, { recursive: true, force: true });
      throw error;
    }
    return store;
  }

  static async open(
    stateRootInput: string,
    runId: string,
  ): Promise<ArtifactStore> {
    assertRunId(runId);
    const stateRoot = assertSafeRoot(stateRootInput, "stateRoot");
    const runRoot = resolve(stateRoot, "runs", runId);
    const owner = await ArtifactStore.inspectOwner(runRoot);
    if (owner.runId !== runId)
      throw new PatchRaceError({
        code: "RUN_OWNERSHIP_MISMATCH",
        category: "SAFETY",
        message: "Run ownership does not match the requested run ID.",
        path: "runId",
      });
    const manifest = JSON.parse(
      (
        await readRegularFileNoFollow(
          resolveOwnedPath(runRoot, "manifest.json"),
          "manifest.json",
        )
      ).toString("utf8"),
    ) as RunManifest;
    if (manifest.runId !== runId || manifest.schemaVersion !== SCHEMA_VERSION)
      throw new PatchRaceError({
        code: "RUN_MANIFEST_INVALID",
        category: "CONFLICT",
        message: "Existing run manifest is invalid or incompatible.",
        path: "manifest.json",
      });
    return new ArtifactStore(stateRoot, runRoot, manifest);
  }

  async finalizeJson(
    logicalPath: string,
    value: unknown,
    options: {
      readonly sensitivity: ArtifactRecord["sensitivity"];
      readonly producer: string;
      readonly dependencies?: readonly string[];
      readonly index?: boolean;
    },
  ): Promise<ArtifactRecord> {
    return this.finalizeBytes(
      logicalPath,
      Buffer.from(`${canonicalJson(value)}\n`),
      {
        ...options,
        mediaType: "application/json",
        schemaVersion: SCHEMA_VERSION,
      },
    );
  }

  async finalizeBytes(
    logicalPath: string,
    bytes: Uint8Array,
    options: {
      readonly mediaType: string;
      readonly sensitivity: ArtifactRecord["sensitivity"];
      readonly producer: string;
      readonly dependencies?: readonly string[];
      readonly schemaVersion?: string;
      readonly index?: boolean;
    },
  ): Promise<ArtifactRecord> {
    const target = resolveOwnedPath(this.runRoot, logicalPath);
    const parentLogical = relative(this.runRoot, dirname(target)) || ".";
    await ensureOwnedDirectory(this.runRoot, parentLogical);
    const temporary = `${target}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await writeAll(handle, bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temporary, target);
    } catch (error) {
      try {
        await unlink(temporary);
      } catch (cleanupError) {
        throw new PatchRaceError(
          {
            code: "ARTIFACT_TEMP_CLEANUP_FAILED",
            category: "CONFLICT",
            message: `Artifact finalization failed and its exact temporary file could not be removed: ${logicalPath}.`,
            path: logicalPath,
            remediation:
              "Retain the run for inspection before attempting exact-target cleanup.",
          },
          { cause: new AggregateError([error, cleanupError]) },
        );
      }
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new PatchRaceError({
          code: "ARTIFACT_IMMUTABLE",
          category: "CONFLICT",
          message: `Artifact already exists and cannot be replaced: ${logicalPath}.`,
          path: logicalPath,
        });
      }
      throw error;
    }
    await unlink(temporary);
    const record: ArtifactRecord = {
      logicalPath: logicalPath.replaceAll("\\", "/"),
      mediaType: options.mediaType,
      ...(options.schemaVersion === undefined
        ? {}
        : { schemaVersion: options.schemaVersion }),
      sensitivity: options.sensitivity,
      size: bytes.byteLength,
      hash: sha256(bytes),
      producer: options.producer,
      dependencies: options.dependencies ?? [],
    };
    if (options.index !== false) this.#records.set(record.logicalPath, record);
    return record;
  }

  async appendJsonLine(
    logicalPath: string,
    value: unknown,
  ): Promise<`sha256:${string}`> {
    const target = resolveOwnedPath(this.runRoot, logicalPath);
    await ensureOwnedDirectory(
      this.runRoot,
      relative(this.runRoot, dirname(target)) || ".",
    );
    const bytes = Buffer.from(`${canonicalJson(value)}\n`);
    const handle = await openRegularFileNoFollow(
      target,
      constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY,
      { label: logicalPath, mode: 0o600 },
    );
    try {
      await writeAll(handle, bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return sha256(bytes);
  }

  async appendBytes(logicalPath: string, bytes: Uint8Array): Promise<void> {
    const target = resolveOwnedPath(this.runRoot, logicalPath);
    await ensureOwnedDirectory(
      this.runRoot,
      relative(this.runRoot, dirname(target)) || ".",
    );
    const handle = await openRegularFileNoFollow(
      target,
      constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY,
      { label: logicalPath, mode: 0o600 },
    );
    try {
      await writeAll(handle, bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async indexExisting(
    logicalPath: string,
    options: {
      readonly mediaType: string;
      readonly sensitivity: ArtifactRecord["sensitivity"];
      readonly producer: string;
      readonly dependencies?: readonly string[];
    },
  ): Promise<ArtifactRecord> {
    const bytes = await readRegularFileNoFollow(
      resolveOwnedPath(this.runRoot, logicalPath),
      logicalPath,
    );
    const record: ArtifactRecord = {
      logicalPath,
      mediaType: options.mediaType,
      sensitivity: options.sensitivity,
      size: bytes.byteLength,
      hash: sha256(bytes),
      producer: options.producer,
      dependencies: options.dependencies ?? [],
    };
    this.#records.set(logicalPath, record);
    return record;
  }

  async replaceCoordinator(logicalPath: string, value: unknown): Promise<void> {
    const target = resolveOwnedPath(this.runRoot, logicalPath);
    await ensureOwnedDirectory(
      this.runRoot,
      relative(this.runRoot, dirname(target)) || ".",
    );
    const temporary = `${target}.coordinator-${process.pid}-${randomBytes(8).toString("hex")}`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await writeAll(handle, Buffer.from(`${canonicalJson(value)}\n`));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
  }

  async verify(
    logicalPath: string,
    expectedHash: `sha256:${string}`,
  ): Promise<void> {
    const bytes = await readRegularFileNoFollow(
      resolveOwnedPath(this.runRoot, logicalPath),
      logicalPath,
    );
    if (sha256(bytes) !== expectedHash) {
      throw new PatchRaceError({
        code: "ARTIFACT_HASH_MISMATCH",
        category: "CONFLICT",
        message: `Artifact hash mismatch: ${logicalPath}.`,
        path: logicalPath,
      });
    }
  }

  async finalizeIndex(): Promise<ArtifactRecord> {
    const artifacts = [...this.#records.values()].sort((left, right) =>
      left.logicalPath.localeCompare(right.logicalPath),
    );
    return this.finalizeJson(
      "artifact-index.json",
      { schemaVersion: SCHEMA_VERSION, artifacts },
      {
        sensitivity: "local",
        producer: "core/artifact-store",
        dependencies: artifacts.map((record) => record.hash),
        index: false,
      },
    );
  }

  static async inspectOwner(runRoot: string): Promise<OwnerRecord> {
    const info = await lstat(runRoot);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new PatchRaceError({
        code: "RUN_ROOT_UNSAFE",
        category: "SAFETY",
        message: "Run root is not a real directory.",
        path: "runRoot",
      });
    const owner = JSON.parse(
      (
        await readRegularFileNoFollow(
          resolve(runRoot, "owner.json"),
          "owner.json",
        )
      ).toString("utf8"),
    ) as Partial<OwnerRecord>;
    if (
      owner.kind !== "patchrace-run-root" ||
      owner.schemaVersion !== SCHEMA_VERSION ||
      typeof owner.runId !== "string"
    ) {
      throw new PatchRaceError({
        code: "RUN_OWNERSHIP_INVALID",
        category: "SAFETY",
        message: "Run root ownership record is invalid.",
        path: "owner.json",
      });
    }
    assertRunId(owner.runId);
    return owner as OwnerRecord;
  }
}
