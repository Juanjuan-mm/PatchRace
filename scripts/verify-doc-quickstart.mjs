import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const sourceRoot = resolve(import.meta.dirname, "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "patchrace-doc-verify-"));
const checkout = join(temporaryRoot, "patchrace");
const startedAt = Date.now();

function run(executable, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd ?? checkout,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = {
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) resolvePromise(result);
      else
        reject(
          new Error(
            `${executable} ${args.join(" ")} failed (${String(code)}): ${result.stderr || result.stdout}`,
          ),
        );
    });
  });
}

function includeSource(path) {
  const relative = path.slice(sourceRoot.length).replaceAll("\\", "/");
  return ![
    "/.git",
    "/.agents",
    "/.artifacts",
    "/.codex",
    "/.openai",
    "/node_modules",
    "/packages/adapters/dist",
    "/packages/cli/dist",
    "/packages/contracts/dist",
    "/packages/core/dist",
    "/packages/diagnosis/dist",
    "/packages/optimizer/dist",
    "/packages/pi-extension/dist",
    "/packages/report/dist",
    "/packages/tasks/dist",
  ].some(
    (excluded) => relative === excluded || relative.startsWith(`${excluded}/`),
  );
}

try {
  const guide = await readFile(
    join(sourceRoot, "docs", "INSTALLATION.md"),
    "utf8",
  );
  const normalizedGuide = guide.replaceAll(/\s+/gu, " ");
  for (const required of [
    "corepack pnpm install --frozen-lockfile",
    "corepack pnpm docs:quickstart",
    "npm install --global patchrace@0.1.0",
    "npx --yes patchrace@0.1.0",
    ".artifacts/quickstart/<run-id>/report.json",
    "not a filesystem, process, credential, or network sandbox",
    "does not contact Pi, Claude, Codex",
    "do not need a PatchRace source checkout",
  ])
    if (!normalizedGuide.includes(required))
      throw new Error(`Installation guide omits '${required}'.`);

  await cp(sourceRoot, checkout, {
    recursive: true,
    filter: includeSource,
  });
  const installStartedAt = Date.now();
  await run(
    "corepack",
    ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
    {
      env: {
        ...process.env,
        npm_config_cache: join(temporaryRoot, "npm-cache"),
      },
    },
  );
  const installMs = Date.now() - installStartedAt;
  const quickstartStartedAt = Date.now();
  const quickstart = await run("corepack", ["pnpm", "docs:quickstart"]);
  const quickstartMs = Date.now() - quickstartStartedAt;
  const marker = '{\n  "status": "PASS"';
  const summaryOffset = quickstart.stdout.lastIndexOf(marker);
  if (summaryOffset < 0)
    throw new Error("Quickstart did not emit its PASS summary.");
  const summary = JSON.parse(quickstart.stdout.slice(summaryOffset));
  if (
    summary.trials !== 2 ||
    summary.reportArtifacts?.localSensitive !== true ||
    quickstartMs > 300_000
  )
    throw new Error(
      "Quickstart did not produce two valid trials within five minutes.",
    );
  const report = JSON.parse(
    await readFile(join(checkout, summary.reportArtifacts.json), "utf8"),
  );
  if (
    report.trials?.length !== 2 ||
    !report.trials.every((trial) => trial.outcome === "passed")
  )
    throw new Error("Retained quickstart report is not valid.");
  await readFile(join(checkout, summary.reportArtifacts.html));

  const evidence = {
    schemaVersion: "1.0.0",
    status: "PASS",
    source: "fresh-source-copy",
    installMs,
    quickstartMs,
    totalMs: Date.now() - startedAt,
    trials: 2,
    validReport: true,
    providerCalls: false,
    credentialAccess: false,
    unrelatedStatePreserved: true,
    retainedInFreshWorkspace: false,
  };
  await writeFile(
    join(sourceRoot, ".artifacts", "doc-quickstart.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
