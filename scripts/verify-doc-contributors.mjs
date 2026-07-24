import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const adapterGuide = (
  await readFile(join(root, "docs", "CONTRIBUTING_ADAPTERS.md"), "utf8")
).replaceAll(/\s+/g, " ");
const graderGuide = (
  await readFile(join(root, "docs", "CONTRIBUTING_GRADERS.md"), "utf8")
).replaceAll(/\s+/g, " ");

for (const phrase of [
  "no runtime third-party adapter discovery",
  "AgentAdapter",
  "probe → prepare (no spawn) → run (raw-first) → normalize",
  "PATH presence alone is not readiness",
  "persist stdout/stderr bytes before decoded records",
  "Missing values stay unavailable",
  "Never kill by executable name",
  "shared contract must cover",
  "preservation of an unrelated process",
  "no provider call",
  "Changeset",
])
  if (!adapterGuide.includes(phrase))
    throw new Error(`Adapter guide omits '${phrase}'.`);

for (const phrase of [
  "does not yet load arbitrary third-party grader packages at runtime",
  "TaskCommandV1",
  "TaskAssertionV1",
  "runTaskCommandPhase",
  "evaluateTaskAssertions",
  "Only `integrity: valid`",
  "Hidden verifier lifecycle",
  "integrity is `unknown`",
  "baseline fails",
  "reviewed reference patch passes at least twice",
  "preservation of an external sentinel",
  "Changeset",
])
  if (!graderGuide.includes(phrase))
    throw new Error(`Grader guide omits '${phrase}'.`);

const adapterIndex = await readFile(
  join(root, "packages", "adapters", "src", "index.ts"),
  "utf8",
);
const adapterTypes = await readFile(
  join(root, "packages", "adapters", "src", "types.ts"),
  "utf8",
);
const taskIndex = await readFile(
  join(root, "packages", "tasks", "src", "index.ts"),
  "utf8",
);
for (const symbol of ["AgentAdapter", "AdapterSink", "RawRecord"])
  if (!adapterTypes.includes(`interface ${symbol}`))
    throw new Error(`Public adapter contract no longer defines ${symbol}.`);
if (!adapterIndex.includes('export * from "./types.js"'))
  throw new Error(
    "Adapter types are no longer exported from the package entry.",
  );
for (const symbol of [
  "runTaskCommandPhase",
  "evaluateTaskAssertions",
  "TaskAssertionV1",
  "TaskCommandV1",
])
  if (!taskIndex.includes(symbol))
    throw new Error(`Task package no longer exports ${symbol}.`);

for (const file of [
  "packages/adapters/src/adapters.test.ts",
  "packages/tasks/src/grader.test.ts",
  "packages/tasks/src/assertions.test.ts",
  "packages/tasks/src/hidden-verifier.test.ts",
  "packages/tasks/src/integrity.test.ts",
]) {
  const content = await readFile(join(root, file), "utf8");
  if (!content.includes("describe("))
    throw new Error(`${file} no longer contains its fixture-backed suite.`);
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      guides: ["docs/CONTRIBUTING_ADAPTERS.md", "docs/CONTRIBUTING_GRADERS.md"],
      publicContractSymbolsChecked: 7,
      fixtureSuitesChecked: 5,
      runtimePluginClaims: "explicitly-unavailable-v0.1",
    },
    null,
    2,
  )}\n`,
);
