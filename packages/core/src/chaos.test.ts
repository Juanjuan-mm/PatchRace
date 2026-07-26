import { execFile, spawn } from "node:child_process";
import {
  access,
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalHash, type RunId, type TrialId } from "@patchrace/contracts";

import { ArtifactStore } from "./artifacts.js";
import { BudgetTracker } from "./budgets.js";
import { executeCleanup, planCacheCleanup } from "./cleanup.js";
import { runProcess } from "./process.js";
import { recoverRun, RunCoordinator } from "./recovery.js";
import { runScheduledJobs } from "./scheduler.js";
import { WorktreeManager } from "./worktrees.js";

const execute = promisify(execFile);
const roots: string[] = [];
const children = new Set<ReturnType<typeof spawn>>();

afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
  children.clear();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function repository(): Promise<{ root: string; commit: string }> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-chaos-repository-"));
  roots.push(root);
  await execute("git", ["init", "-q", root]);
  await execute("git", ["-C", root, "config", "core.autocrlf", "false"]);
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
  return {
    root,
    commit: (
      await execute("git", ["-C", root, "rev-parse", "HEAD"])
    ).stdout.trim(),
  };
}

async function artifactStore(options: {
  readonly parent: string;
  readonly trials?: readonly TrialId[];
}): Promise<ArtifactStore> {
  return ArtifactStore.create({
    stateRoot: join(options.parent, ".patchrace"),
    now: () => new Date(0),
    random: (size) => new Uint8Array(size),
    manifest: {
      runId: "run_00000000000000000000000000" as RunId,
      schemaVersion: "1.0.0",
      createdAt: new Date(0).toISOString(),
      planHash: canonicalHash({}),
      source: {},
      controller: {},
      budgets: {},
      trials: (options.trials ?? []).map((trialId) => ({ trialId })),
      artifactIndexVersion: "1.0.0",
    },
  });
}

