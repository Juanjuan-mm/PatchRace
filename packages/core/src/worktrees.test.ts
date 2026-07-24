import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { type RunId, type TrialId } from "@patchrace/contracts";

import { WorktreeManager } from "./worktrees.js";

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

async function repository(): Promise<{ root: string; commit: string }> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-worktree-"));
  roots.push(root);
  await execute("git", ["init", "-q", root]);
  await writeFile(join(root, ".gitignore"), ".patchrace/\n");
  await writeFile(join(root, "message.txt"), "baseline\n");
  await execute("git", ["-C", root, "add", "."]);
  await execute("git", [
    "-C",
    root,
    "-c",
    "user.name=PatchRace",
    "-c",
    "user.email=fixture@patchrace.invalid",
    "commit",
    "-qm",
    "baseline",
  ]);
  const { stdout } = await execute("git", ["-C", root, "rev-parse", "HEAD"]);
  return { root, commit: stdout.trim() };
}

describe("WorktreeManager", () => {
  it("creates a detached exact-commit worktree and refuses implicit dirty cleanup", async () => {
    const fixture = await repository();
    const manager = await WorktreeManager.open(
      fixture.root,
      join(fixture.root, ".patchrace"),
    );
    const record = await manager.create({
      runId: "run_00000000000000000000000000" as RunId,
      trialId: "trial_00000000000000000000000000" as TrialId,
      commit: fixture.commit,
      now: () => new Date(0),
    });
    expect(record.baselineCommit).toBe(fixture.commit);
    expect(
      (await manager.list()).some((item) => item.path === record.path),
    ).toBe(true);
    await writeFile(join(record.path, "message.txt"), "changed\n");
    await expect(
      manager.cleanup(record, { confirm: true }),
    ).rejects.toMatchObject({ details: { code: "WORKTREE_DIRTY_RETAINED" } });
    await expect(manager.cleanup(record)).resolves.toMatchObject({
      removed: false,
      dirty: true,
    });
    await expect(
      manager.cleanup(record, { confirm: true, allowDirty: true }),
    ).resolves.toMatchObject({ removed: true, dirty: true });
    expect(await readFile(join(fixture.root, "message.txt"), "utf8")).toBe(
      "baseline\n",
    );
  });

  it("never collides with an existing trial path", async () => {
    const fixture = await repository();
    const manager = await WorktreeManager.open(
      fixture.root,
      join(fixture.root, ".patchrace"),
    );
    const options = {
      runId: "run_00000000000000000000000000" as RunId,
      trialId: "trial_00000000000000000000000000" as TrialId,
      commit: fixture.commit,
    };
    await manager.create(options);
    await expect(manager.create(options)).rejects.toMatchObject({
      details: { code: "WORKTREE_COLLISION" },
    });
  });
});
