import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const cleanRoom = process.argv.includes("--clean-room");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const expectedPackages = [
  "adapters",
  "cli",
  "contracts",
  "core",
  "diagnosis",
  "optimizer",
  "pi-extension",
  "report",
  "tasks",
];
for (const directory of expectedPackages) {
  assert(
    existsSync(join(root, "packages", directory, "package.json")),
    `missing package ${directory}`,
  );
  assert(
    existsSync(join(root, "packages", directory, "tsconfig.json")),
    `missing tsconfig ${directory}`,
  );
}

const taskLedger = read("docs/TASKS.md");
for (let index = 1; index <= 10; index += 1) {
  const id = `DEV-${String(index).padStart(2, "0")}`;
  const row = taskLedger
    .split("\n")
    .find((line) => line.includes(`| \`${id}\``));
  assert(row !== undefined, `missing task ${id}`);
  assert(row.endsWith("| DONE |"), `${id} is not DONE`);
}
assert(
  read("docs/PROGRESS.md").includes(
    "| `M2` Development foundation | DONE | 10/10 |",
  ),
  "M2 progress is not closed",
);

const cli = read("packages/core/src/services.ts");
for (const command of [
  '"init"',
  '"mine"',
  '"run"',
  '"race"',
  '"report"',
  '"diagnose"',
  '"teach pi"',
  '"promote"',
  '"rollback"',
  '"doctor"',
  '"clean"',
]) {
  assert(cli.includes(command), `missing CLI route ${command}`);
}

const fixtureManifest = JSON.parse(read("fixtures/m2/manifest.json"));
assert(
  fixtureManifest.scenarios.length === 7,
  "M2 fixture inventory must contain seven scenarios",
);

const ci = read(".github/workflows/ci.yml");
assert(
  ci.includes("ubuntu-latest") && ci.includes("macos-latest"),
  "CI runner matrix incomplete",
);
assert(
  ci.includes("22.22.0") && ci.includes("24.x"),
  "CI Node matrix incomplete",
);
assert(
  ci.includes("pnpm install --frozen-lockfile"),
  "CI frozen install missing",
);
assert(
  ci.includes("pnpm check") && ci.includes("pnpm release:pack"),
  "CI gates incomplete",
);
for (const match of ci.matchAll(/uses:\s+[^@\s]+@([^\s]+)/g)) {
  assert(
    /^[a-f0-9]{40}$/.test(match[1]),
    `CI action is not pinned to a full SHA: ${match[0]}`,
  );
}

for (const requiredPath of [
  "pnpm-lock.yaml",
  "CONTRIBUTING.md",
  "LICENSE",
  "docs/DEVELOPMENT.md",
  "docs/SUPPLY_CHAIN.md",
  ".changeset/config.json",
  ".changeset/m2-development-foundation.md",
  ".github/dependabot.yml",
]) {
  assert(
    existsSync(join(root, requiredPath)),
    `missing M2 deliverable ${requiredPath}`,
  );
}

if (!cleanRoom) {
  process.stdout.write(
    "M2 structural verification passed; use --clean-room for full checkout simulation\n",
  );
  process.exit(0);
}

const inventory = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "buffer" },
);
if (inventory.status !== 0) throw new Error(inventory.stderr.toString("utf8"));

const files = inventory.stdout.toString("utf8").split("\0").filter(Boolean);
const temporaryParent = mkdtempSync(join(tmpdir(), "patchrace-m2-"));
const checkout = join(temporaryParent, "checkout");
mkdirSync(checkout);

try {
  for (const relativePath of files) {
    const source = join(root, relativePath);
    const destination = join(checkout, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { preserveTimestamps: true });
  }

  for (const args of [
    ["init", "-q", "-b", "main"],
    ["add", "."],
    [
      "-c",
      "user.name=PatchRace Fixture",
      "-c",
      "user.email=fixture@invalid",
      "commit",
      "-qm",
      "clean-room baseline",
    ],
  ]) {
    const git = spawnSync("git", args, {
      cwd: checkout,
      encoding: "utf8",
    });
    if (git.status !== 0) throw new Error(git.stderr);
  }

  for (const [command, args] of [
    ["pnpm", ["install", "--frozen-lockfile"]],
    ["pnpm", ["release:status"]],
    ["pnpm", ["check"]],
    ["pnpm", ["release:pack"]],
    ["pnpm", ["supply-chain:licenses"]],
  ]) {
    const result = spawnSync(command, args, {
      cwd: checkout,
      encoding: "utf8",
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }

  process.stdout.write(
    `M2 clean-room verification passed for ${files.length} source files\n`,
  );
} finally {
  rmSync(temporaryParent, { recursive: true, force: true });
}
