import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const protocol = (
  await readFile(join(root, "docs", "PRIVATE_BETA_PROTOCOL.md"), "utf8")
).replaceAll(/\s+/g, " ");
const guide = (
  await readFile(
    join(root, "docs", "PRIVATE_BETA_PARTICIPANT_GUIDE.md"),
    "utf8",
  )
).replaceAll(/\s+/g, " ");
const schema = JSON.parse(
  await readFile(join(root, "beta", "participant-record.schema.json"), "utf8"),
);
const template = JSON.parse(
  await readFile(join(root, "beta", "participant-template.json"), "utf8"),
);

for (const phrase of [
  "at least five people who did not author the implementation",
  "synthetic personas",
  "without live maintainer intervention",
  "≥ 4/5",
  "≥ 3/5",
  "Critical usability blockers left open",
  "Every observed failure",
  "`P0`",
  "`P1`",
  "Do not include",
  "Tooling readiness alone is not participant evidence.",
])
  assert.equal(protocol.includes(phrase), true, `Protocol omits '${phrase}'.`);
for (const phrase of [
  "not a sandbox",
  "Do not publish it.",
  "what the result does **not** prove",
  "`promote-eligible`",
  "does not require a live Agent or credential",
  "no automatic telemetry or upload",
])
  assert.equal(
    guide.includes(phrase),
    true,
    `Participant guide omits '${phrase}'.`,
  );

assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.sample.const, false);
assert.equal(schema.properties.implementationAuthor.const, false);
assert.equal(schema.properties.consent.properties.study.const, true);
assert.equal(
  schema.properties.consent.properties.minimizedRetention.const,
  true,
);
assert.equal(template.sample, true);
assert.equal(template.implementationAuthor, true);
assert.equal(template.consent.study, false);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      protocol: "docs/PRIVATE_BETA_PROTOCOL.md",
      participantGuide: "docs/PRIVATE_BETA_PARTICIPANT_GUIDE.md",
      schema: "beta/participant-record.schema.json",
      minimumIndependentParticipants: 5,
      syntheticTemplateCounts: false,
      privacyMinimized: true,
    },
    null,
    2,
  )}\n`,
);
