import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalHash, type RunId } from "@patchrace/contracts";

import { ArtifactStore } from "./artifacts.js";
import { executeCleanup, planCacheCleanup, planRunCleanup } from "./cleanup.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

describe("safe cleanup", () => {
  it("defaults to an exact dry run and requires confirmation to remove owned artifacts", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-cleanup-"));
    roots.push(parent);
    await writeFile(join(parent, "unrelated.txt"), "preserve\n");
    const stateRoot = join(parent, ".patchrace");
    const runId = "run_00000000000000000000000000" as RunId;
    const store = await ArtifactStore.create({
      stateRoot,
      now: () => new Date(0),
      random: (size) => new Uint8Array(size),
      manifest: {
        runId,
        schemaVersion: "1.0.0",
        createdAt: new Date(0).toISOString(),
        planHash: canonicalHash({}),
        source: {},
        controller: {},
        budgets: {},
        trials: [],
        artifactIndexVersion: "1.0.0",
      },
    });
    const plan = await planRunCleanup({
      stateRoot,
      runId,
      includeArtifacts: true,
    });
    const canonicalRunRoot = await realpath(store.runRoot);
    expect(plan.targets).toEqual([
      expect.objectContaining({
        kind: "artifacts",
        path: canonicalRunRoot,
        ownership: runId,
      }),
    ]);
    expect((await executeCleanup(plan)).removed).toEqual([]);
    await expect(access(store.runRoot)).resolves.toBeUndefined();
    expect((await executeCleanup(plan, { confirm: true })).removed).toEqual([
      canonicalRunRoot,
    ]);
    await expect(access(store.runRoot)).rejects.toThrow();
    expect(await readFile(join(parent, "unrelated.txt"), "utf8")).toBe(
      "preserve\n",
    );
  });

  it("refuses malformed broad run identifiers before resolving a deletion target", async () => {
    await expect(
      planRunCleanup({
        stateRoot: join(tmpdir(), "state"),
        runId: "../../",
        includeArtifacts: true,
      }),
    ).rejects.toMatchObject({ details: { category: "SAFETY" } });
  });

  it("removes only cache entries with matching ownership records", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-cache-cleanup-"));
    roots.push(parent);
    const stateRoot = join(parent, ".patchrace");
    const owned = join(stateRoot, "cache", "owned-key");
    const unrelated = join(stateRoot, "cache", "unrelated-key");
    await writeFile(join(parent, "unrelated.txt"), "preserve\n");
    await Promise.all([
      mkdir(owned, { recursive: true }),
      mkdir(unrelated, { recursive: true }),
    ]);
    await writeFile(
      join(owned, ".patchrace-cache-owner.json"),
      JSON.stringify({
        schemaVersion: "1.0.0",
        kind: "patchrace-cache-entry",
        cacheKey: "owned-key",
      }),
    );
    await utimes(owned, new Date(0), new Date(0));

    const plan = await planCacheCleanup({
      stateRoot,
      olderThanMs: 1,
      now: () => 10,
    });
    expect(plan.targets.map(({ path }) => path)).toEqual([
      await realpath(owned),
    ]);
    await executeCleanup(plan, { confirm: true });
    await expect(access(owned)).rejects.toThrow();
    await expect(access(unrelated)).resolves.toBeUndefined();
    expect(await readFile(join(parent, "unrelated.txt"), "utf8")).toBe(
      "preserve\n",
    );
  });

  it("retains an old unowned cache entry and fails closed", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-cache-cleanup-"));
    roots.push(parent);
    const stateRoot = join(parent, ".patchrace");
    const unowned = join(stateRoot, "cache", "unowned-key");
    await mkdir(unowned, { recursive: true });
    await utimes(unowned, new Date(0), new Date(0));
    await expect(
      planCacheCleanup({ stateRoot, olderThanMs: 1, now: () => 10 }),
    ).rejects.toMatchObject({
      details: { code: "CLEANUP_CACHE_OWNERSHIP_MISSING" },
    });
    await expect(access(unowned)).resolves.toBeUndefined();
  });

  it("refuses a symlinked cache ownership record without reading its target", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-cache-cleanup-"));
    roots.push(parent);
    const stateRoot = join(parent, ".patchrace");
    const owned = join(stateRoot, "cache", "owned-key");
    const outside = join(parent, "outside-owner.json");
    await mkdir(owned, { recursive: true });
    await writeFile(
      outside,
      JSON.stringify({
        schemaVersion: "1.0.0",
        kind: "patchrace-cache-entry",
        cacheKey: "owned-key",
      }),
    );
    await symlink(outside, join(owned, ".patchrace-cache-owner.json"));
    await utimes(owned, new Date(0), new Date(0));

    await expect(
      planCacheCleanup({ stateRoot, olderThanMs: 1, now: () => 10 }),
    ).rejects.toMatchObject({
      details: { code: "CLEANUP_CACHE_OWNERSHIP_MISSING" },
    });
    expect(await readFile(outside, "utf8")).toContain("owned-key");
    await expect(access(owned)).resolves.toBeUndefined();
  });

  it("fails closed when run ownership changes after planning", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-cleanup-"));
    roots.push(parent);
    const stateRoot = join(parent, ".patchrace");
    const runId = "run_00000000000000000000000000" as RunId;
    const store = await ArtifactStore.create({
      stateRoot,
      now: () => new Date(0),
      random: (size) => new Uint8Array(size),
      manifest: {
        runId,
        schemaVersion: "1.0.0",
        createdAt: new Date(0).toISOString(),
        planHash: canonicalHash({}),
        source: {},
        controller: {},
        budgets: {},
        trials: [],
        artifactIndexVersion: "1.0.0",
      },
    });
    const plan = await planRunCleanup({
      stateRoot,
      runId,
      includeArtifacts: true,
    });
    const ownerPath = join(store.runRoot, "owner.json");
    const owner = JSON.parse(await readFile(ownerPath, "utf8")) as {
      runId: string;
    };
    await writeFile(
      ownerPath,
      `${JSON.stringify({
        ...owner,
        runId: "run_00000000000000000000000001",
      })}\n`,
    );

    await expect(executeCleanup(plan, { confirm: true })).rejects.toMatchObject(
      {
        details: { code: "CLEANUP_OWNERSHIP_CHANGED" },
      },
    );
    await expect(access(store.runRoot)).resolves.toBeUndefined();
    expect(await readFile(ownerPath, "utf8")).toContain(
      "run_00000000000000000000000001",
    );
  });
});
