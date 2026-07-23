import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const ignoredDirectories = new Set([
  ".artifacts",
  ".git",
  ".pnpm-store",
  "coverage",
  "dist",
  "node_modules",
]);

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const packageDirectories = readdirSync(resolve(root, "packages"), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const manifests = packageDirectories
  .map((directory) => ({
    path: join("packages", directory, "package.json"),
    value: JSON.parse(read(join("packages", directory, "package.json"))),
  }))
  .filter(({ value }) => value.private !== true);
assert(
  manifests.length === 9,
  `expected 9 public packages, found ${manifests.length}`,
);

const versions = new Set(manifests.map(({ value }) => value.version));
assert(versions.size === 1, "public package versions are not aligned");
const [version] = versions;
assert(
  typeof version === "string" && /^0\.1\.0-rc\.\d+$/u.test(version),
  `expected a v0.1 release candidate, found ${String(version)}`,
);
for (const { path, value } of manifests)
  assert(
    value.repository?.url ===
      "git+https://github.com/songjinmiao/PatchRace.git" &&
      value.homepage === "https://github.com/songjinmiao/PatchRace#readme" &&
      value.bugs?.url === "https://github.com/songjinmiao/PatchRace/issues",
    `${path} does not identify the public source and issue tracker`,
  );

const cliVersion = spawnSync(
  process.execPath,
  [resolve(root, "packages/cli/dist/main.js"), "--version"],
  { encoding: "utf8" },
);
assert(
  cliVersion.status === 0 && cliVersion.stdout.trim() === version,
  `compiled CLI version drifted: ${cliVersion.stderr || cliVersion.stdout}`,
);

for (const { path } of manifests) {
  const changelog = join(dirname(path), "CHANGELOG.md");
  assert(
    existsSync(resolve(root, changelog)) &&
      read(changelog).includes(`## ${version}`),
    `${changelog} does not record ${version}`,
  );
}

for (const path of [
  "README.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  `docs/releases/v${version}.md`,
  "docs/M10_RELEASE_CANDIDATE.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
]) {
  assert(
    existsSync(resolve(root, path)),
    `missing release-candidate file ${path}`,
  );
}

const readme = read("README.md");
for (const claim of [
  version,
  "source-only GitHub preview",
  "not a stable or beta-validated release",
  "0/5",
  "Worktrees isolate Git state; they do not sandbox",
  "no PatchRace telemetry",
])
  assert(readme.includes(claim), `README omits preview boundary: ${claim}`);

const tasks = read("docs/TASKS.md");
assert(
  /\| `BETA-02` .*\| DROPPED \|/u.test(tasks) &&
    /\| `BETA-03` .*\| DROPPED \|/u.test(tasks) &&
    /\| `QA-09` .*\| (?:DOING|DONE) \|/u.test(tasks),
  "M10 task states do not reflect ADR-022 and QA-09",
);
for (const path of [
  "docs/DECISIONS.md",
  "docs/PROGRESS.md",
  "docs/RISKS.md",
  "docs/SUCCESS_CRITERIA.md",
])
  assert(
    read(path).includes("ADR-022"),
    `${path} omits the independent-beta waiver`,
  );

for (const path of ["SECURITY.md", "CODE_OF_CONDUCT.md"]) {
  const source = read(path);
  assert(
    source.includes("Security") &&
      source.includes("Report a vulnerability") &&
      !source.includes("[INSERT"),
    `${path} lacks a concrete private reporting route`,
  );
}

const markdownFiles = listFiles(root).filter(
  (path) => extname(path).toLowerCase() === ".md",
);
const brokenLinks = [];
for (const path of markdownFiles) {
  const source = readFileSync(path, "utf8");
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">"))
      target = target.slice(1, -1);
    target = target.split(/\s+"/u)[0].split("#", 1)[0];
    if (
      target.length === 0 ||
      target.startsWith("#") ||
      /^(?:https?:|mailto:)/u.test(target)
    )
      continue;
    const decoded = decodeURIComponent(target);
    const resolved = resolve(dirname(path), decoded);
    if (!existsSync(resolved))
      brokenLinks.push(`${relative(root, path)} -> ${target}`);
  }
}
assert(
  brokenLinks.length === 0,
  `broken local Markdown links: ${brokenLinks.join(", ")}`,
);

const publicTextFiles = [
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  ...markdownFiles
    .map((path) => relative(root, path))
    .filter((path) => path.startsWith("docs/")),
];
const forbiddenPublicText = [
  { name: "personal macOS path", pattern: /\/Users\/[^/\s]+\//u },
  { name: "personal Linux path", pattern: /\/home\/[^/\s]+\//u },
  {
    name: "personal Windows path",
    pattern: /[A-Za-z]:\\Users\\[^\\\s]+\\/u,
  },
  {
    name: "credential-shaped literal",
    pattern:
      /\b(?:AKIA[A-Z0-9]{16}|gh[oprsu]_[A-Za-z0-9]{20,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,})\b/u,
  },
  {
    name: "private key marker",
    pattern: /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/u,
  },
];
for (const path of [...new Set(publicTextFiles)]) {
  const source = read(path);
  for (const forbidden of forbiddenPublicText)
    assert(
      !forbidden.pattern.test(source),
      `${path} contains ${forbidden.name}`,
    );
}

for (const forbidden of [
  ".artifacts",
  ".patchrace/runs",
  ".patchrace/worktrees",
  "coverage",
])
  assert(
    !existsSync(resolve(root, forbidden)) ||
      statSync(resolve(root, forbidden)).isDirectory(),
    `${forbidden} has an unexpected release-source type`,
  );

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      task: "QA-09",
      version,
      publicPackages: manifests.length,
      markdownFiles: markdownFiles.length,
      brokenLinks: 0,
      independentBetaParticipants: 0,
      independentBetaWaivedForPreviewOnly: true,
      npmPublished: false,
    },
    null,
    2,
  )}\n`,
);
