import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  SCHEMA_VERSION,
  canonicalHash,
  sha256,
  type RunId,
  type TaskV1,
  type TrialId,
} from "@patchrace/contracts";
import { WorktreeManager } from "@patchrace/core";

import { checkGraderIntegrity } from "./integrity.js";
import { initializeManualSuite } from "./init.js";
import { mineGitHistory } from "./miner.js";
import {
  createOptimizationSplitView,
  createTaskSplit,
  verifyTaskSplit,
} from "./split.js";
import { calculateRepeatedRunStatistics } from "./statistics.js";
import { loadTask, serializeTask, type LoadedTask } from "./task.js";
import { checkTaskValidity } from "./validity.js";

interface ReferenceRecipe {
  readonly id: string;
  readonly ecosystem: "javascript" | "python" | "repository-config";
  readonly category: string;
  readonly visibility: "public" | "hidden";
  readonly expectedValidity: "eligible" | "flaky";
  readonly sourcePath: string;
  readonly baselineContent: string;
  readonly referenceContent: string;
  readonly instruction: string;
}

interface ReferenceManifest {
  readonly schemaVersion: "1.0.0";
  readonly tasks: readonly ReferenceRecipe[];
}

interface MaterializedTask {
  readonly recipe: ReferenceRecipe;
  readonly root: string;
  readonly referenceCommit: string;
  readonly patch: Buffer;
  readonly patchPath: string;
  readonly loaded: LoadedTask;
  readonly manager: WorktreeManager;
  readonly evidence: string;
}

const execute = promisify(execFile);
const temporaryRoots: string[] = [];
const runId = "run_00000000000000000000000000" as RunId;

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

function nextTrialIds(): () => TrialId {
  let index = 0;
  return () => {
    index += 1;
    return `trial_${String(index).padStart(26, "0")}` as TrialId;
  };
}

async function git(root: string, args: readonly string[]): Promise<string> {
  return (await execute("git", [...args], { cwd: root })).stdout;
}

function verifierCommand(
  recipe: ReferenceRecipe,
  counterPath: string,
): TaskV1["verifier"]["commands"][number] {
  if (recipe.expectedValidity === "flaky") {
    const script = [
      "const fs=require('node:fs');",
      `const source=${JSON.stringify(recipe.sourcePath)};`,
      `const expected=${JSON.stringify(recipe.referenceContent)};`,
      "if(fs.readFileSync(source,'utf8')!==expected)process.exit(1);",
      `const counter=${JSON.stringify(counterPath)};`,
      "const n=(fs.existsSync(counter)?Number(fs.readFileSync(counter,'utf8')):0)+1;",
      "fs.writeFileSync(counter,String(n));",
      "process.exit(n===1?0:1);",
    ].join("");
    return {
      id: "verify",
      kind: "test",
      argv: [process.execPath, "-e", script],
      timeoutSeconds: 10,
      network: "forbidden",
    };
  }
  if (recipe.visibility === "hidden") {
    const extension = recipe.ecosystem === "python" ? "py" : "mjs";
    return {
      id: "verify",
      kind: "test",
      argv:
        recipe.ecosystem === "python"
          ? ["python3", `test/__patchrace__/${recipe.id}.${extension}`]
          : [process.execPath, `test/__patchrace__/${recipe.id}.${extension}`],
      timeoutSeconds: 10,
      network: "forbidden",
    };
  }
  if (recipe.ecosystem === "python") {
    const script = `from pathlib import Path\nimport sys\nsys.exit(0 if Path(${JSON.stringify(recipe.sourcePath)}).read_text() == ${JSON.stringify(recipe.referenceContent)} else 1)\n`;
    return {
      id: "verify",
      kind: "test",
      argv: ["python3", "-c", script],
      timeoutSeconds: 10,
      network: "forbidden",
    };
  }
  const script = `const fs=require('node:fs');process.exit(fs.readFileSync(${JSON.stringify(recipe.sourcePath)},'utf8')===${JSON.stringify(recipe.referenceContent)}?0:1);`;
  return {
    id: "verify",
    kind: "test",
    argv: [process.execPath, "-e", script],
    timeoutSeconds: 10,
    network: "forbidden",
  };
}

