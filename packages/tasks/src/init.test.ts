import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { PatchRaceError } from "@patchrace/contracts";
import { loadSuiteConfig } from "@patchrace/core";

import { initializeManualSuite } from "./init.js";
import { loadTask } from "./task.js";

const execute = promisify(execFile);
const temporaryDirectories: string[] = [];

async function gitProject(commit = true): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-init-"));
  temporaryDirectories.push(root);
  await execute("git", ["init", "-q"], { cwd: root });
  await execute("git", ["config", "user.name", "PatchRace Fixture"], {
    cwd: root,
  });
  await execute("git", ["config", "user.email", "fixture@example.invalid"], {
    cwd: root,
  });
  await writeFile(join(root, "README.md"), "fixture\n");
  if (commit) {
    await execute("git", ["add", "README.md"], { cwd: root });
    await execute("git", ["commit", "-qm", "fixture baseline"], {
      cwd: root,
    });
  }
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("initializeManualSuite", () => {
  it("creates and verifies an editable suite without invoking an agent", async () => {
    const root = await gitProject();
    const result = await initializeManualSuite({
      projectRoot: root,
      now: () => new Date("2026-07-22T00:00:00.000Z"),
    });

    const [suite, task, head] = await Promise.all([
      loadSuiteConfig(result.suitePath),
      loadTask(result.taskPath),
      execute("git", ["rev-parse", "HEAD"], { cwd: root }),
    ]);
    expect(result).toMatchObject({
      baselineCommit: head.stdout.trim(),
      suiteHash: suite.configHash,
      taskHash: task.taskHash,
      backupRoot: null,
      agentInvoked: false,
    });
    expect(task.task.provenance.reviewedBy).toBe("unreviewed");
    expect(task.task.metadata["reviewRequired"]).toBe(true);
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("fixture\n");
  });

  it("fails closed on existing targets and preserves them with force", async () => {
    const root = await gitProject();
    const first = await initializeManualSuite({
      projectRoot: root,
      now: () => new Date(1000),
    });
    await writeFile(first.instructionPath, "user edit\n");

    await expect(
      initializeManualSuite({ projectRoot: root, now: () => new Date(2000) }),
    ).rejects.toMatchObject({
      details: { code: "INIT_TARGET_EXISTS", category: "CONFLICT" },
    });
    expect(await readFile(first.instructionPath, "utf8")).toBe("user edit\n");

    const replaced = await initializeManualSuite({
      projectRoot: root,
      force: true,
      now: () => new Date(2000),
    });
    expect(replaced.backupRoot).not.toBeNull();
    expect(
      await readFile(
        join(replaced.backupRoot!, "manual-task", "instruction.md"),
        "utf8",
      ),
    ).toBe("user edit\n");
    expect(await readFile(replaced.instructionPath, "utf8")).toContain(
      "Describe the repository change",
    );
  });

  it("requires an exact committed Git baseline and creates no suite on failure", async () => {
    const root = await gitProject(false);
    await expect(
      initializeManualSuite({ projectRoot: root }),
    ).rejects.toBeInstanceOf(PatchRaceError);
    await expect(
      initializeManualSuite({ projectRoot: root }),
    ).rejects.toMatchObject({
      details: { code: "INIT_GIT_BASELINE_UNAVAILABLE" },
    });
    await expect(
      readFile(join(root, ".patchrace", "suite.yaml")),
    ).rejects.toThrow();
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("fixture\n");
  });
});
