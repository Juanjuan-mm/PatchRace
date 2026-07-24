import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { arch, platform, release, tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";

import { packageManagerCommand } from "./package-manager-command.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const useInstalledWorkspace = process.argv.includes("--installed-workspace");
const temporaryRoot = useInstalledWorkspace
  ? undefined
  : await mkdtemp(join(tmpdir(), "patchrace-platform-"));
const workingRoot = temporaryRoot
  ? join(temporaryRoot, "workspace")
  : repositoryRoot;

function run(executable, arguments_, options = {}) {
  const command = packageManagerCommand(executable, arguments_);
  const result = spawnSync(command.executable, command.args, {
    cwd: options.cwd ?? workingRoot,
    encoding: "utf8",
    env: process.env,
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) {
    throw new Error(
      `Cannot start ${executable} ${arguments_.join(" ")}: ${result.error.message}`,
      { cause: result.error },
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `${executable} ${arguments_.join(" ")} failed (${String(result.status)}): ${
        result.stderr || result.stdout || "no captured output"
      }`,
    );
  }
  return options.capture ? result.stdout.trim() : "";
}

function parseVersion(value, label) {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Cannot parse ${label} version from '${value}'.`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function includeInCleanCopy(source) {
  const relativeSource = relative(repositoryRoot, source);
  if (relativeSource === "") return true;
  const segments = relativeSource.split(sep);
  if (
    segments.some((segment) =>
      [
        ".artifacts",
        ".git",
        ".patchrace",
        ".pnpm-store",
        "coverage",
        "dist",
        "node_modules",
      ].includes(segment),
    )
  ) {
    return false;
  }
  const name = basename(source);
  return (
    name !== ".DS_Store" &&
    !name.endsWith(".tgz") &&
    !name.endsWith(".tsbuildinfo")
  );
}

function validateEnvironment() {
  const operatingSystem = platform();
  if (!["darwin", "linux", "win32"].includes(operatingSystem)) {
    throw new Error(
      `PatchRace supports macOS, Linux, and Windows; received '${operatingSystem}'.`,
    );
  }

  const nodeVersion = process.version.slice(1);
  const parsedNode = parseVersion(nodeVersion, "Node");
  if (
    ![22, 24, 26].includes(parsedNode[0]) ||
    (parsedNode[0] === 22 && compareVersions(parsedNode, [22, 22, 0]) < 0)
  ) {
    throw new Error(
      `PatchRace requires Node >=22.22.0 on major 22, 24, or 26; received ${nodeVersion}.`,
    );
  }

  const gitVersion = run("git", ["--version"], {
    capture: true,
    cwd: repositoryRoot,
  });
  if (compareVersions(parseVersion(gitVersion, "Git"), [2, 39, 0]) < 0) {
    throw new Error(`PatchRace requires Git >=2.39.0; received ${gitVersion}.`);
  }

  const pnpmVersion = run("pnpm", ["--version"], {
    capture: true,
    cwd: repositoryRoot,
  });
  if (pnpmVersion !== "10.34.5") {
    throw new Error(
      `PatchRace requires the pinned pnpm 10.34.5; received ${pnpmVersion}.`,
    );
  }

  return {
    operatingSystem,
    operatingSystemRelease: release(),
    architecture: arch(),
    nodeVersion,
    gitVersion: gitVersion.replace(/^git version /, ""),
    pnpmVersion,
  };
}

try {
  const environment = validateEnvironment();
  if (temporaryRoot) {
    await cp(repositoryRoot, workingRoot, {
      recursive: true,
      filter: includeInCleanCopy,
    });
    run("pnpm", ["install", "--frozen-lockfile", "--ignore-scripts"]);
  }

  run("pnpm", ["check"]);
  run("pnpm", ["release:pack"]);
  run("node", ["scripts/run-qa-smoke.mjs", "--packed", "--network-install"]);

  const evidence = {
    schemaVersion: "1.0.0",
    status: "PASS",
    source: useInstalledWorkspace
      ? "fresh-installed-workspace"
      : "isolated-clean-copy",
    environment,
    checks: [
      "frozen-install",
      "quality-gate",
      "nine-package-dry-pack",
      "packed-consumer-install",
      "init",
      "doctor",
      "race",
      "report",
      "diagnose",
      "cleanup-preview",
      "cleanup-confirm",
      "primary-worktree-preservation",
      "unrelated-state-preservation",
    ],
  };
  const evidenceRoot = join(repositoryRoot, ".artifacts", "qa-platform");
  await mkdir(evidenceRoot, { recursive: true });
  const evidencePath = join(
    evidenceRoot,
    `${environment.operatingSystem}-${environment.architecture}-node${
      parseVersion(environment.nodeVersion, "Node")[0]
    }.json`,
  );
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  if (temporaryRoot) {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
