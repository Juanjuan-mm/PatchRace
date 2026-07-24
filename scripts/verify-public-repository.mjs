import { execFile } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const { stdout } = await execute(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "buffer" },
);
const candidates = stdout.toString("utf8").split("\0").filter(Boolean).sort();
const files = [];
for (const path of candidates) {
  try {
    if ((await stat(resolve(root, path))).isFile()) files.push(path);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const forbiddenExact = new Set([
  "docs/DECISIONS.md",
  "docs/EXECUTION_PLAN.md",
  "docs/MAINTENANCE.md",
  "docs/PROGRESS.md",
  "docs/RISKS.md",
  "docs/SESSION_LOG.md",
  "docs/SUCCESS_CRITERIA.md",
  "docs/TASKS.md",
]);
const forbiddenPrefixes = ["beta/", "spikes/"];
const forbiddenNamePatterns = [
  /^docs\/M\d+_/u,
  /^docs\/PRIVATE_BETA_/u,
  /^docs\/BETA_/u,
  /^docs\/GITHUB_PREVIEW\.md$/u,
];
for (const path of files) {
  if (
    forbiddenExact.has(path) ||
    forbiddenPrefixes.some((prefix) => path.startsWith(prefix)) ||
    forbiddenNamePatterns.some((pattern) => pattern.test(path))
  )
    throw new Error(`Internal planning artifact is public: ${path}`);
}

const textExtensions = new Set([
  "",
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonl",
  ".md",
  ".mjs",
  ".sh",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);
const privatePatterns = [
  ["/Users/jms/", "private absolute home path"],
  ["patchrace-deepseek-api-key", "credential-store lookup metadata"],
  ["security find-generic-password", "credential-store command"],
  ["Independent-user beta remains", "internal beta status"],
  ["at the owner's direction", "private operator decision"],
  ["owner explicitly chose", "private operator decision"],
];
let textFilesScanned = 0;
for (const path of files) {
  if (!textExtensions.has(extname(path))) continue;
  if (path === "scripts/verify-public-repository.mjs") continue;
  const content = await readFile(resolve(root, path), "utf8");
  if (content.includes("\0")) continue;
  textFilesScanned += 1;
  for (const [needle, label] of privatePatterns)
    if (content.includes(needle))
      throw new Error(`${path} contains ${label}: ${needle}`);
}

const markdownFiles = files.filter((path) => path.endsWith(".md"));
let localLinksChecked = 0;
for (const path of markdownFiles) {
  const content = await readFile(resolve(root, path), "utf8");
  for (const match of content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">"))
      target = target.slice(1, -1);
    target = target.split(/\s+"/u, 1)[0].split("#", 1)[0];
    if (
      target.length === 0 ||
      target.startsWith("#") ||
      /^[a-z][a-z0-9+.-]*:/iu.test(target)
    )
      continue;
    if (target.startsWith("/"))
      throw new Error(`${path} contains an absolute Markdown link: ${target}`);
    const resolved = resolve(root, dirname(path), decodeURIComponent(target));
    if (resolved !== root && !resolved.startsWith(`${root}${sep}`))
      throw new Error(`${path} contains an escaping Markdown link: ${target}`);
    await access(resolved).catch(() => {
      throw new Error(`${path} contains a broken local link: ${target}`);
    });
    localLinksChecked += 1;
  }
}

const publicPackagePaths = files.filter((path) =>
  /^packages\/[^/]+\/package\.json$/u.test(path),
);
for (const path of publicPackagePaths) {
  const manifest = JSON.parse(await readFile(resolve(root, path), "utf8"));
  if (manifest.version !== "0.1.0")
    throw new Error(`${path} has unexpected version ${manifest.version}.`);
}
if (publicPackagePaths.length !== 9)
  throw new Error(
    `Expected 9 public packages, found ${publicPackagePaths.length}.`,
  );

const readme = await readFile(resolve(root, "README.md"), "utf8");
if (!readme.includes("`v0.1.0`"))
  throw new Error("README does not identify v0.1.0.");

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      filesChecked: files.length,
      textFilesScanned,
      markdownFiles: markdownFiles.length,
      localLinksChecked,
      publicPackages: publicPackagePaths.length,
      internalPlanningArtifacts: 0,
      privateOperationalMetadata: 0,
    },
    null,
    2,
  )}\n`,
);
