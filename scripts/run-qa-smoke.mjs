import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(import.meta.dirname, "..");
const mode = process.argv.includes("--packed") ? "packed" : "built";
const allowNetworkInstall = process.argv.includes("--network-install");
const keepQuickstartReport = process.argv.includes("--quickstart");
const temporaryRoot = await mkdtemp(join(tmpdir(), "patchrace-qa-smoke-"));
const projectRoot = join(temporaryRoot, "project");
const installRoot = join(temporaryRoot, "install");

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function run(executable, arguments_, options = {}) {
  const result = spawnSync(executable, arguments_, {
    cwd: options.cwd ?? projectRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `${executable} ${arguments_.join(" ")} failed (${String(result.status)}): ${result.stderr || result.stdout}`,
    );
  }
  return result;
}

function productEnvironment() {
  const environment = Object.fromEntries(
    ["PATH", "LANG", "LC_ALL", "TMPDIR", "TMP", "TEMP"]
      .map((name) => [name, process.env[name]])
      .filter((entry) => entry[1] !== undefined),
  );
  environment["PATH"] = [
    ...(mode === "packed" ? [join(installRoot, "node_modules", ".bin")] : []),
    process.env["PATH"] ?? "",
  ]
    .filter(Boolean)
    .join(delimiter);
  environment["PATCHRACE_QA_PASSTHROUGH"] = "present";
  return environment;
}

async function packedCommand() {
  await mkdir(installRoot, { recursive: true });
  const packageRoot = join(repositoryRoot, ".artifacts", "packages");
  const tarballs = (await readdir(packageRoot))
    .filter((name) => name.endsWith(".tgz"))
    .sort()
    .map((name) => join(packageRoot, name));
  if (tarballs.length !== 9)
    throw new Error(
      `Packed smoke expected 9 release tarballs, found ${String(tarballs.length)}.`,
    );
  const dependencies = Object.fromEntries(
    tarballs.map((tarball) => {
      const packedPackage = JSON.parse(
        run("tar", ["-xOf", tarball, "package/package.json"], {
          cwd: installRoot,
        }).stdout,
      );
      if (typeof packedPackage.name !== "string") {
        throw new Error(`${tarball} has no package name.`);
      }
      return [packedPackage.name, `file:${tarball}`];
    }),
  );
  await writeFile(
    join(installRoot, "package.json"),
    `${JSON.stringify({
      name: "patchrace-release-smoke",
      private: true,
      dependencies,
    })}\n`,
  );
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      ...(allowNetworkInstall ? [] : ["--offline"]),
    ],
    {
      cwd: installRoot,
      env: {
        ...process.env,
        npm_config_cache: join(installRoot, ".npm-cache"),
      },
    },
  );
  return {
    executable: process.execPath,
    prefix: [join(installRoot, "node_modules", "patchrace", "dist", "main.js")],
  };
}

async function builtCommand() {
  const entry = join(repositoryRoot, "packages", "cli", "dist", "main.js");
  await readFile(entry);
  return { executable: process.execPath, prefix: [entry] };
}

