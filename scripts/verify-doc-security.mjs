import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const guide = await readFile(
  join(root, "docs", "SECURITY_PRIVACY_AND_CLEANUP.md"),
  "utf8",
);
const normalizedGuide = guide.replaceAll(/\s+/g, " ");

const required = [
  "not a sandbox",
  "do not isolate the filesystem, processes, credentials, network",
  "normal local authentication",
  "local-sensitive",
  "report/shareable/",
  "Redaction is risk reduction, not a guarantee.",
  "has no upload endpoint",
  "patchrace clean --run run_01J... --dry-run",
  "patchrace clean --run run_01J... --worktrees --confirm",
  "patchrace clean --run run_01J... --artifacts --confirm",
  "patchrace clean --cache --older-than 30d --confirm",
  "retention is the safe outcome",
  "Security or privacy incident",
  "do not attach raw runs",
  "private reporting",
  "SECURITY.md",
  "Report a vulnerability",
  "never performs automatically",
  "retry a paid Agent call",
  "change global Pi state, commit, or push",
];
for (const phrase of required)
  if (!normalizedGuide.includes(phrase))
    throw new Error(`Security guide omits required boundary: ${phrase}`);

for (const [source, boundary] of [
  ["docs/SECURITY_REVIEW.md", "not a sandbox"],
  ["docs/QA_PRIVACY_REVIEW.md", "Every public export requires human review."],
  ["docs/THREAT_MODEL.md", "not a sandbox"],
]) {
  const content = await readFile(join(root, source), "utf8");
  if (!content.replaceAll(/\s+/g, " ").includes(boundary))
    throw new Error(`${source} no longer contains '${boundary}'.`);
}

const cliContract = await readFile(
  join(root, "docs", "architecture", "CLI_AND_CONFIG.md"),
  "utf8",
);
for (const command of [
  "patchrace clean --run run_01J... --dry-run",
  "patchrace clean --run run_01J... --worktrees --confirm",
  "patchrace clean --cache --older-than 30d --confirm",
])
  if (!cliContract.includes(command))
    throw new Error(`CLI contract no longer contains '${command}'.`);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      document: "docs/SECURITY_PRIVACY_AND_CLEANUP.md",
      trustBoundary: "not-a-sandbox",
      cleanupCommandsChecked: 4,
      incidentProcedure: true,
      automaticActionsDenied: true,
      reportingLimitationVisible: true,
    },
    null,
    2,
  )}\n`,
);
