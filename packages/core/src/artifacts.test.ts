import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalHash, type RunId } from "@patchrace/contracts";

import { ArtifactStore } from "./artifacts.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

describe("ArtifactStore", () => {
  it("reserves a run, finalizes immutable artifacts, and verifies hashes", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-artifacts-"));
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
        planHash: canonicalHash({ plan: 1 }),
        source: {},
        controller: {},
        budgets: {},
        trials: [],
        artifactIndexVersion: "1.0.0",
      },
    });

    const result = await store.finalizeJson(
      "trials/result.json",
      { outcome: "completed" },
      { sensitivity: "local", producer: "test" },
    );
    await expect(
      store.finalizeJson(
        "trials/result.json",
        {},
        { sensitivity: "local", producer: "test" },
      ),
    ).rejects.toMatchObject({ details: { code: "ARTIFACT_IMMUTABLE" } });
    await expect(
      store.verify(result.logicalPath, result.hash),
    ).resolves.toBeUndefined();
    await store.finalizeIndex();
    expect(
      JSON.parse(await readFile(join(store.runRoot, "manifest.json"), "utf8")),
    ).toMatchObject({ runId });
    expect((await ArtifactStore.inspectOwner(store.runRoot)).runId).toBe(runId);
    expect(await readFile(join(parent, "unrelated.txt"), "utf8")).toBe(
      "preserve\n",
    );
  });

  it("refuses traversal paths", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-artifacts-"));
    roots.push(parent);
    const store = await ArtifactStore.create({
      stateRoot: join(parent, ".patchrace"),
      now: () => new Date(0),
      random: (size) => new Uint8Array(size),
      manifest: {
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
    await expect(
      store.finalizeBytes("../escape", new Uint8Array(), {
        mediaType: "text/plain",
        sensitivity: "local",
        producer: "test",
      }),
    ).rejects.toMatchObject({ details: { category: "SAFETY" } });
  });

  it("refuses symbolic-link and hard-link artifact targets without touching external files", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-artifacts-"));
    roots.push(parent);
    const store = await ArtifactStore.create({
      stateRoot: join(parent, ".patchrace"),
      now: () => new Date(0),
      random: (size) => new Uint8Array(size),
      manifest: {
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
    const outside = join(parent, "user-data.txt");
    await writeFile(outside, "preserve\n");
    await mkdir(join(store.runRoot, "raw"));
    await symlink(outside, join(store.runRoot, "raw", "symlink.log"));
    await link(outside, join(store.runRoot, "raw", "hardlink.log"));

    await expect(
      store.appendBytes("raw/symlink.log", Buffer.from("unsafe\n")),
    ).rejects.toMatchObject({
      details: { code: "PATH_FILE_UNSAFE", category: "SAFETY" },
    });
    await expect(
      store.appendBytes("raw/hardlink.log", Buffer.from("unsafe\n")),
    ).rejects.toMatchObject({
      details: { code: "PATH_FILE_UNSAFE", category: "SAFETY" },
    });
    expect(await readFile(outside, "utf8")).toBe("preserve\n");
  });
});