describe("worktree and process chaos matrix", () => {
  it("isolates a dirty primary repository and retains a conflicting worktree branch", async () => {
    const fixture = await repository();
    await writeFile(join(fixture.root, "message.txt"), "primary dirty\n");
    await writeFile(join(fixture.root, "user-untracked.txt"), "preserve\n");
    const manager = await WorktreeManager.open(
      fixture.root,
      join(fixture.root, ".patchrace"),
    );
    const record = await manager.create({
      runId: "run_00000000000000000000000000" as RunId,
      trialId: "trial_00000000000000000000000000" as TrialId,
      commit: fixture.commit,
    });

    expect(await readFile(join(record.path, "message.txt"), "utf8")).toBe(
      "baseline\n",
    );
    await expect(
      access(join(record.path, "user-untracked.txt")),
    ).rejects.toThrow();
    await writeFile(join(record.path, "message.txt"), "branch commit\n");
    await execute("git", ["-C", record.path, "add", "message.txt"]);
    await execute("git", [
      "-C",
      record.path,
      "-c",
      "user.name=PatchRace",
      "-c",
      "user.email=fixture@patchrace.invalid",
      "commit",
      "-qm",
      "conflicting trial branch",
    ]);

    await expect(
      manager.cleanup(record, { confirm: true, allowDirty: true }),
    ).rejects.toMatchObject({
      details: { code: "WORKTREE_OWNERSHIP_CONFLICT" },
    });
    await expect(access(record.path)).resolves.toBeUndefined();
    expect(await readFile(join(fixture.root, "message.txt"), "utf8")).toBe(
      "primary dirty\n",
    );
    expect(
      await readFile(join(fixture.root, "user-untracked.txt"), "utf8"),
    ).toBe("preserve\n");
  });

  it("kills only the timed-out process group, drains partial output, and leaves an unrelated process alive", async () => {
    const directory = await mkdtemp(join(tmpdir(), "patchrace-chaos-process-"));
    roots.push(directory);
    const unrelated = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { stdio: "ignore" },
    );
    children.add(unrelated);
    const escapedPath = join(directory, "escaped.txt");
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const descendantScript =
      `const fs=require('node:fs');` +
      `process.on('SIGTERM',()=>{});` +
      `setTimeout(()=>fs.writeFileSync(${JSON.stringify(escapedPath)},'escaped'),1500);` +
      `setInterval(()=>{},1000)`;
    const script = [
      "const {spawn}=require('node:child_process');",
      "process.on('SIGTERM',()=>{});",
      `spawn(process.execPath,${JSON.stringify(["-e", descendantScript])},{stdio:'ignore'});`,
      "process.stdout.write('partial-before-timeout');",
      "setInterval(()=>{},1000);",
    ].join("");

    const result = await runProcess({
      executable: process.execPath,
      args: ["-e", script],
      cwd: directory,
      // Leave enough time for a loaded CI host to start Node and flush the
      // observable prefix while still terminating well before the descendant
      // can perform its delayed write.
      timeoutMs: 500,
      terminationGraceMs: 40,
      onStdout: (chunk) => {
        stdout.push(Buffer.from(chunk));
      },
      onStderr: (chunk) => {
        stderr.push(Buffer.from(chunk));
      },
    });

    expect(result, Buffer.concat(stderr).toString()).toMatchObject({
      status: "budget_exhausted",
      terminationReason: "timeout",
    });
    expect(Buffer.concat(stdout).toString()).toBe("partial-before-timeout");
    expect(() => process.kill(unrelated.pid!, 0)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 1600));
    await expect(access(escapedPath)).rejects.toThrow();
  });

  it("retains stdout and stderr emitted before an agent crash", async () => {
    const directory = await mkdtemp(join(tmpdir(), "patchrace-chaos-crash-"));
    roots.push(directory);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    const result = await runProcess({
      executable: process.execPath,
      args: [
        "-e",
        "process.stdout.write('before-crash');process.stderr.write('crash-detail');process.exit(23)",
      ],
      cwd: directory,
      onStdout: (chunk) => {
        stdout.push(Buffer.from(chunk));
      },
      onStderr: (chunk) => {
        stderr.push(Buffer.from(chunk));
      },
    });

    expect(result).toMatchObject({
      status: "failed",
      exitCode: 23,
      terminationReason: "exit",
    });
    expect(Buffer.concat(stdout).toString()).toBe("before-crash");
    expect(Buffer.concat(stderr).toString()).toBe("crash-detail");
  });

  it("refuses a stale lease without deleting or replacing recovery evidence", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-chaos-lease-"));
    roots.push(parent);
    const store = await artifactStore({ parent });
    const leasePath = join(store.runRoot, "lease");
    const staleLease =
      '{"nonce":"stale","pid":999999,"schemaVersion":"1.0.0"}\n';
    await writeFile(leasePath, staleLease);

    await expect(recoverRun(store.runRoot)).rejects.toMatchObject({
      details: { code: "RUN_LEASE_CONFLICT" },
    });
    expect(await readFile(leasePath, "utf8")).toBe(staleLease);
    await expect(
      access(join(store.runRoot, "manifest.json")),
    ).resolves.toBeUndefined();
  });

  it("stops admitting work after disk-budget pressure and preserves unrelated state", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-chaos-disk-"));
    roots.push(parent);
    await writeFile(join(parent, "user.txt"), "preserve\n");
    const started: string[] = [];
    const budgets = new BudgetTracker(
      {
        wallMs: null,
        maxTrials: null,
        maxTokens: null,
        maxCostUsd: null,
        maxDiskBytes: 10,
      },
      () => 0,
    );

    const results = await runScheduledJobs(
      [
        {
          id: "fills-disk-budget",
          run: async ({ reportUsage }) => {
            started.push("fills-disk-budget");
            reportUsage({ diskBytes: 10 });
          },
        },
        {
          id: "must-not-start",
          run: async () => {
            started.push("must-not-start");
          },
        },
      ],
      { concurrency: 1, budgets },
    );

    expect(results.map(({ status }) => status)).toEqual([
      "budget_exhausted",
      "budget_exhausted",
    ]);
    expect(started).toEqual(["fills-disk-budget"]);
    expect(await readFile(join(parent, "user.txt"), "utf8")).toBe("preserve\n");
  });

  it("truncates only a partial tail but blocks resume on a finalized hash mismatch", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-chaos-artifact-"));
    roots.push(parent);
    const trialId = "trial_00000000000000000000000000" as TrialId;
    const store = await artifactStore({ parent, trials: [trialId] });
    const coordinator = new RunCoordinator(store, [trialId], () => new Date(0));
    await coordinator.initialize();
    await coordinator.transitionTrial(trialId, "running");
    await store.finalizeBytes(
      "trials/evidence.txt",
      Buffer.from("original evidence\n"),
      {
        mediaType: "text/plain",
        sensitivity: "local",
        producer: "qa-03",
      },
    );
    await store.finalizeIndex();
    await writeFile(
      join(store.runRoot, "trials", "evidence.txt"),
      "tampered\n",
    );
    await appendFile(join(store.runRoot, "events.jsonl"), '{"partial":');

    const recovered = await recoverRun(store.runRoot, () => new Date(1));

    expect(recovered).toMatchObject({
      needsInspection: true,
      resumableTrials: [],
    });
    expect(recovered.truncatedBytes).toBeGreaterThan(0);
    expect(recovered.reasons).toContain("hash mismatch: trials/evidence.txt");
    expect(
      await readFile(join(store.runRoot, "trials", "evidence.txt"), "utf8"),
    ).toBe("tampered\n");
    expect(
      await readFile(join(store.runRoot, "events.jsonl"), "utf8"),
    ).not.toContain('{"partial":');
  });

  it("rejects a symlink-swapped cleanup target without touching its destination", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-chaos-cleanup-"));
    roots.push(parent);
    const stateRoot = join(parent, ".patchrace");
    const target = join(stateRoot, "cache", "owned-key");
    const retained = join(stateRoot, "cache", "owned-key-retained");
    const outside = join(parent, "user-data");
    await mkdir(target, { recursive: true });
    await mkdir(outside);
    await writeFile(
      join(target, ".patchrace-cache-owner.json"),
      JSON.stringify({
        schemaVersion: "1.0.0",
        kind: "patchrace-cache-entry",
        cacheKey: "owned-key",
      }),
    );
    await writeFile(join(outside, "user.txt"), "preserve\n");
    await utimes(target, new Date(0), new Date(0));
    const plan = await planCacheCleanup({
      stateRoot,
      olderThanMs: 1,
      now: () => 10,
    });
    await rename(target, retained);
    await symlink(outside, target, "dir");

    await expect(executeCleanup(plan, { confirm: true })).rejects.toMatchObject(
      {
        details: { code: "PATH_CANONICAL_ESCAPE_REFUSED" },
      },
    );
    expect(await readFile(join(outside, "user.txt"), "utf8")).toBe(
      "preserve\n",
    );
    await expect(
      access(join(retained, ".patchrace-cache-owner.json")),
    ).resolves.toBeUndefined();
  });
});
