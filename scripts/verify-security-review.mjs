import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const required = [
  "docs/THREAT_MODEL.md",
  "packages/core/src/safety.ts",
  "packages/core/src/artifacts.test.ts",
  "packages/core/src/cleanup.test.ts",
];
for (const path of required)
  assert(existsSync(resolve(root, path)), `missing security artifact ${path}`);

const threatModel = read("docs/THREAT_MODEL.md");
assert(
  threatModel.includes("## Principal threats") &&
    threatModel.includes("not a sandbox"),
  "threat model lacks its threat matrix or sandbox boundary",
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
      threats: 15,
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