function hiddenVerifier(recipe: ReferenceRecipe): string {
  if (recipe.ecosystem === "python")
    return `from pathlib import Path\nimport sys\nsys.exit(0 if Path(${JSON.stringify(recipe.sourcePath)}).read_text() == ${JSON.stringify(recipe.referenceContent)} else 1)\n`;
  return `import fs from 'node:fs';process.exit(fs.readFileSync(${JSON.stringify(recipe.sourcePath)},'utf8')===${JSON.stringify(recipe.referenceContent)}?0:1);\n`;
}

async function materialize(recipe: ReferenceRecipe): Promise<MaterializedTask> {
  const outer = await mkdtemp(join(tmpdir(), `patchrace-m5-${recipe.id}-`));
  temporaryRoots.push(outer);
  const root = join(outer, "repository");
  const bundle = join(outer, "task");
  const vault = join(outer, "vault");
  const evidence = join(outer, "evidence");
  await Promise.all([
    mkdir(dirname(join(root, recipe.sourcePath)), { recursive: true }),
    mkdir(join(root, "test"), { recursive: true }),
    mkdir(bundle, { recursive: true }),
    mkdir(vault, { recursive: true }),
    mkdir(evidence, { recursive: true }),
  ]);
  await git(root, ["init", "-q", "-b", "main"]);
  await git(root, ["config", "user.name", "PatchRace Fixture"]);
  await git(root, ["config", "user.email", "fixture@example.invalid"]);
  await writeFile(join(root, ".gitignore"), ".patchrace/\n.reference-init/\n");
  await writeFile(join(root, "README.md"), `fixture ${recipe.id}\n`);
  await writeFile(join(root, recipe.sourcePath), recipe.baselineContent);
  await writeFile(join(root, "test", "reference.test.txt"), "baseline\n");
  await git(root, ["add", "."]);
  await git(root, ["commit", "-qm", `baseline ${recipe.id}`]);
  const baselineCommit = (await git(root, ["rev-parse", "HEAD"])).trim();
  await writeFile(join(root, recipe.sourcePath), recipe.referenceContent);
  await writeFile(join(root, "test", "reference.test.txt"), "reference\n");
  await git(root, ["commit", "-qam", `reference ${recipe.id}`]);
  const referenceCommit = (await git(root, ["rev-parse", "HEAD"])).trim();
  const patch = Buffer.from(
    await git(root, [
      "diff",
      "--binary",
      "--full-index",
      baselineCommit,
      referenceCommit,
      "--",
    ]),
  );
  const patchPath = join(outer, "reference.diff");
  await writeFile(patchPath, patch);
  await writeFile(join(bundle, "instruction.md"), recipe.instruction);
  const counterPath = join(outer, "flake-counter.txt");
  const verifierAssets: TaskV1["verifier"]["assets"][number][] = [];
  if (recipe.visibility === "hidden") {
    const extension = recipe.ecosystem === "python" ? "py" : "mjs";
    const source = `${recipe.id}.${extension}`;
    const content = hiddenVerifier(recipe);
    await writeFile(join(vault, source), content);
    verifierAssets.push({
      source,
      mount: `test/__patchrace__/${source}`,
      hash: sha256(content),
    });
  }
  const task: TaskV1 = {
    schemaVersion: SCHEMA_VERSION,
    id: recipe.id,
    revision: 1,
    baseline: {
      repository: ".",
      commit: baselineCommit,
      submodules: "disabled",
      lfs: "disabled",
    },
    instruction: {
      file: "instruction.md",
      hash: sha256(recipe.instruction),
    },
    setup: { commands: [], assets: [] },
    verifier: {
      visibility: recipe.visibility,
      assets: verifierAssets,
      commands: [verifierCommand(recipe, counterPath)],
    },
    assertions: [
      {
        id: "reference-content",
        kind: "file-content",
        path: recipe.sourcePath,
        encoding: "utf8",
        exact: recipe.referenceContent,
      },
      {
        id: "patch-bound",
        kind: "diff-limit",
        maxChangedFiles: 3,
        maxLines: 20,
        allowDependencyChanges: false,
        allowLockfileChanges: false,
      },
    ],
    budgets: {
      trialSeconds: 60,
      graderSeconds: 20,
      maxTokens: null,
      maxCostUsd: null,
      maxOutputBytes: 1024 * 1024,
      maxPatchLines: 20,
      maxChangedFiles: 3,
    },
    provenance: {
      source: recipe.id === "javascript-add" ? "git-history" : "manual",
      sourceCommit: referenceCommit,
      sourceParent: baselineCommit,
      referencePatchHash: sha256(patch),
      ...(recipe.id === "javascript-add"
        ? { extractionToolVersion: "reference-suite-v1" }
        : {}),
      ...(recipe.visibility === "hidden"
        ? { verifierOrigin: "fixture-external-vault" }
        : {}),
      createdAt: "2026-07-22T00:00:00.000Z",
      reviewedBy: "fixture-review",
    },
    metadata: {
      ecosystem: recipe.ecosystem,
      category: recipe.category,
      expectedValidity: recipe.expectedValidity,
    },
  };
  const taskPath = join(bundle, "task.json");
  await writeFile(taskPath, serializeTask(task));
  const loaded = await loadTask(
    taskPath,
    recipe.visibility === "hidden" ? { verifierRoot: vault } : {},
  );
  const manager = await WorktreeManager.open(root, join(root, ".patchrace"));
  return {
    recipe,
    root,
    referenceCommit,
    patch,
    patchPath,
    loaded,
    manager,
    evidence,
  };
}

