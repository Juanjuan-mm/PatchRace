import {
  access,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalHash, type RunId } from "@patchrace/contracts";

import { ArtifactStore } from "./artifacts.js";
import { CoreCommandService } from "./services.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-core-service-"));
  roots.push(root);
  await writeFile(join(root, "sentinel.txt"), "preserve\n");
  return root;
}

describe("CoreCommandService", () => {
  it("routes doctor to a non-secret readiness report", async () => {
    const root = await project();
    const result = await new CoreCommandService().execute({
      command: "doctor",
      options: { project: root },
    });

    expect(result).toMatchObject({
      command: "doctor",
      status: "completed",
      sideEffects: [],
      data: {
        projectRoot: ".",
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "runtime.node", status: "pass" }),
        ]),
      },
    });
    expect(JSON.stringify(result)).not.toContain(root);
    expect(await readFile(join(root, "sentinel.txt"), "utf8")).toBe(
      "preserve\n",
    );
  });

  it("keeps clean dry-run non-destructive and removes only a confirmed owned run", async () => {
    const root = await project();
    const stateRoot = join(root, ".patchrace");
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
    const service = new CoreCommandService();
    const canonicalRunRoot = await realpath(store.runRoot);

    const preview = await service.execute({
      command: "clean",
      options: {
        project: root,
        stateDir: ".patchrace",
        run: runId,
        artifacts: true,
      },
    });
    expect(preview).toMatchObject({
      command: "clean",
      status: "dry-run",
      sideEffects: [],
    });
    await expect(access(store.runRoot)).resolves.toBeUndefined();

    const confirmed = await service.execute({
      command: "clean",
      options: {
        project: root,
        stateDir: ".patchrace",
        run: runId,
        artifacts: true,
        confirm: true,
      },
    });
    expect(confirmed).toMatchObject({
      command: "clean",
      status: "completed",
      sideEffects: [canonicalRunRoot],
    });
    await expect(access(store.runRoot)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(join(root, "sentinel.txt"), "utf8")).toBe(
      "preserve\n",
    );
  });

  it("rejects an invalid cache duration before changing unrelated state", async () => {
    const root = await project();
    const service = new CoreCommandService();

    await expect(
      service.execute({
        command: "clean",
        options: {
          project: root,
          stateDir: ".patchrace",
          cache: true,
          olderThan: "soon",
          confirm: true,
        },
      }),
    ).rejects.toMatchObject({
      details: { code: "CLEANUP_DURATION_INVALID", category: "USAGE" },
    });
    expect(await readFile(join(root, "sentinel.txt"), "utf8")).toBe(
      "preserve\n",
    );
  });

  it("rejects cleanup without an explicit owned target", async () => {
    const root = await project();

    await expect(
      new CoreCommandService().execute({
        command: "clean",
        options: { project: root, confirm: true },
      }),
    ).rejects.toMatchObject({
      details: {
        code: "CLEANUP_TARGET_REQUIRED",
        category: "USAGE",
        path: "clean",
      },
    });
    expect(await readFile(join(root, "sentinel.txt"), "utf8")).toBe(
      "preserve\n",
    );
  });
});
