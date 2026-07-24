import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const guidePath = join(root, "docs", "CONCEPTS_AND_METHODOLOGY.md");
const guide = await readFile(guidePath, "utf8");

const required = [
  "Model, Agent harness/adapter, and Pi",
  "| Model |",
  "| Harness |",
  "| Workflow ablation |",
  "A faster or cheaper failure cannot outrank a correct result.",
  "`pass@k`",
  "`pass^k`",
  "95% Wilson interval",
  "hidden chain-of-thought",
  "`discovery`",
  "`context`",
  "`workflow`",
  "`tool`",
  "`verification`",
  "`capability`",
  "`unknown`",
  "one bounded project-local candidate",
  "Training evidence may generate candidates.",
  "opened once",
  "at least +10 percentage points",
  "at least 20% lower median cost or wall time",
  "Unsupported claims include",
  "worktrees as a security sandbox",
  "redaction guarantees safe publication",
];

for (const phrase of required)
  if (!guide.includes(phrase))
    throw new Error(`Methodology guide omits required boundary: ${phrase}`);

const taxonomyRows = [
  "discovery",
  "context",
  "workflow",
  "tool",
  "verification",
  "capability",
  "unknown",
].filter((category) => guide.includes(`| \`${category}\` |`));
if (taxonomyRows.length !== 7)
  throw new Error("Methodology guide does not define all seven taxonomy rows.");

const taskContract = await readFile(
  join(root, "docs", "architecture", "TASK_AND_GRADER.md"),
  "utf8",
);
const diagnosisContract = await readFile(
  join(root, "docs", "architecture", "DIAGNOSIS.md"),
  "utf8",
);
const optimizerContract = await readFile(
  join(root, "docs", "architecture", "PI_OPTIMIZER.md"),
  "utf8",
);
for (const [contract, values] of [
  [taskContract, ["pass@k", "pass^k", "Wilson", "compromised"]],
  [diagnosisContract, taxonomyRows],
  [optimizerContract, ["promote_eligible", "hold", "reject", "no_candidate"]],
])
  for (const value of values)
    if (!contract.includes(value))
      throw new Error(`Normative contract no longer contains '${value}'.`);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      document: "docs/CONCEPTS_AND_METHODOLOGY.md",
      comparisonAxes: 3,
      taxonomyCategories: taxonomyRows.length,
      claimBoundary: true,
      normativeContractsChecked: 3,
    },
    null,
    2,
  )}\n`,
);
