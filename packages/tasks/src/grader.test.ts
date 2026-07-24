import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  sha256,
  type TaskCommandV1,
  type TaskV1,
} from "@patchrace/contracts";

import { runTaskCommandPhase } from "./grader.js";

const temporaryDirectories: string[] = [];
const commit = "a".repeat(40);

async function directories(): Promise<{
  readonly worktree: string;
  readonly evidence: string;
}> {
  const worktree = await mkdtemp(join(tmpdir(), "patchrace-grader-work-"));
  const evidence = await mkdtemp(join(tmpdir(), "patchrace-grader-evidence-"));
  temporaryDirectories.push(worktree, evidence);
  return { worktree, evidence };
}

function task(
  setup: readonly TaskCommandV1[],
  verifier: readonly TaskCommandV1[],
): TaskV1 {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "command-grade",
    revision: 1,
    baseline: {
      repository: ".",
      commit,
      submodules: "disabled",
      lfs: "disabled",
    },
    instruction: {
      file: "instruction.md",
      hash: sha256("instruction\n"),
    },
    setup: { commands: setup, assets: [] },
    verifier: { visibility: "public", assets: [], commands: verifier },
    assertions: [],
    budgets: {
      trialSeconds: 30,
      maxTokens: null,
      maxCostUsd: null,
      maxOutputBytes: 64 * 1024,
      maxPatchLines: 100,
    },
    provenance: {
      source: "manual",
      sourceCommit: commit,
      referencePatchHash: sha256(""),
      createdAt: "2026-07-22T00:00:00.000Z",
      reviewedBy: "user",
    },
    metadata: {},
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("runTaskCommandPhase", () => {
  it("runs deterministic command kinds and persists immutable structured evidence", async () => {
    const { worktree, evidence } = await directories();
    const commands: TaskCommandV1[] = [
      ["build", "build"],
      ["test", "test"],
      ["lint", "lint"],
      ["typecheck", "typecheck"],
    ].map(([id, kind]) => ({
      id: id!,
      kind: kind as NonNullable<TaskCommandV1["kind"]>,
      argv: [
        process.execPath,
        "-e",
        `process.stdout.write('${id}\\n'); process.stderr.write('evidence\\n')`,
      ],
      timeoutSeconds: 5,
      network: "forbidden",
    }));

    const result = await runTaskCommandPhase({
      task: task([], commands),
      phase: "verifier",
      workingDirectory: worktree,
      evidenceDirectory: evidence,
    });

    expect(result.status).toBe("passed");
    expect(result.commands.map((command) => command.kind)).toEqual([
      "build",
      "test",
      "lint",
      "typecheck",
    ]);
    for (const command of result.commands) {
      const stdout = await readFile(join(evidence, command.stdout.evidenceRef));
      const persisted = JSON.parse(
        await readFile(
          join(evidence, "verifier", command.id, "result.json"),
          "utf8",
        ),
      ) as unknown;
      expect(command.stdout.hash).toBe(sha256(stdout));
      expect(persisted).toEqual(command);
    }
  });

  it("honors expected exits and reports failures, timeouts, and cancellation", async () => {
    const expected = await directories();
    const expectedResult = await runTaskCommandPhase({
      task: task(
        [
          {
            id: "expected-three",
            kind: "setup",
            argv: [process.execPath, "-e", "process.exit(3)"],
            timeoutSeconds: 5,
            expectedExitCodes: [3],
          },
        ],
        [],
      ),
      phase: "setup",
      workingDirectory: expected.worktree,
      evidenceDirectory: expected.evidence,
    });
    expect(expectedResult.status).toBe("passed");

    const timeout = await directories();
    const timeoutResult = await runTaskCommandPhase({
      task: task(
        [],
        [
          {
            id: "timeout",
            kind: "test",
            argv: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
            timeoutSeconds: 0.02,
          },
        ],
      ),
      phase: "verifier",
      workingDirectory: timeout.worktree,
      evidenceDirectory: timeout.evidence,
    });
    expect(timeoutResult).toMatchObject({
      status: "failed",
      commands: [{ status: "failed", terminationReason: "timeout" }],
    });

    const cancelled = await directories();
    const controller = new AbortController();
    controller.abort();
    const cancelledResult = await runTaskCommandPhase({
      task: task(
        [],
        [
          {
            id: "cancelled",
            kind: "test",
            argv: [process.execPath, "--version"],
            timeoutSeconds: 5,
          },
        ],
      ),
      phase: "verifier",
      workingDirectory: cancelled.worktree,
      evidenceDirectory: cancelled.evidence,
      signal: controller.signal,
    });
    expect(cancelledResult.status).toBe("cancelled");
  });

  it("rejects cwd traversal and duplicate evidence without modifying unrelated files", async () => {
    const { worktree, evidence } = await directories();
    const unrelated = join(worktree, "unrelated.txt");
    await writeFile(unrelated, "preserve\n");
    const unsafe = task(
      [],
      [
        {
          id: "unsafe",
          kind: "test",
          argv: [process.execPath, "--version"],
          cwd: "..",
          timeoutSeconds: 5,
        },
      ],
    );
    await expect(
      runTaskCommandPhase({
        task: unsafe,
        phase: "verifier",
        workingDirectory: worktree,
        evidenceDirectory: evidence,
      }),
    ).rejects.toMatchObject({
      details: { code: "GRADER_COMMAND_CWD_UNSAFE" },
    });
    expect(await readFile(unrelated, "utf8")).toBe("preserve\n");

    const evidenceLink = join(evidence, "inside-worktree");
    await symlink(worktree, evidenceLink);
    await expect(
      runTaskCommandPhase({
        task: task([], []),
        phase: "verifier",
        workingDirectory: worktree,
        evidenceDirectory: evidenceLink,
      }),
    ).rejects.toMatchObject({
      details: { code: "GRADER_EVIDENCE_LOCATION_UNSAFE" },
    });

    const duplicate = await directories();
    await mkdir(join(duplicate.evidence, "verifier", "existing"), {
      recursive: true,
    });
    await expect(
      runTaskCommandPhase({
        task: task(
          [],
          [
            {
              id: "existing",
              kind: "test",
              argv: [process.execPath, "--version"],
              timeoutSeconds: 5,
            },
          ],
        ),
        phase: "verifier",
        workingDirectory: duplicate.worktree,
        evidenceDirectory: duplicate.evidence,
      }),
    ).rejects.toMatchObject({
      details: { code: "GRADER_EVIDENCE_ALREADY_EXISTS" },
    });
  });
});
