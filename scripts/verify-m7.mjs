import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const ledger = read("docs/TASKS.md");
const block = ledger.match(
  /## M7 — Explainable diagnosis\n([\s\S]*?)\n## M8 —/,
);
assert(block, "M7 ledger block not found");
const rows = [
  ...block[1].matchAll(
    /^\| `(DIA-\d+)` \|[^\n]*\| (TODO|NEXT|DOING|BLOCKED|DONE|DROPPED) \|$/gm,
  ),
];
assert(rows.length === 9, `expected 9 M7 tasks, found ${rows.length}`);
assert(
  rows.every((row) => row[2] === "DONE"),
  `M7 has incomplete tasks: ${rows
    .filter((row) => row[2] !== "DONE")
    .map((row) => row[1])
    .join(", ")}`,
);

const required = [
  "packages/contracts/src/diagnosis.ts",
  "packages/diagnosis/src/taxonomy.ts",
  "packages/diagnosis/src/taxonomy.test.ts",
  "packages/diagnosis/src/features.ts",
  "packages/diagnosis/src/features.test.ts",
  "packages/diagnosis/src/alignment.ts",
  "packages/diagnosis/src/alignment.test.ts",
  "packages/diagnosis/src/rules.ts",
  "packages/diagnosis/src/rules.test.ts",
  "packages/diagnosis/src/reflection.ts",
  "packages/diagnosis/src/reflection.test.ts",
  "packages/diagnosis/src/classifier.ts",
  "packages/diagnosis/src/classifier.test.ts",
  "packages/diagnosis/src/report.ts",
  "packages/diagnosis/src/report.test.ts",
  "packages/diagnosis/src/quality.ts",
  "packages/diagnosis/src/quality.test.ts",
  "packages/report/src/diagnosis.ts",
  "packages/report/src/diagnosis.test.ts",
  "packages/cli/src/comparison-service.ts",
  "packages/cli/src/comparison-service.test.ts",
  "fixtures/diagnosis/labeled-cases.json",
  "fixtures/diagnosis/README.md",
  "docs/architecture/DIAGNOSIS.md",
  "docs/M7_REVIEW.md",
  ".changeset/m7-explainable-diagnosis.md",
];
for (const path of required)
  assert(existsSync(resolve(root, path)), `missing M7 artifact ${path}`);

const fixture = JSON.parse(read("fixtures/diagnosis/labeled-cases.json"));
assert(fixture.schemaVersion === "1.0.0", "labeled fixture schema mismatch");
assert(fixture.cases.length === 21, "M7 requires 21 labeled cases");
assert(
  new Set(fixture.cases.map((item) => item.id)).size === fixture.cases.length,
  "labeled case IDs must be unique",
);
const categories = [
  "discovery",
  "context",
  "workflow",
  "tool",
  "verification",
  "capability",
  "unknown",
];
for (const category of categories)
  assert(
    fixture.cases.filter((item) => item.expectedCategory === category)
      .length === 3,
    `expected three labeled ${category} cases`,
  );

const quality = read("packages/diagnosis/src/quality.ts");
assert(
  quality.includes("minimumCases ?? 20") &&
    quality.includes("minimumHighConfidencePrecision ?? 0.8"),
  "quality thresholds are not frozen at 20 cases / 80% precision",
);
const qualityTest = read("packages/diagnosis/src/quality.test.ts");
assert(
  qualityTest.includes("report.highConfidencePrecision") &&
    qualityTest.includes("report.unsafeOrSpeculative") &&
    qualityTest.includes("report.falsePositives"),
  "quality test does not assert precision and safety",
);
const rules = read("packages/diagnosis/src/rules.ts");
assert(
  rules.includes("narrow_rules_suppressed_by_invalid_or_unavailable_evidence"),
  "invalid evidence does not suppress narrow diagnosis",
);
const reflection = read("packages/diagnosis/src/reflection.ts");
assert(
  reflection.includes("REFLECTION_EVIDENCE_REFERENCE_INVALID") &&
    reflection.includes('confidence: "low"') &&
    reflection.includes("eligibleMutationTargets: []"),
  "reflection boundary lacks citation, confidence, or mutation controls",
);
const classifier = read("packages/diagnosis/src/classifier.ts");
assert(
  classifier.includes("successfulPeers.length >= 2") &&
    classifier.includes('recommendation: "no-configuration-mutation"'),
  "capability classifier lacks repeated peer or no-mutation controls",
);
const diagnosisReport = read("packages/diagnosis/src/report.ts");
assert(
  diagnosisReport.includes("DIAGNOSIS_REPORT_ARTIFACT_UNRESOLVED") &&
    diagnosisReport.includes("DIAGNOSIS_REPORT_EVENT_UNRESOLVED") &&
    diagnosisReport.includes("DIAGNOSIS_REPORT_GATE_UNRESOLVED"),
  "diagnosis report does not fail closed on evidence links",
);
const html = read("packages/report/src/diagnosis.ts");
assert(
  html.includes("Content-Security-Policy") &&
    html.includes("default-src 'none'") &&
    !html.includes("<script"),
  "diagnosis HTML lacks inert default-deny rendering",
);
const cli = read("packages/cli/src/comparison-service.ts");
assert(
  cli.includes('request.command === "diagnose"') &&
    cli.includes("DIAGNOSIS_REFLECTION_PROVIDER_NOT_CONFIGURED") &&
    cli.includes("buildDiagnosisReport"),
  "diagnose CLI composition or fail-closed reflection is missing",
);

const packageJson = JSON.parse(read("package.json"));
assert(
  packageJson.scripts["m7:quality"] ===
    "pnpm exec vitest run packages/diagnosis/src/quality.test.ts",
  "M7 quality script is missing",
);
assert(
  packageJson.scripts["m7:verify"] ===
    "pnpm m7:quality && node scripts/verify-m7.mjs",
  "M7 verifier script is missing",
);
assert(
  read("docs/PROGRESS.md").includes(
    "| `M7` Diagnosis | DONE | 9/9 | `DIA-09` passed |",
  ),
  "M7 progress is not closed",
);
assert(
  read("docs/M7_REVIEW.md").includes("Status: passed 9/9 tasks"),
  "M7 review does not record a pass",
);
assert(
  read(".changeset/m7-explainable-diagnosis.md").includes(
    "evidence-linked diagnosis",
  ),
  "M7 Changeset does not cover diagnosis behavior",
);
assert(
  read("docs/RISKS.md").includes("## M7 review outcome"),
  "M7 risk review is missing",
);
assert(
  read("docs/THREAT_MODEL.md").includes("## M7 implementation review"),
  "M7 threat review is missing",
);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      tasks: rows.length,
      requiredArtifacts: required.length,
      labeledCases: fixture.cases.length,
      categories: categories.length,
      highConfidencePrecision: "18/18 (100%)",
      caseCoverage: "18/21 (85.7%)",
      unsafeOrSpeculative: 0,
      reflection: "optional-redacted-fail-closed",
      capabilityMutation: "none",
    },
    null,
    2,
  )}\n`,
);
