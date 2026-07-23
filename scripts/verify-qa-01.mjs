import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const ledger = read("docs/TASKS.md");
const row = ledger.match(
  /^\| `QA-01` \|[^\n]*\| (TODO|NEXT|DOING|BLOCKED|DONE|DROPPED) \|$/m,
);
assert(row?.[1] === "DONE", "QA-01 is not complete in the task ledger");

const required = [
  "docs/QA_TEST_MATRIX.md",
  "packages/core/src/services.test.ts",
  "packages/pi-extension/src/bridge.test.ts",
  "packages/pi-extension/src/status.test.ts",
  "scripts/run-qa-smoke.mjs",
  ".changeset/qa-01-hardening.md",
];
for (const path of required)
  assert(existsSync(resolve(root, path)), `missing QA-01 artifact ${path}`);

const packageJson = JSON.parse(read("package.json"));
assert(
  packageJson.scripts["qa:smoke"] === "node scripts/run-qa-smoke.mjs",
  "qa:smoke is not registered",
);
assert(
  packageJson.scripts["check"]?.endsWith("pnpm build && pnpm qa:smoke"),
  "the built CLI smoke is not part of pnpm check",
);

const matrix = read("docs/QA_TEST_MATRIX.md");
for (const label of [
  "Unit",
  "Contract",
  "Integration",
  "Deterministic E2E",
  "Fixtures",
  "Snapshot/reproducibility",
])
  assert(matrix.includes(`| ${label} |`), `missing pyramid layer ${label}`);
assert(
  matrix.includes("Explicitly unproven here") && matrix.includes("BETA-01..03"),
  "QA matrix hides later release gates",
);

const packageRoot = resolve(root, "packages");
const testFiles = readdirSync(packageRoot, {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const sourceRoot = resolve(packageRoot, entry.name, "src");
    if (!existsSync(sourceRoot)) return [];
    return readdirSync(sourceRoot, {
      recursive: true,
      encoding: "utf8",
    })
      .filter((path) => path.endsWith(".test.ts"))
      .map((path) => `${entry.name}/src/${path}`);
  });
assert(
  testFiles.length >= 72,
  `expected at least 72 test files, found ${testFiles.length}`,
);

const progress = read("docs/PROGRESS.md");
assert(
  progress.includes("| `M10` Hardening and beta | DOING | 1/17 | `QA-09` |"),
  "M10 progress does not record QA-01 completion",
);
assert(
  progress.includes(
    "Next recommended task: `QA-02 — Validate supported macOS and Linux environments`",
  ),
  "QA-02 is not the next recommended task",
);
assert(
  read("docs/SESSION_LOG.md").includes(
    "## 2026-07-23 — QA-01 Automated test pyramid",
  ),
  "QA-01 session evidence is missing",
);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      task: "QA-01",
      testFiles: testFiles.length,
      layers: 6,
      builtCliSmoke: true,
      laterReleaseGatesClaimed: false,
    },
    null,
    2,
  )}\n`,
);
