import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const ledger = read("docs/TASKS.md");
const block = ledger.match(/## M5 — Tasks and grading\n([\s\S]*?)\n## M6 —/);
assert(block, "M5 ledger block not found");
const rows = [
  ...block[1].matchAll(
    /^\| `(EVAL-\d+)` \|[^\n]*\| (TODO|NEXT|DOING|BLOCKED|DONE|DROPPED) \|$/gm,
  ),
];
assert(rows.length === 13, `expected 13 M5 tasks, found ${rows.length}`);
assert(
  rows.every((row) => row[2] === "DONE"),
  `M5 has incomplete tasks: ${rows
    .filter((row) => row[2] !== "DONE")
    .map((row) => row[1])
    .join(", ")}`,
);

const taskModules = [
  "task",
  "init",
  "grader",
  "assertions",
  "hidden-verifier",
  "miner",
  "github",
  "split",
  "validity",
  "integrity",
  "statistics",
];
for (const module of taskModules) {
  assert(
    existsSync(resolve(root, `packages/tasks/src/${module}.ts`)),
    `missing M5 module ${module}`,
  );
  assert(
    existsSync(resolve(root, `packages/tasks/src/${module}.test.ts`)),
    `missing M5 test ${module}`,
  );
}

const contractModules = [
  "task",
  "grade",
  "mining",
  "split",
  "validity",
  "integrity",
  "statistics",
];
for (const module of contractModules)
  assert(
    existsSync(resolve(root, `packages/contracts/src/${module}.ts`)),
    `missing M5 contract ${module}`,
  );

assert(
  existsSync(resolve(root, "packages/contracts/schemas/task-v1.json")),
  "missing generated task schema",
);
assert(
  existsSync(resolve(root, "packages/tasks/src/reference-suite.test.ts")),
  "missing M5 reference replay",
);
assert(existsSync(resolve(root, "docs/M5_REVIEW.md")), "missing M5 review");

const manifest = JSON.parse(read("fixtures/m5/reference-suite/manifest.json"));
assert(manifest.schemaVersion === "1.0.0", "reference schema mismatch");
assert(
  manifest.tasks.length === 10,
  "reference inventory must contain 10 tasks",
);
assert(
  new Set(manifest.tasks.map((task) => task.id)).size === 10,
  "reference task ids must be unique",
);
assert(
  new Set(manifest.tasks.map((task) => task.ecosystem)).size >= 3,
  "reference inventory must span at least 3 ecosystems",
);
assert(
  new Set(manifest.tasks.map((task) => task.category)).size >= 3,
  "reference inventory must span at least 3 categories",
);
assert(
  manifest.tasks.filter((task) => task.visibility === "hidden").length >= 3,
  "reference inventory must include hidden verifiers",
);
assert(
  manifest.tasks.filter((task) => task.expectedValidity === "flaky").length ===
    1,
  "reference inventory must include exactly one deliberate flake",
);

const packageJson = JSON.parse(read("package.json"));
assert(
  packageJson.scripts["m5:reference"] ===
    "vitest run packages/tasks/src/reference-suite.test.ts",
  "M5 reference script is missing",
);
assert(
  packageJson.scripts["m5:verify"] ===
    "pnpm m5:reference && node scripts/verify-m5.mjs",
  "M5 verifier script is missing",
);
assert(
  read("docs/architecture/TASK_AND_GRADER.md").includes(
    "host-only filesystem separation is `unknown`",
  ),
  "host-only integrity limitation is not documented",
);
assert(
  read("docs/PROGRESS.md").includes(
    "| `M5` Tasks and grading | DONE | 13/13 | `EVAL-13` passed |",
  ),
  "M5 progress is not closed",
);
assert(
  read("docs/M5_REVIEW.md").includes("Status: passed 13/13 tasks"),
  "M5 review does not record a pass",
);
assert(
  read(".changeset/m5-task-contract.md").includes(
    "grader-integrity/leakage gates",
  ),
  "M5 Changeset does not cover integrity behavior",
);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      tasks: rows.length,
      modules: taskModules.length,
      contracts: contractModules.length,
      referenceTasks: manifest.tasks.length,
      ecosystems: new Set(manifest.tasks.map((task) => task.ecosystem)).size,
      hiddenVerifiers: manifest.tasks.filter(
        (task) => task.visibility === "hidden",
      ).length,
      deliberateFlakes: manifest.tasks.filter(
        (task) => task.expectedValidity === "flaky",
      ).length,
      hostIntegrityClaim: "unknown",
    },
    null,
    2,
  )}\n`,
);
