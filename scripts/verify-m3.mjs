import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const ledger = read("docs/TASKS.md");
const block = ledger.match(
  /## M3 — Reproducible execution core\n([\s\S]*?)\n## M4 —/,
);
assert(block, "M3 ledger block not found");
const rows = [
  ...block[1].matchAll(
    /^\| `(CORE-\d+)` \|[^\n]*\| (TODO|NEXT|DOING|BLOCKED|DONE|DROPPED) \|$/gm,
  ),
];
assert(rows.length === 12, `expected 12 M3 tasks, found ${rows.length}`);
assert(
  rows.every((row) => row[2] === "DONE"),
  `M3 has incomplete tasks: ${rows
    .filter((row) => row[2] !== "DONE")
    .map((row) => row[1])
    .join(", ")}`,
);

const modules = [
  "config",
  "artifacts",
  "worktrees",
  "process",
  "scheduler",
  "budgets",
  "recovery",
  "redaction",
  "doctor",
  "cleanup",
];
for (const module of modules) {
  assert(
    existsSync(resolve(root, `packages/core/src/${module}.ts`)),
    `missing M3 module ${module}`,
  );
  assert(
    existsSync(resolve(root, `packages/core/src/${module}.test.ts`)),
    `missing M3 test ${module}`,
  );
}
assert(
  existsSync(resolve(root, "packages/core/src/m3.e2e.test.ts")),
  "missing M3 end-to-end test",
);
assert(
  existsSync(resolve(root, "packages/contracts/schemas/suite-v1.json")),
  "missing generated suite schema release artifact",
);
assert(
  !existsSync(resolve(root, "packages/core/schemas/suite-v1.json")),
  "suite schema must be owned by contracts, not core",
);
assert(
  read("docs/PROGRESS.md").includes(
    "| `M3` Execution core | DONE | 12/12 | `CORE-12` passed |",
  ),
  "M3 progress is not closed",
);
assert(
  read("docs/M3_REVIEW.md").includes("Status: passed 12/12 tasks"),
  "M3 review does not record a pass",
);

process.stdout.write(
  `${JSON.stringify({ status: "PASS", tasks: rows.length, modules: modules.length, e2e: true, schemaArtifact: true }, null, 2)}\n`,
);
