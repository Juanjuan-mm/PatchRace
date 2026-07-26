import { execFile } from "node:child_process";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { sha256, type TaskV1, type TrialId } from "@patchrace/contracts";
import {
  ArtifactStore,
  loadSuiteConfig,
  RunCoordinator,
  type RunManifest,
} from "@patchrace/core";

import { createCli } from "./index.js";

const exec = promisify(execFile);

describe("comparison CLI service", () => {
  it("uses only explicitly configured runtime redaction values and fails closed when one is unavailable", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-cli-redaction-"));
    const state = join(root, ".patchrace");
    await mkdir(state, { recursive: true });
    const configPath = join(state, "suite.json");
    const environmentName = "PATCHRACE_QA07_REDACTION_FIXTURE";
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: "1.0.0",
        project: { root: "..", trustRepositoryCommands: false },
        state: { directory: ".patchrace" },
        defaults: {
          environment: { redact: [environmentName] },
        },
        adapters: { pi: { kind: "pi", executable: "pi" } },
        variants: { baseline: { adapter: "pi" } },
        suites: { fixture: { tasks: ["fixture"], split: "validation" } },
        tasks: { fixture: { file: "task.json" } },
        report: {
          formats: ["json", "html"],
          includeRawCode: "local-only",
          redactionProfile: "default",
        },
      }),
    );
    const loaded = await loadSuiteConfig(configPath);
    const store = await ArtifactStore.create({
      stateRoot: state,
      manifest: {
        schemaVersion: "1.0.0",
        createdAt: "2026-07-23T00:00:00.000Z",
        planHash: sha256("plan"),
        source: { configHash: loaded.configHash },
        controller: {},
        budgets: {},
        trials: [],
        artifactIndexVersion: "1.0.0",
      },
    });
    const secret = 'environment & secret\n"value"';
    for (const [logicalPath, content] of [
      [
        "report/shareable/report.json",
        `${JSON.stringify({ prompt: secret })}\n`,
      ],
      [
        "report/shareable/index.html",
        `<p>environment &amp; secret\n&quot;value&quot;</p>`,
      ],
      ["report/shareable/junit.xml", `<system-out>${secret}</system-out>`],
      [
        "report/shareable/results.sarif",
        `${JSON.stringify({ message: secret })}\n`,
      ],
    ] as const)
      await store.finalizeBytes(logicalPath, Buffer.from(content), {
        mediaType: "text/plain",
        sensitivity: "local",
        producer: "test/privacy",
      });
    await store.finalizeIndex();

    const previous = process.env[environmentName];
    process.env[environmentName] = secret;
    try {
      const shared = join(root, "shared");
      const previewOutput: string[] = [];
      await createCli({
        io: {
          stdout: (text) => previewOutput.push(text),
          stderr: () => undefined,
        },
      }).parseAsync([
        "node",
        "patchrace",
        "--project",
        root,
        "--config",
        ".patchrace/suite.json",
        "--json",
        "report",
        store.runId,
        "--redacted",
        "--preview",
        "--output",
        shared,
      ]);
      const previewText = previewOutput.join("");
      expect(previewText).not.toContain(secret);
      expect(previewText).toContain("configured-value");

      const exportOutput: string[] = [];
      await createCli({
        io: {
          stdout: (text) => exportOutput.push(text),
          stderr: () => undefined,
        },
      }).parseAsync([
        "node",
        "patchrace",
        "--project",
        root,
        "--config",
        ".patchrace/suite.json",
        "--json",
        "report",
        store.runId,
        "--redacted",
        "--confirm-export",
        "--output",
        shared,
      ]);
      expect(exportOutput.join("")).not.toContain(secret);
      expect(
        await readFile(
          join(shared, "report", "shareable", "report.json"),
          "utf8",
        ),
      ).toContain("[REDACTED:environment-1]");
      expect(
        await readFile(
          join(store.runRoot, "report", "shareable", "report.json"),
          "utf8",
        ),
      ).toContain(secret.replace("\n", "\\n").replaceAll('"', '\\"'));

      delete process.env[environmentName];
      await expect(
        createCli({
          io: { stdout: () => undefined, stderr: () => undefined },
        }).parseAsync([
          "node",
          "patchrace",
          "--project",
          root,
          "--config",
          ".patchrace/suite.json",
          "--json",
          "report",
          store.runId,
          "--redacted",
          "--preview",
          "--output",
          join(root, "missing-value"),
        ]),
      ).rejects.toMatchObject({
        details: { code: "REPORT_REDACTION_VALUE_UNAVAILABLE" },
      });
    } finally {
      if (previous === undefined) delete process.env[environmentName];
      else process.env[environmentName] = previous;
    }
  });

  it("runs a configured local race through adapter, grader, artifacts, terminal separation, and report regeneration", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-cli-race-"));
    await exec("git", ["init", "-q", "-b", "main"], { cwd: root });
    await exec("git", ["config", "core.autocrlf", "false"], { cwd: root });
    await exec("git", ["config", "user.name", "PatchRace Fixture"], {
      cwd: root,
    });
    await exec("git", ["config", "user.email", "fixture@example.invalid"], {
      cwd: root,
    });
    const fakeAgent = join(root, "fake-pi.mjs");
    await writeFile(
      fakeAgent,
      `#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
if (process.argv.includes("--version")) process.stdout.write("0.81.1\\n");
else {
  await writeFile("target.txt", "changed\\n");
  process.stdout.write(JSON.stringify({ type: "agent_end", message: "done" }) + "\\n");
}
`,
    );
    await chmod(fakeAgent, 0o755);
    await writeFile(join(root, ".gitignore"), ".patchrace/\n");
    await writeFile(join(root, "target.txt"), "original\n");
    await writeFile(
      join(root, "verifier.mjs"),
      `import { readFile } from "node:fs/promises";
if (await readFile("target.txt", "utf8") !== "changed\\n") process.exit(1);
`,
    );
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-qm", "baseline"], { cwd: root });
    const commit = (
      await exec("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim();
    const state = join(root, ".patchrace");
    const taskRoot = join(state, "tasks");
    await mkdir(taskRoot, { recursive: true });
    const instruction = "Change target.txt to the requested value.\n";
    await writeFile(join(taskRoot, "instruction.md"), instruction);
    const task: TaskV1 = {
      schemaVersion: "1.0.0",
      id: "local-task",
      revision: 1,
      baseline: {
        repository: ".",
        commit,
        submodules: "disabled",
        lfs: "disabled",
      },
      instruction: { file: "instruction.md", hash: sha256(instruction) },
      setup: { commands: [], assets: [] },
      verifier: {
        visibility: "public",
        assets: [],
        commands: [
          {
            id: "tests",
            kind: "test",
            argv: ["node", "verifier.mjs"],
            timeoutSeconds: 10,
            expectedExitCodes: [0],
            network: "forbidden",
          },
        ],
      },
      assertions: [
        { id: "tests", kind: "command", commandId: "tests" },
        {
          id: "content",
          kind: "file-content",
          path: "target.txt",
          encoding: "utf8",
          exact: "changed\n",
        },
      ],
      budgets: {
        trialSeconds: 30,
        maxTokens: null,
        maxCostUsd: null,
        maxPatchLines: 20,
        maxChangedFiles: 2,
      },
      provenance: {
        source: "manual",
        sourceCommit: commit,
        referencePatchHash: sha256(""),
        createdAt: "2026-07-23T00:00:00.000Z",
        reviewedBy: "fixture",
      },
      metadata: {
        ecosystem: "javascript",
        category: "fixture",
        split: "validation",
      },
    };
    await writeFile(join(taskRoot, "task.json"), JSON.stringify(task));
    await writeFile(
      join(state, "suite.json"),
      JSON.stringify({
        schemaVersion: "1.0.0",
        project: { root: "..", trustRepositoryCommands: true },
        state: { directory: ".patchrace" },
        defaults: {
          concurrency: 1,
          repeat: 1,
          budgets: {
            wallSeconds: 60,
            trialSeconds: 30,
            maxTrials: 3,
            maxTokens: null,
            maxCostUsd: null,
            diskMiB: 64,
          },
        },
        adapters: {
          pi: {
            kind: "pi",
            executable: process.execPath,
            args: [fakeAgent],
          },
        },
        variants: {
          "pi-local": { adapter: "pi", model: null, harness: {}, workflow: {} },
          "pi-second": {
            adapter: "pi",
            model: null,
            harness: {},
            workflow: { instruction: "same" },
          },
        },
        suites: { validation: { tasks: ["local-task"], split: "validation" } },
        tasks: { "local-task": { file: "tasks/task.json" } },
        objectives: {
          policy: "correctness-first-v1",
          afterHardGates: ["stability", "latency", "footprint"],
        },
        report: {
          formats: ["json", "html"],
          includeRawCode: "local-only",
          redactionProfile: "default",
        },
      }),
    );
    const stdout: string[] = [];
    const stderr: string[] = [];
    await createCli({
      io: {
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
      },
    }).parseAsync([
      "node",
      "patchrace",
      "--project",
      root,
      "--config",
      ".patchrace/suite.json",
      "--json",
      "race",
      "--suite",
      "validation",
      "--variants",
      "pi-local,pi-second",
    ]);
    const raced = JSON.parse(stdout.join("")) as {
      status: string;
      data: {
        runId: string;
        report: { trials: { outcome: string; trialId: string }[] };
      };
    };
    expect(raced.status).toBe("completed");
    expect(raced.data.report.trials).toHaveLength(2);
    expect(raced.data.report.trials[0]?.outcome).toBe("passed");
    expect(stderr).toEqual([]);
    const storedHtml = await readFile(
      join(state, "runs", raced.data.runId, "report", "index.html"),
      "utf8",
    );
    expect(storedHtml).toContain("Correctness-first ranking");
    expect(storedHtml).toContain(
      `href="../trials/${raced.data.report.trials[0]?.trialId}/grade.json"`,
    );
    const trialId = raced.data.report.trials[0]!.trialId;
    const trialRoot = join(state, "runs", raced.data.runId, "trials", trialId);
    const invocationText = await readFile(
      join(trialRoot, "invocation.json"),
      "utf8",
    );
    const invocation = JSON.parse(invocationText) as {
      args: string[];
      authState: string;
      executableArgumentHashes: string[];
      executablePathHash: string;
      environmentNames: string[];
      version: string | null;
    };
    expect(invocation).toMatchObject({
      authState: "unknown",
      environmentNames: ["PI_TELEMETRY"],
      version: "0.81.1",
    });
    expect(invocation.executablePathHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(invocation.executableArgumentHashes).toEqual([
      expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    ]);
    expect(
      invocation.args.some((argument) => argument.includes(instruction)),
    ).toBe(false);
    expect(
      invocation.args.some((argument) => argument.startsWith("[PROMPT:")),
    ).toBe(true);
    expect(invocationText).not.toContain(fakeAgent);
    expect(
      JSON.parse(await readFile(join(trialRoot, "grade.json"), "utf8")),
    ).toMatchObject({
      setup: { status: "passed" },
      verifier: { status: "passed" },
      assertions: { status: "passed" },
    });
    const artifactIndex = JSON.parse(
      await readFile(
        join(state, "runs", raced.data.runId, "artifact-index.json"),
        "utf8",
      ),
    ) as { artifacts: { logicalPath: string }[] };
    const indexedPaths = artifactIndex.artifacts.map(
      (artifact) => artifact.logicalPath,
    );
    expect(indexedPaths).toEqual(
      expect.arrayContaining([
        `trials/${trialId}/invocation.json`,
        `trials/${trialId}/raw/records.jsonl`,
        `trials/${trialId}/raw/stdout.log`,
        `trials/${trialId}/trace.jsonl`,
      ]),
    );
    const reportOut: string[] = [];
    await createCli({
      io: { stdout: (text) => reportOut.push(text), stderr: () => undefined },
    }).parseAsync([
      "node",
      "patchrace",
      "--project",
      root,
      "--config",
      ".patchrace/suite.json",
      "--json",
      "report",
      raced.data.runId,
      "--format",
      "junit",
    ]);
    expect(
      (JSON.parse(reportOut.join("")) as { data: { content: string } }).data
        .content,
    ).toContain("<testsuites");
    const diagnosisOut: string[] = [];
    await createCli({
      io: {
        stdout: (text) => diagnosisOut.push(text),
        stderr: () => undefined,
      },
    }).parseAsync([
      "node",
      "patchrace",
      "--project",
      root,
      "--json",
      "diagnose",
      raced.data.runId,
      "--focus",
      "pi-local",
      "--format",
      "json",
    ]);
    expect(JSON.parse(diagnosisOut.join(""))).toMatchObject({
      status: "completed",
      sideEffects: [],
      data: {
        report: {
          overview: { focusVariantId: "pi-local", caseCount: 1 },
          cases: [
            {
              variantId: "pi-local",
              findings: [],
              classification: {
                classification: "insufficient-evidence",
                recommendation: "no-configuration-mutation",
              },
            },
          ],
        },
      },
    });
    await expect(
      createCli({
        io: { stdout: () => undefined, stderr: () => undefined },
      }).parseAsync([
        "node",
        "patchrace",
        "--project",
        root,
        "--json",
        "diagnose",
        raced.data.runId,
        "--reflect",
      ]),
    ).rejects.toMatchObject({
      details: { code: "DIAGNOSIS_REFLECTION_PROVIDER_NOT_CONFIGURED" },
    });
    const shared = join(root, "shared-report");
    const previewOut: string[] = [];
    await createCli({
      io: {
        stdout: (text) => previewOut.push(text),
        stderr: () => undefined,
      },
    }).parseAsync([
      "node",
      "patchrace",
      "--project",
      root,
      "--config",
      ".patchrace/suite.json",
      "--json",
      "report",
      raced.data.runId,
      "--redacted",
      "--preview",
      "--output",
      shared,
    ]);
    expect(JSON.parse(previewOut.join(""))).toMatchObject({
      status: "dry-run",
      sideEffects: [],
    });
    await expect(access(shared)).rejects.toBeDefined();
    const exportOut: string[] = [];
    await createCli({
      io: {
        stdout: (text) => exportOut.push(text),
        stderr: () => undefined,
      },
    }).parseAsync([
      "node",
      "patchrace",
      "--project",
      root,
      "--config",
      ".patchrace/suite.json",
      "--json",
      "report",
      raced.data.runId,
      "--redacted",
      "--confirm-export",
      "--output",
      shared,
    ]);
    expect(JSON.parse(exportOut.join(""))).toMatchObject({
      status: "completed",
      sideEffects: [shared],
    });
    expect(
      await readFile(join(shared, "export-manifest.json"), "utf8"),
    ).toContain("residualWarning");
    const sharedReport = JSON.parse(
      await readFile(
        join(shared, "report", "shareable", "report.json"),
        "utf8",
      ),
    ) as {
      patches: unknown[];
      timelines: unknown[];
      trials: {
        hardGates: { evidence: string[] }[];
        artifacts: Record<string, string | null>;
      }[];
    };
    expect(sharedReport).toMatchObject({
      patches: [],
      timelines: [],
    });
    expect(sharedReport.trials).toHaveLength(2);
    for (const trial of sharedReport.trials) {
      expect(trial.hardGates.every((gate) => gate.evidence.length === 0)).toBe(
        true,
      );
      expect(trial.artifacts).toEqual({
        patch: null,
        grade: null,
        trace: null,
        result: null,
      });
    }
    const completedRunRoot = join(state, "runs", raced.data.runId);
    const frozenPlan = JSON.parse(
      await readFile(join(completedRunRoot, "plan.json"), "utf8"),
    ) as {
      trials: { trialId: TrialId }[];
    };
    const completedManifest = JSON.parse(
      await readFile(join(completedRunRoot, "manifest.json"), "utf8"),
    ) as RunManifest;
    const { runId: completedRunId, ...manifestWithoutRunId } =
      completedManifest;
    expect(completedRunId).toBe(raced.data.runId);
    const interruptedStore = await ArtifactStore.create({
      stateRoot: state,
      manifest: manifestWithoutRunId,
    });
    await interruptedStore.finalizeJson("plan.json", frozenPlan, {
      sensitivity: "local",
      producer: "test/interrupted-plan",
    });
    const interruptedCoordinator = new RunCoordinator(
      interruptedStore,
      frozenPlan.trials.map((trial) => trial.trialId),
    );
    await interruptedCoordinator.initialize();
    await interruptedCoordinator.transitionRun("running");
    const resumeOut: string[] = [];
    await createCli({
      io: {
        stdout: (text) => resumeOut.push(text),
        stderr: () => undefined,
      },
    }).parseAsync([
      "node",
      "patchrace",
      "--project",
      root,
      "--config",
      ".patchrace/suite.json",
      "--json",
      "run",
      "--resume",
      interruptedStore.runId,
    ]);
    expect(JSON.parse(resumeOut.join(""))).toMatchObject({
      status: "completed",
      data: {
        runId: interruptedStore.runId,
        report: {
          overview: { plannedTrialCount: 2, completedEvidenceCount: 2 },
        },
      },
    });
    const unsafeStore = await ArtifactStore.create({
      stateRoot: state,
      manifest: manifestWithoutRunId,
    });
    await unsafeStore.finalizeJson("plan.json", frozenPlan, {
      sensitivity: "local",
      producer: "test/partial-plan",
    });
    const unsafeCoordinator = new RunCoordinator(
      unsafeStore,
      frozenPlan.trials.map((trial) => trial.trialId),
    );
    await unsafeCoordinator.initialize();
    await unsafeCoordinator.transitionRun("running");
    await unsafeStore.finalizeJson(
      `trials/${frozenPlan.trials[0]!.trialId}/invocation.json`,
      { schemaVersion: "1.0.0", partial: true },
      { sensitivity: "local", producer: "test/partial-invocation" },
    );
    await expect(
      createCli({
        io: { stdout: () => undefined, stderr: () => undefined },
      }).parseAsync([
        "node",
        "patchrace",
        "--project",
        root,
        "--config",
        ".patchrace/suite.json",
        "--json",
        "run",
        "--resume",
        unsafeStore.runId,
      ]),
    ).rejects.toMatchObject({
      details: { code: "RACE_RESUME_PARTIAL_TRIAL_UNSAFE" },
    });
    const humanStdout: string[] = [];
    const humanStderr: string[] = [];
    await createCli({
      io: {
        stdout: (text) => humanStdout.push(text),
        stderr: (text) => humanStderr.push(text),
      },
    }).parseAsync([
      "node",
      "patchrace",
      "--project",
      root,
      "--config",
      ".patchrace/suite.json",
      "race",
      "--suite",
      "validation",
      "--variants",
      "pi-local,pi-second",
    ]);
    expect(humanStdout).toEqual([]);
    expect(humanStderr.join("")).toContain("running (local-task / pi-local)");
    expect(humanStderr.at(-1)).toBe("race: completed.\n");
    expect(
      (
        await exec("git", ["worktree", "list", "--porcelain"], { cwd: root })
      ).stdout.match(/^worktree /gm),
    ).toHaveLength(1);
  }, 30_000);
});
