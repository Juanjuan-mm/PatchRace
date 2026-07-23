import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const ledger = read("docs/TASKS.md");
const block = ledger.match(/## M6 — Comparison product\n([\s\S]*?)\n## M7 —/);
assert(block, "M6 ledger block not found");
const rows = [
  ...block[1].matchAll(
    /^\| `(CMP-\d+)` \|[^\n]*\| (TODO|NEXT|DOING|BLOCKED|DONE|DROPPED) \|$/gm,
  ),
];
assert(rows.length === 11, `expected 11 M6 tasks, found ${rows.length}`);
assert(
  rows.every((row) => row[2] === "DONE"),
  `M6 has incomplete tasks: ${rows
    .filter((row) => row[2] !== "DONE")
    .map((row) => row[1])
    .join(", ")}`,
);

const required = [
  "packages/contracts/src/comparison.ts",
  "packages/core/src/race.ts",
  "packages/core/src/race.test.ts",
  "packages/core/src/baselines.ts",
  "packages/core/src/baselines.test.ts",
  "packages/core/src/report-export.ts",
  "packages/core/src/report-export.test.ts",
  "packages/diagnosis/src/ranking.ts",
  "packages/diagnosis/src/ranking.test.ts",
  "packages/diagnosis/src/regression.ts",
  "packages/diagnosis/src/regression.test.ts",
  "packages/diagnosis/src/timeline.ts",
  "packages/diagnosis/src/timeline.test.ts",
  "packages/report/src/index.ts",
  "packages/report/src/index.test.ts",
  "packages/report/src/patch.ts",
  "packages/report/src/patch.test.ts",
  "packages/report/src/formats.ts",
  "packages/report/src/formats.test.ts",
  "packages/cli/src/terminal.ts",
  "packages/cli/src/terminal.test.ts",
  "packages/cli/src/comparison-service.ts",
  "packages/cli/src/comparison-service.test.ts",
  "docs/M6_REVIEW.md",
  ".changeset/m6-comparison-product.md",
];
for (const path of required)
  assert(existsSync(resolve(root, path)), `missing M6 artifact ${path}`);

const demoRoot = "fixtures/m6/three-agent-demo";
const report = JSON.parse(read(`${demoRoot}/report.json`));
assert(report.schemaVersion === "1.0.0", "demo report schema mismatch");
assert(report.source.variants.length === 3, "demo must include 3 variants");
assert(report.trials.length === 3, "demo must include 3 trials");
assert(report.patches.length === 3, "demo must include 3 patch comparisons");
assert(
  report.timelines.length === 1,
  "demo must include a trajectory timeline",
);
assert(
  new Set(report.source.variants.map((variant) => variant.adapter.kind))
    .size === 3,
  "demo must include Pi, Claude Code, and Codex adapters",
);
assert(
  report.source.variants
    .map((variant) => variant.adapter.kind)
    .sort()
    .join(",") === "claude-code,codex,pi",
  "demo adapter identities are incomplete",
);
assert(
  report.source.variants.every(
    (variant) =>
      typeof variant.variantHash === "string" &&
      variant.harness.evidence === "captured-public-fixture",
  ),
  "demo variant provenance is incomplete",
);
assert(
  report.trials.every(
    (trial) =>
      trial.metrics.costUsd.availability === "unavailable" &&
      trial.metrics.tokens.availability === "unavailable",
  ),
  "demo missing usage must remain unavailable",
);
assert(
  report.ranking.variants.at(-1).aggregate.allHardGatesPassed === false,
  "failed hard gate must rank below passing variants",
);
for (const trial of report.trials)
  for (const path of Object.values(trial.artifacts))
    assert(
      typeof path === "string" && existsSync(resolve(root, demoRoot, path)),
      `demo evidence link does not resolve: ${path}`,
    );

const html = read(`${demoRoot}/index.html`);
assert(
  html.includes("Content-Security-Policy") &&
    html.includes("default-src 'none'"),
  "demo HTML lacks strict CSP",
);
assert(!html.includes("<script"), "demo HTML contains script content");
assert(
  html.includes("Side-by-side patches") &&
    html.includes("Normalized trajectory timelines"),
  "demo HTML lacks patch or trajectory inspection",
);
assert(
  html.includes("does not establish a universally best Agent"),
  "demo HTML lacks bounded claim",
);
const demoReadme = read(`${demoRoot}/README.md`);
assert(
  demoReadme.includes("synthetic/captured public evidence") &&
    demoReadme.includes("cannot establish universal Agent superiority"),
  "demo README lacks captured/small-claim boundary",
);

const packageJson = JSON.parse(read("package.json"));
assert(
  packageJson.scripts["m6:demo"] ===
    "pnpm build && node scripts/generate-m6-demo.mjs --check",
  "M6 demo script is missing",
);
assert(
  packageJson.scripts["m6:verify"] ===
    "pnpm m6:demo && node scripts/verify-m6.mjs",
  "M6 verifier script is missing",
);
assert(
  !read("packages/cli/src/comparison-service.ts").includes(
    'status: "placeholder"',
  ),
  "comparison CLI still contains placeholder routing",
);
assert(
  read("docs/PROGRESS.md").includes(
    "| `M6` Comparison product | DONE | 11/11 | `CMP-11` passed |",
  ),
  "M6 progress is not closed",
);
assert(
  read("docs/M6_REVIEW.md").includes("Status: passed 11/11 tasks"),
  "M6 review does not record a pass",
);
assert(
  read(".changeset/m6-comparison-product.md").includes(
    "correctness-first ranking",
  ),
  "M6 Changeset does not cover comparison behavior",
);
assert(
  read("docs/RISKS.md").includes("## M6 review outcome"),
  "M6 risk review is missing",
);
assert(
  read("docs/THREAT_MODEL.md").includes("## M6 implementation review"),
  "M6 threat review is missing",
);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      tasks: rows.length,
      requiredArtifacts: required.length,
      demoVariants: report.source.variants.length,
      demoTrials: report.trials.length,
      demoEvidenceFiles: report.trials.length * 4,
      reportFormats: ["json", "html", "junit", "sarif"],
      hardGatePolicy: "correctness-first-v1",
      hiddenHostIntegrity: "unknown",
    },
    null,
    2,
  )}\n`,
);