async function readManifest(): Promise<ReferenceManifest> {
  const path = fileURLToPath(
    new URL(
      "../../../fixtures/m5/reference-suite/manifest.json",
      import.meta.url,
    ),
  );
  return JSON.parse(await readFile(path, "utf8")) as ReferenceManifest;
}

describe("M5 replay reference suite", () => {
  it("replays ten curated tasks across grading, mining, hidden, split, integrity, flake, and statistics paths", async () => {
    const manifest = await readManifest();
    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(manifest.tasks).toHaveLength(10);
    expect(new Set(manifest.tasks.map((task) => task.id)).size).toBe(10);
    expect(new Set(manifest.tasks.map((task) => task.ecosystem))).toEqual(
      new Set(["javascript", "python", "repository-config"]),
    );
    expect(
      manifest.tasks.filter((task) => task.visibility === "hidden"),
    ).toHaveLength(3);

    const materialized: MaterializedTask[] = [];
    const validityReports: Awaited<ReturnType<typeof checkTaskValidity>>[] = [];
    const nextTrialId = nextTrialIds();
    for (const recipe of manifest.tasks) {
      const task = await materialize(recipe);
      materialized.push(task);
      const report = await checkTaskValidity({
        task: task.loaded,
        referencePatch: task.patch,
        manager: task.manager,
        runId,
        evidenceDirectory: task.evidence,
        repeat: 2,
        nextTrialId,
      });
      validityReports.push(report);
      expect(report.status, recipe.id).toBe(recipe.expectedValidity);
      expect(
        (await task.manager.list()).filter((worktree) =>
          worktree.path.includes("trial_"),
        ),
        recipe.id,
      ).toEqual([]);
      expect(await readFile(join(task.root, "README.md"), "utf8")).toBe(
        `fixture ${recipe.id}\n`,
      );
    }

    const manual = await initializeManualSuite({
      projectRoot: materialized[0]!.root,
      outputPath: ".reference-init/suite.yaml",
      now: () => new Date("2026-07-22T00:00:00.000Z"),
    });
    expect(manual.agentInvoked).toBe(false);
    expect(manual.baselineCommit).toBe(materialized[0]!.referenceCommit);

    const mined = await mineGitHistory({
      repositoryRoot: materialized[0]!.root,
      commit: materialized[0]!.referenceCommit,
    });
    expect(mined).toHaveLength(1);
    expect(mined[0]).toMatchObject({
      eligibility: "eligible",
      review: { required: true, status: "pending" },
    });
    expect(mined[0]!.referencePatchHash).toBe(
      materialized[0]!.loaded.task.provenance.referencePatchHash,
    );

    const split = createTaskSplit({
      seed: "m5-reference-suite-v1",
      tasks: materialized.map((task) => ({
        id: task.recipe.id,
        taskHash: task.loaded.taskHash,
        category: task.recipe.category,
      })),
    });
    verifyTaskSplit(split);
    expect([
      ...split.assignments.training,
      ...split.assignments.validation,
      ...split.assignments.holdout,
    ]).toHaveLength(10);
    const optimizationView = createOptimizationSplitView(split);
    expect(JSON.stringify(optimizationView)).not.toContain(
      split.assignments.holdout[0],
    );

    const hidden = materialized.find(
      (task) => task.recipe.visibility === "hidden",
    )!;
    const agent = await hidden.manager.create({
      runId,
      trialId: nextTrialId(),
      commit: hidden.loaded.task.baseline.commit,
    });
    await execute("git", ["apply", hidden.patchPath], { cwd: agent.path });
    const integrity = await checkGraderIntegrity({
      task: hidden.loaded,
      expectedTaskHash: hidden.loaded.taskHash,
      expectedConfigHash: canonicalHash({ suite: "m5-reference-suite-v1" }),
      actualConfigHash: canonicalHash({ suite: "m5-reference-suite-v1" }),
      manager: hidden.manager,
      agentWorktree: agent,
      isolation: "host-only",
      agentInputs: [
        { surface: "instruction", content: hidden.recipe.instruction },
      ],
    });
    expect(integrity.status).toBe("unknown");
    expect(integrity.findings.map((finding) => finding.code)).toEqual([
      "host-filesystem-not-enforced",
    ]);
    await hidden.manager.cleanup(agent, {
      confirm: true,
      allowDirty: true,
    });

    const eligibleReport = validityReports.find(
      (report) => report.status === "eligible",
    )!;
    const eligibleStatistics = calculateRepeatedRunStatistics({
      taskId: eligibleReport.taskId,
      variantId: "reviewed-reference",
      observations: eligibleReport.attempts
        .filter((attempt) => attempt.kind === "reference")
        .map((attempt, index) => ({
          trialId: `reference-${String(index + 1)}`,
          outcome: attempt.outcome === "passed" ? "passed" : "failed",
          integrity: "valid",
        })),
      independence: "unknown",
    });
    expect(eligibleStatistics.successRate).toBe(1);
    const flakyReport = validityReports.find(
      (report) => report.status === "flaky",
    )!;
    const flakyStatistics = calculateRepeatedRunStatistics({
      taskId: flakyReport.taskId,
      variantId: "reviewed-reference",
      observations: flakyReport.attempts
        .filter((attempt) => attempt.kind === "reference")
        .map((attempt, index) => ({
          trialId: `reference-${String(index + 1)}`,
          outcome: attempt.outcome === "passed" ? "passed" : "failed",
          integrity: "valid",
          ...(attempt.outcome === "passed"
            ? {}
            : { failureCategory: "deliberate-fixture-flake" }),
        })),
    });
    expect(flakyStatistics.successRate).toBe(0.5);

    const summary = {
      schemaVersion: SCHEMA_VERSION,
      inventoryHash: canonicalHash(manifest),
      taskCount: materialized.length,
      ecosystems: [
        ...new Set(materialized.map((task) => task.recipe.ecosystem)),
      ].sort(),
      hiddenTaskCount: materialized.filter(
        (task) => task.recipe.visibility === "hidden",
      ).length,
      eligibleTaskCount: validityReports.filter(
        (report) => report.status === "eligible",
      ).length,
      flakyTaskCount: validityReports.filter(
        (report) => report.status === "flaky",
      ).length,
      splitHash: split.manifestHash,
      miningCandidateHash: canonicalHash({
        commit: mined[0]!.commit,
        referencePatchHash: mined[0]!.referencePatchHash,
        files: mined[0]!.files,
        eligibility: mined[0]!.eligibility,
      }),
      integrityHash: integrity.resultHash,
      statisticsHashes: [
        eligibleStatistics.reportHash,
        flakyStatistics.reportHash,
      ],
    };
    expect(summary).toMatchObject({
      taskCount: 10,
      ecosystems: ["javascript", "python", "repository-config"],
      hiddenTaskCount: 3,
      eligibleTaskCount: 9,
      flakyTaskCount: 1,
    });
    expect(canonicalHash(summary)).toMatch(/^sha256:[a-f0-9]{64}$/);
  }, 120_000);
});
