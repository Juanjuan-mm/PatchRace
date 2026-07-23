import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const required = [
  "docs/SECURITY_REVIEW.md",
  "docs/THREAT_MODEL.md",
  "packages/core/src/safety.ts",
  "packages/core/src/artifacts.test.ts",
  "packages/core/src/cleanup.test.ts",
  ".changeset/qa-06-no-follow-artifacts.md",
];
for (const path of required)
  assert(existsSync(resolve(root, path)), `missing QA-06 artifact ${path}`);

const review = read("docs/SECURITY_REVIEW.md");
for (let index = 1; index <= 15; index += 1) {
  const id = `T-${String(index).padStart(2, "0")}`;
  assert(review.includes(`\`${id}\``), `security matrix does not cover ${id}`);
}
for (const attackClass of [
  "Command injection",
  "Path traversal and symlink/hard-link escape",
  "Malicious repository",
  "Secrets and auth",
  "Generated Skill/instructions",
  "Package/supply chain",
  "Cleanup and recovery",
])
  assert(
    review.includes(`| ${attackClass} |`),
    `security review omits ${attackClass}`,
  );
assert(
  review.includes("QA06-F01") &&
    review.includes("Fixed.") &&
    review.includes("No unresolved critical or high security defect is known"),
  "security finding disposition is incomplete",
);

const threatModel = read("docs/THREAT_MODEL.md");
assert(
  threatModel.includes("## QA-06 implementation security review") &&
    threatModel.includes("[SECURITY_REVIEW.md](SECURITY_REVIEW.md)") &&
    threatModel.includes("not a sandbox"),
  "threat model lacks the QA-06 implementation review or sandbox boundary",
);

const safety = read("packages/core/src/safety.ts");
assert(
  safety.includes("O_NOFOLLOW") &&
    safety.includes("info.isFile()") &&
    safety.includes("info.nlink !== 1"),
  "owned file opens do not enforce no-follow regular single-link files",
);
const artifacts = read("packages/core/src/artifacts.ts");
const recovery = read("packages/core/src/recovery.ts");
const cleanup = read("packages/core/src/cleanup.ts");
for (const [label, source] of [
  ["artifacts", artifacts],
  ["recovery", recovery],
  ["cleanup", cleanup],
])
  assert(
    source.includes("readRegularFileNoFollow") ||
      source.includes("openRegularFileNoFollow"),
    `${label} does not use no-follow owned-file operations`,
  );
assert(
  cleanup.includes("CLEANUP_OWNERSHIP_CHANGED") &&
    cleanup.includes("Validate every non-worktree target before deleting"),
  "cleanup lacks execution-time ownership validation before deletion",
);

const processSource = read("packages/core/src/process.ts");
const bridgeSource = read("packages/pi-extension/src/bridge.ts");
assert(
  processSource.includes("shell: false") &&
    bridgeSource.includes("shell: false"),
  "normal process or Pi bridge execution is not explicitly no-shell",
);

function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const target = resolve(path, entry.name);
    if (entry.isDirectory()) return entry.name === "dist" ? [] : walk(target);
    return entry.isFile() ? [target] : [];
  });
}

const productionTypeScript = walk(resolve(root, "packages")).filter(
  (path) => path.endsWith(".ts") && !path.endsWith(".test.ts"),
);
for (const path of productionTypeScript) {
  const matches = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => /\bshell\s*:\s*true\b/u.test(line))
    .filter(
      (line) =>
        !(
          relative(root, path) === "packages/contracts/src/task.ts" &&
          line.includes("properties:")
        ),
    );
  assert(
    matches.length === 0,
    `production shell:true found in ${relative(root, path)}`,
  );
}

const manifestPaths = [
  resolve(root, "package.json"),
  ...readdirSync(resolve(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(root, "packages", entry.name, "package.json"))
    .filter((path) => existsSync(path) && statSync(path).isFile()),
];
for (const path of manifestPaths) {
  const scripts = JSON.parse(readFileSync(path, "utf8")).scripts ?? {};
  for (const lifecycle of ["preinstall", "install", "postinstall", "prepare"])
    assert(
      scripts[lifecycle] === undefined,
      `${relative(root, path)} has install lifecycle script ${lifecycle}`,
    );
}

const reportSources = [
  read("packages/report/src/index.ts"),
  read("packages/report/src/diagnosis.ts"),
  read("packages/report/src/candidate-review.ts"),
];
assert(
  reportSources.every(
    (source) =>
      source.includes("default-src 'none'") &&
      !/<script(?:\s|>)/iu.test(source),
  ),
  "an HTML report lacks default-deny CSP or embeds script",
);

const generation = read("packages/optimizer/src/generation.ts");
const recommendations = read("packages/optimizer/src/recommendations.ts");
assert(
  generation.includes("executable") &&
    generation.includes("secret") &&
    recommendations.includes("manual"),
  "generated candidates do not retain executable/secret/manual boundaries",
);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      task: "QA-06",
      threats: 15,
      findingsFixed: 1,
      unresolvedCriticalOrHigh: 0,
      productionFilesScanned: productionTypeScript.length,
      packageManifestsScanned: manifestPaths.length,
      installLifecycleScripts: 0,
      normalShellExecution: false,
      sandboxClaim: false,
    },
    null,
    2,
  )}\n`,
);