async function createProject() {
  await mkdir(projectRoot, { recursive: true });
  run("git", ["init", "-q", "-b", "main"]);
  run("git", ["config", "user.name", "PatchRace QA Fixture"]);
  run("git", ["config", "user.email", "qa@example.invalid"]);
  const agent = join(projectRoot, "fake-pi.mjs");
  await writeFile(
    agent,
    `#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
if (process.argv.includes("--version")) {
  process.stdout.write("0.81.1\\n");
} else {
  if (process.env.PATCHRACE_QA_PASSTHROUGH !== "present") {
    throw new Error("explicit pass-through environment value is missing");
  }
  await writeFile("target.txt", "changed\\n");
  process.stdout.write(JSON.stringify({ type: "agent_end", message: "done" }) + "\\n");
}
`,
  );
  await writeFile(join(projectRoot, ".gitignore"), ".patchrace/\n");
  await writeFile(join(projectRoot, "target.txt"), "original\n");
  await writeFile(join(projectRoot, "sentinel.txt"), "preserve\n");
  await writeFile(
    join(projectRoot, "verifier.mjs"),
    `import { readFile } from "node:fs/promises";
if (await readFile("target.txt", "utf8") !== "changed\\n") process.exit(1);
`,
  );
  run("git", ["add", "."]);
  run("git", ["commit", "-qm", "release smoke baseline"]);
  const commit = run("git", ["rev-parse", "HEAD"]).stdout.trim();
  const stateRoot = join(projectRoot, ".patchrace");
  const taskRoot = join(stateRoot, "qa-smoke");
  await mkdir(taskRoot, { recursive: true });
  const instruction = "Change target.txt to the requested value.\n";
  await writeFile(join(taskRoot, "instruction.md"), instruction);
  await writeFile(
    join(taskRoot, "task.json"),
    `${JSON.stringify({
      schemaVersion: "1.0.0",
      id: "release-smoke",
      revision: 1,
      baseline: {
        repository: ".",
        commit,
        submodules: "disabled",
        lfs: "disabled",
      },
      instruction: {
        file: "instruction.md",
        hash: sha256(instruction),
      },
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
        reviewedBy: "release-smoke",
      },
      metadata: {
        ecosystem: "javascript",
        category: "release-smoke",
        split: "validation",
      },
    })}\n`,
  );
  await writeFile(
    join(stateRoot, "suite.json"),
    `${JSON.stringify({
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
        environment: {
          inherit: ["PATH", "LANG", "LC_ALL"],
          pass: ["PATCHRACE_QA_PASSTHROUGH"],
          redact: [],
        },
      },
      adapters: {
        pi: { kind: "pi", executable: process.execPath, args: [agent] },
      },
      variants: {
        "pi-baseline": {
          adapter: "pi",
          model: null,
          harness: {},
          workflow: {},
        },
        "pi-workflow": {
          adapter: "pi",
          model: null,
          harness: {},
          workflow: { instruction: "same-observable-fixture" },
        },
      },
      suites: {
        validation: { tasks: ["release-smoke"], split: "validation" },
      },
      tasks: { "release-smoke": { file: "qa-smoke/task.json" } },
      objectives: {
        policy: "correctness-first-v1",
        afterHardGates: ["stability", "latency", "footprint"],
      },
      report: {
        formats: ["json", "html"],
        includeRawCode: "local-only",
        redactionProfile: "default",
      },
    })}\n`,
  );
  return { agent, stateRoot };
}

function jsonCommand(command, arguments_) {
  const result = run(
    command.executable,
    [...command.prefix, "--project", projectRoot, "--json", ...arguments_],
    { env: productEnvironment() },
  );
  if (result.stderr !== "")
    throw new Error(
      `Machine command emitted unexpected stderr: ${result.stderr}`,
    );
  const trimmed = result.stdout.trim();
  const parsed = JSON.parse(trimmed);
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    parsed.ok !== true ||
    typeof parsed.command !== "string"
  )
    throw new Error("Machine command returned an incompatible result.");
  return parsed;
}

