import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  assertTrialId,
  sha256,
  type RunId,
  type TaskCommandV1,
  type TaskV1,
  type TrialId,
} from "@patchrace/contracts";
import { WorktreeManager } from "@patchrace/core";

import { loadTask, serializeTask } from "./task.js";
import { checkTaskValidity } from "./validity.js";

const execute = promisify(execFile);
const roots: string[] = [];
const runId = "run_00000000000000000000000000" as RunId;
const validityHarnessTimeoutMs = 20_000;

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function trialIds(): () => TrialId {
  let index = 0;
  return () => {
    index += 1;
    const value = `trial_${index.toString(32).toUpperCase().padStart(26, "0")}`;
    assertTrialId(value);
    return value;
  };
}

async function fixture(options: {
  readonly verifier: TaskCommandV1;
  readonly setup?: TaskCommandV1;
}): Promise<{
  readonly root: string;
  readonly loaded: Awaited<ReturnType<typeof loadTask>>;
  readonly patch: Buffer;
  readonly manager: WorktreeManager;
  readonly evidence: string;
  readonly instructionPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-validity-repo-"));
  const bundle = await mkdtemp(join(tmpdir(), "patchrace-validity-task-"));
  const evidence = await mkdtemp(
    join(tmpdir(), "patchrace-validity-evidence-"),
  );
  roots.push(root, bundle, evidence);
  await execute("git", ["init", "-q", "-b", "main"], { cwd: root });
  await execute("git", ["config", "user.name", "PatchRace Fixture"], {
    cwd: root,
  });
  await execute("git", ["config", "user.email", "fixture@example.invalid"], {
    cwd: root,
  });
  await mkdir(join(root, "src"));
  await writeFile(join(root, ".gitignore"), ".patchrace/\n");
  await writeFile(join(root, "README.md"), "preserve\n");
  await writeFile(join(root, "src", "value.mjs"), "export const value = 1;\n");
  await execute("git", ["add", "."], { cwd: root });
  await execute("git", ["commit", "-qm", "baseline"], { cwd: root });
  const baseline = (
    await execute("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();
  await writeFile(join(root, "src", "value.mjs"), "export const value = 2;\n");
  await execute("git", ["commit", "-qam", "reference"], { cwd: root });
  const reference = (
    await execute("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();
  const patch = Buffer.from(
    (
      await execute("git", ["diff", "--binary", baseline, reference, "--"], {
        cwd: root,
      })
    ).stdout,
  );

  const instructionPath = join(bundle, "instruction.md");
  await writeFile(instructionPath, "Change value from one to two.\n");
  const task: TaskV1 = {
    schemaVersion: SCHEMA_VERSION,
    id: "value-two",
    revision: 1,
    baseline: {
      repository: ".",
      commit: baseline,
      submodules: "disabled",
      lfs: "disabled",
    },
    instruction: {
      file: "instruction.md",
      hash: sha256("Change value from one to two.\n"),
    },
    setup: {
      commands: options.setup === undefined ? [] : [options.setup],
      assets: [],
    },
    verifier: {
      visibility: "public",
      assets: [],
      commands: [options.verifier],
    },
    assertions: [],
    budgets: {
      trialSeconds: 60,
      maxTokens: null,
      maxCostUsd: null,
      maxPatchLines: 100,
      maxOutputBytes: 1024 * 1024,
    },
    provenance: {
      source: "git-history",
      sourceCommit: reference,
      sourceParent: baseline,
      referencePatchHash: sha256(patch),
      createdAt: "2026-07-22T00:00:00.000Z",
      reviewedBy: "user",
    },
    metadata: {},
  };
  const taskPath = join(bundle, "task.json");
  await writeFile(taskPath, serializeTask(task));
  const loaded = await loadTask(taskPath);
  const manager = await WorktreeManager.open(root, join(root, ".patchrace"));
  return { root, loaded, patch, manager, evidence, instructionPath };
}

function valueVerifier(expected: number): TaskCommandV1 {
  return {
    id: "verify",
    kind: "test",
    argv: [
      process.execPath,
      "-e",
      `import('./src/value.mjs').then(({value}) => process.exit(value === ${String(expected)} ? 0 : 1))`,
    ],
    timeoutSeconds: 5,
  };
}

describe("checkTaskValidity", () => {
  it(
    "accepts a stable task whose baseline fails and reference passes",
    async () => {
      const value = await fixture({ verifier: valueVerifier(2) });
      const report = await checkTaskValidity({
        task: value.loaded,
        referencePatch: value.patch,
        manager: value.manager,
        runId,
        evidenceDirectory: value.evidence,
        repeat: 2,
        nextTrialId: trialIds(),
      });

      expect(report).toMatchObject({
        status: "eligible",
        findings: [],
        attempts: [
          { kind: "baseline", outcome: "failed" },
          { kind: "reference", outcome: "passed" },
          { kind: "baseline", outcome: "failed" },
          { kind: "reference", outcome: "passed" },
        ],
      });
      expect(report.reportHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(
        (await value.manager.list()).filter((item) =>
          item.path.includes("trial_"),
        ).length,
      ).toBe(0);
      expect(await readFile(join(value.root, "README.md"), "utf8")).toBe(
        "preserve\n",
      );
    },
    validityHarnessTimeoutMs,
  );

  it(
    "flags an already-solved baseline and an impossible verifier",
    async () => {
      const leaked = await fixture({ verifier: valueVerifier(1) });
      const leakedReport = await checkTaskValidity({
        task: leaked.loaded,
        referencePatch: leaked.patch,
        manager: leaked.manager,
        runId,
        evidenceDirectory: leaked.evidence,
        nextTrialId: trialIds(),
      });
      expect(leakedReport.status).toBe("invalid");
      expect(leakedReport.findings.map((finding) => finding.code)).toContain(
        "baseline-already-passes",
      );

      const impossible = await fixture({
        verifier: {
          id: "verify",
          kind: "test",
          argv: [process.execPath, "-e", "process.exit(1)"],
          timeoutSeconds: 5,
        },
      });
      const impossibleReport = await checkTaskValidity({
        task: impossible.loaded,
        referencePatch: impossible.patch,
        manager: impossible.manager,
        runId,
        evidenceDirectory: impossible.evidence,
        nextTrialId: trialIds(),
      });
      expect(impossibleReport.status).toBe("invalid");
      expect(
        impossibleReport.findings.map((finding) => finding.code),
      ).toContain("reference-never-passes");
    },
    validityHarnessTimeoutMs,
  );

  it(
    "flags alternating verifier outcomes as flaky and stable setup failure as invalid",
    async () => {
      const counterRoot = await mkdtemp(
        join(tmpdir(), "patchrace-validity-counter-"),
      );
      roots.push(counterRoot);
      const counter = join(counterRoot, "counter.txt");
      const flaky = await fixture({
        verifier: {
          id: "verify",
          kind: "test",
          argv: [
            process.execPath,
            "-e",
            `const fs=require('node:fs'); const p=${JSON.stringify(counter)}; const n=(fs.existsSync(p)?Number(fs.readFileSync(p,'utf8')):0)+1; fs.writeFileSync(p,String(n)); process.exit(n%4===2||n%4===3?0:1)`,
          ],
          timeoutSeconds: 5,
        },
      });
      const flakyReport = await checkTaskValidity({
        task: flaky.loaded,
        referencePatch: flaky.patch,
        manager: flaky.manager,
        runId,
        evidenceDirectory: flaky.evidence,
        nextTrialId: trialIds(),
      });
      expect(flakyReport.status).toBe("flaky");
      expect(flakyReport.findings.map((finding) => finding.code)).toEqual(
        expect.arrayContaining([
          "nondeterministic-baseline-verifier",
          "nondeterministic-reference-verifier",
        ]),
      );

      const setupFailure = await fixture({
        setup: {
          id: "setup",
          kind: "setup",
          argv: [process.execPath, "-e", "process.exit(1)"],
          timeoutSeconds: 5,
        },
        verifier: valueVerifier(2),
      });
      const failureReport = await checkTaskValidity({
        task: setupFailure.loaded,
        referencePatch: setupFailure.patch,
        manager: setupFailure.manager,
        runId,
        evidenceDirectory: setupFailure.evidence,
        nextTrialId: trialIds(),
      });
      expect(failureReport.status).toBe("invalid");
      expect(failureReport.findings.map((finding) => finding.code)).toContain(
        "environment-dependent-setup",
      );
    },
    validityHarnessTimeoutMs,
  );
});
