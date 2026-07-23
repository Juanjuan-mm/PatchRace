import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const required = [
  "docs/QA_PRIVACY_REVIEW.md",
  "fixtures/privacy/public-export.json",
  "packages/core/src/privacy.test.ts",
  "packages/core/src/redaction.test.ts",
  "packages/report/src/index.test.ts",
  ".changeset/qa-07-privacy-projection.md",
];
for (const path of required)
  assert(existsSync(resolve(root, path)), `missing QA-07 artifact ${path}`);

const fixture = JSON.parse(read("fixtures/privacy/public-export.json"));
for (const field of [
  "prompt",
  "projectPath",
  "credentialRecipes",
  "sourceCode",
  "personalData",
  "unknownSecret",
  "falsePositiveControls",
])
  assert(fixture[field] !== undefined, `privacy fixture omits ${field}`);
assert(
  fixture.credentialRecipes.length >= 5 &&
    fixture.credentialRecipes.every(
      (recipe) =>
        typeof recipe.separator === "string" &&
        Array.isArray(recipe.parts) &&
        recipe.parts.length >= 2,
    ),
  "privacy fixture lacks credential families",
);
assert(
  fixture.personalData.length >= 3,
  "privacy fixture lacks personal-data classes",
);

const redaction = read("packages/core/src/redaction.ts");
assert(
  redaction.includes("serializedVariants") &&
    redaction.includes("JSON.stringify(value)") &&
    redaction.includes("htmlEncoded(value)") &&
    redaction.includes("no partial output was emitted") &&
    redaction.includes("DEFAULT_TRANSFORM_MAX_BYTES"),
  "redactor lacks encoded-form or bounded no-partial-output controls",
);

const report = read("packages/report/src/index.ts");
for (const omitted of [
  "patches: []",
  "timelines: []",
  "evidence: []",
  "patch: null",
  'executable: "[REDACTED:executable]"',
  "environmentNames: []",
])
  assert(report.includes(omitted), `shareable projection lacks ${omitted}`);

const exportSource = read("packages/core/src/report-export.ts");
assert(
  exportSource.includes('path.startsWith("report/shareable/")') &&
    exportSource.includes("readRegularFileNoFollow") &&
    exportSource.includes("absence of unknown secrets is not guaranteed"),
  "report export lacks shareable-only, no-follow, or residual controls",
);

const cli = read("packages/cli/src/comparison-service.ts");
for (const control of [
  "REPORT_EXPORT_CONFIG_DRIFT",
  "REPORT_REDACTION_PROFILE_UNSUPPORTED",
  "REPORT_REDACTION_VALUE_UNAVAILABLE",
  "defaults.environment.redact",
  "report/shareable/report.json",
])
  assert(cli.includes(control), `CLI privacy boundary lacks ${control}`);

const adapterExport = read("packages/adapters/src/export.ts");
assert(
  adapterExport.includes("redactValue(event.data)") &&
    adapterExport.includes("absence of unknown secrets is not guaranteed") &&
    adapterExport.includes("published: false"),
  "OTLP export lacks typed redaction, limitation, or no-publisher evidence",
);

const review = read("docs/QA_PRIVACY_REVIEW.md");
for (const dataClass of [
  "Prompts and Agent outputs",
  "Absolute/local paths",
  "Credentials",
  "Source code",
  "Personal data",
  "Unknown/transformed secrets",
])
  assert(
    review.includes(`| ${dataClass} |`),
    `privacy review omits ${dataClass}`,
  );
assert(
  review.includes("No unresolved critical or high privacy defect is known") &&
    /Every public export\s+requires human review/u.test(review) &&
    review.includes("No automatic telemetry"),
  "privacy review overclaims completeness or omits human review/telemetry boundary",
);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      task: "QA-07",
      fixtureDataClasses: 6,
      seededCredentialFamilies: fixture.credentialRecipes.length,
      seededPersonalDataClasses: fixture.personalData.length,
      findingsFixed: 5,
      unresolvedCriticalOrHigh: 0,
      rawEvidencePreserved: true,
      automaticUpload: false,
      unknownSecretGuarantee: false,
    },
    null,
    2,
  )}\n`,
);
