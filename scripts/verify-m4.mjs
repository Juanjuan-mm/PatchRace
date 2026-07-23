import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const ledger = read("docs/TASKS.md");
const block = ledger.match(/## M4 — Agent adapter layer\n([\s\S]*?)\n## M5 —/);
assert(block, "M4 ledger block not found");
const rows = [
  ...block[1].matchAll(
    /^\| `(ADP-\d+)` \|[^\n]*\| (TODO|NEXT|DOING|BLOCKED|DONE|DROPPED) \|$/gm,
  ),
];
assert(rows.length === 10, `expected 10 M4 tasks, found ${rows.length}`);
assert(
  rows.every((row) => row[2] === "DONE"),
  `M4 has incomplete tasks: ${rows
    .filter((row) => row[2] !== "DONE")
    .map((row) => row[1])
    .join(", ")}`,
);

const modules = [
  "types",
  "base",
  "jsonl",
  "sinks",
  "normalizer",
  "pi",
  "pi-sdk",
  "claude",
  "codex",
  "compatibility",
  "export",
];
for (const module of modules)
  assert(
    existsSync(resolve(root, `packages/adapters/src/${module}.ts`)),
    `missing M4 module ${module}`,
  );
assert(
  existsSync(resolve(root, "packages/adapters/src/adapters.test.ts")),
  "missing shared adapter contract test",
);
assert(
  existsSync(resolve(root, "packages/contracts/schemas/trace-event-v1.json")),
  "missing generated trace schema release artifact",
);
assert(
  read("packages/adapters/src/compatibility.ts").includes(
    'range: ">=0.81.0 <0.82.0"',
  ),
  "Pi compatibility range is missing",
);
assert(
  read("packages/adapters/src/export.ts").includes('optIn: "confirmed"'),
  "standard export is not statically opt-in",
);
assert(
  read("docs/PROGRESS.md").includes(
    "| `M4` Agent adapters | DONE | 10/10 | `ADP-10` passed |",
  ),
  "M4 progress is not closed",
);
assert(
  read("docs/M4_REVIEW.md").includes("Status: passed 10/10 tasks"),
  "M4 review does not record a pass",
);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      tasks: rows.length,
      modules: modules.length,
      sharedContractSuite: true,
      traceSchema: true,
      optInExport: true,
    },
    null,
    2,
  )}\n`,
);