try {
  const command =
    mode === "packed" ? await packedCommand() : await builtCommand();
  const { stateRoot } = await createProject();
  const versionResult = run(
    command.executable,
    [...command.prefix, "--version"],
    {
      env: productEnvironment(),
    },
  );
  const version = versionResult.stdout.trim();
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(
      `CLI '${command.executable}' returned an invalid version '${version}'` +
        ` with stderr '${versionResult.stderr.trim()}'.`,
    );
  }

  const initialized = jsonCommand(command, [
    "init",
    "--output",
    ".patchrace/manual-suite.yaml",
  ]);
  if (
    initialized.status !== "completed" ||
    initialized.data?.agentInvoked !== false
  )
    throw new Error("Packaged init did not produce an Agent-free suite.");

  const doctor = jsonCommand(command, [
    "--config",
    ".patchrace/suite.json",
    "doctor",
    "--adapter",
    "pi",
  ]);
  if (
    doctor.status !== "completed" ||
    !doctor.data?.checks?.some((check) => check.id === "adapter.pi")
  )
    throw new Error("Packaged doctor did not report adapter readiness.");

  const raced = jsonCommand(command, [
    "--config",
    ".patchrace/suite.json",
    "race",
    "--suite",
    "validation",
    "--variants",
    "pi-baseline,pi-workflow",
  ]);
  const runId = raced.data?.runId;
  const trials = raced.data?.report?.trials;
  if (
    raced.status !== "completed" ||
    typeof runId !== "string" ||
    !Array.isArray(trials) ||
    trials.length !== 2 ||
    !trials.every((trial) => trial.outcome === "passed")
  )
    throw new Error("Packaged race did not complete two passing trials.");

  const report = jsonCommand(command, ["report", runId, "--format", "junit"]);
  if (
    report.status !== "completed" ||
    !report.data?.content?.includes("<testsuites")
  )
    throw new Error("Packaged report regeneration did not return JUnit.");

  const diagnosis = jsonCommand(command, [
    "diagnose",
    runId,
    "--focus",
    "pi-baseline",
    "--format",
    "json",
  ]);
  if (
    diagnosis.status !== "completed" ||
    diagnosis.data?.report?.overview?.caseCount !== 1
  )
    throw new Error("Packaged diagnosis did not replay durable evidence.");

  const human = run(
    command.executable,
    [...command.prefix, "--project", projectRoot, "report", runId],
    { env: productEnvironment() },
  );
  if (human.stdout !== "" || !human.stderr.endsWith("report: completed.\n"))
    throw new Error("Human CLI output did not remain on stderr.");

  let quickstartReport = null;
  if (keepQuickstartReport) {
    const relativeDestination = join(".artifacts", "quickstart", runId);
    const destination = join(repositoryRoot, relativeDestination);
    await mkdir(join(repositoryRoot, ".artifacts", "quickstart"), {
      recursive: true,
    });
    await cp(join(stateRoot, "runs", runId, "report"), destination, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    const copiedReport = JSON.parse(
      await readFile(join(destination, "report.json"), "utf8"),
    );
    if (
      copiedReport.trials?.length !== 2 ||
      !copiedReport.trials.every((trial) => trial.outcome === "passed")
    )
      throw new Error("Quickstart report copy is not a valid passing report.");
    await readFile(join(destination, "index.html"));
    quickstartReport = {
      directory: relativeDestination.replaceAll("\\", "/"),
      json: join(relativeDestination, "report.json").replaceAll("\\", "/"),
      html: join(relativeDestination, "index.html").replaceAll("\\", "/"),
      localSensitive: true,
    };
  }

  const preview = jsonCommand(command, [
    "clean",
    "--run",
    runId,
    "--artifacts",
  ]);
  if (preview.status !== "dry-run" || preview.sideEffects.length !== 0)
    throw new Error("Cleanup preview was not non-destructive.");
  await readFile(join(stateRoot, "runs", runId, "manifest.json"));

  const cleaned = jsonCommand(command, [
    "clean",
    "--run",
    runId,
    "--artifacts",
    "--confirm",
  ]);
  if (cleaned.status !== "completed" || cleaned.sideEffects.length !== 1)
    throw new Error("Confirmed cleanup did not remove exactly one owned run.");
  await readFile(join(projectRoot, "sentinel.txt"));
  if (
    (await readFile(join(projectRoot, "target.txt"), "utf8")) !== "original\n"
  )
    throw new Error("Release smoke changed the user's primary worktree.");
  const worktrees = run("git", [
    "worktree",
    "list",
    "--porcelain",
  ]).stdout.match(/^worktree /gm);
  if (worktrees?.length !== 1)
    throw new Error("Release smoke left an owned worktree behind.");

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "PASS",
        mode,
        cliVersion: version,
        workflow: [
          "init",
          "doctor",
          "race",
          "report",
          "diagnose",
          "clean-preview",
          "clean-confirm",
        ],
        trials: trials.length,
        userWorktreePreserved: true,
        unrelatedStatePreserved: true,
        machineOutput: "single-json-stdout",
        humanOutput: "stderr",
        ...(quickstartReport === null
          ? {}
          : { reportArtifacts: quickstartReport }),
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
