import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const requireFromCore = createRequire(
  resolve(root, "packages", "core", "package.json"),
);
const { parse } = requireFromCore("yaml");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const rootManifest = JSON.parse(read("package.json"));
assert(
  /^pnpm@10\.34\.5\+sha512\./u.test(rootManifest.packageManager),
  "pnpm is not exact integrity-pinned",
);
assert(
  rootManifest.pnpm?.minimumReleaseAge === 1440 &&
    Array.isArray(rootManifest.pnpm?.onlyBuiltDependencies) &&
    rootManifest.pnpm.onlyBuiltDependencies.length === 0,
  "release-age or lifecycle-script policy drifted",
);
assert(
  read(".npmrc").includes("strict-peer-dependencies=true") &&
    read(".npmrc").includes("verify-store-integrity=true"),
  "pnpm peer/store integrity policy drifted",
);

const lock = parse(read("pnpm-lock.yaml"));
const lockPackages = Object.entries(lock.packages ?? {});
const missingIntegrity = lockPackages
  .filter(([, value]) => value.resolution?.integrity === undefined)
  .map(([name]) => name);
assert(
  missingIntegrity.length === 0,
  `lock entries lack registry integrity: ${missingIntegrity.join(", ")}`,
);

const manifests = readdirSync(resolve(root, "packages"), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => join("packages", entry.name, "package.json"))
  .filter((path) => existsSync(resolve(root, path)))
  .map((path) => ({ path, value: JSON.parse(read(path)) }))
  .filter(({ value }) => value.private !== true);
assert(
  manifests.length === 9,
  `expected 9 public packages, found ${manifests.length}`,
);
for (const { path, value } of manifests) {
  assert(
    value.license === "Apache-2.0" &&
      value.type === "module" &&
      value.engines?.node === ">=22.22.0 <25" &&
      value.publishConfig?.access === "public" &&
      value.publishConfig?.provenance === true,
    `${path} release metadata drifted`,
  );
  for (const lifecycle of ["preinstall", "install", "postinstall", "prepare"])
    assert(
      value.scripts?.[lifecycle] === undefined,
      `${path} has ${lifecycle}`,
    );
}
const changesets = JSON.parse(read(".changeset/config.json"));
const manifestNames = manifests.map(({ value }) => value.name).sort();
assert(
  changesets.fixed?.length === 1 &&
    changesets.fixed[0].length === manifests.length &&
    changesets.fixed[0]
      .slice()
      .sort()
      .every((name, index) => name === manifestNames[index]),
  "Changesets fixed release group does not match all public packages",
);
const dependabot = read(".github/dependabot.yml");
assert(
  dependabot.includes("package-ecosystem: npm") &&
    dependabot.includes("package-ecosystem: github-actions") &&
    dependabot.includes("open-pull-requests-limit:"),
  "bounded npm/Actions dependency updates are not configured",
);

for (const workflow of [
  ".github/workflows/ci.yml",
  ".github/workflows/supply-chain.yml",
]) {
  const source = read(workflow);
  const actionUses = [...source.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/gu)];
  assert(actionUses.length > 0, `${workflow} has no actions`);
  assert(
    actionUses.every((match) => /^[a-f0-9]{40}$/u.test(match[1])),
    `${workflow} contains an action not pinned to a full commit`,
  );
  assert(
    source.includes("persist-credentials: false") &&
      source.includes("permissions:"),
    `${workflow} lacks least-privilege checkout controls`,
  );
}

const licenses = JSON.parse(read(".artifacts/licenses.json"));
assert(
  licenses.packages.length === 7 && licenses.developmentPackages.length >= 240,
  "license inventory is incomplete",
);
const productionLicenseIds = [
  ...new Set(licenses.packages.map((entry) => entry.license)),
].sort();
assert(
  productionLicenseIds.every((license) =>
    ["BSD-3-Clause", "ISC", "MIT"].includes(license),
  ),
  "production graph requires an unreviewed notice/license decision",
);

const packReport = JSON.parse(read(".artifacts/release-packages.json"));
assert(
  packReport.packages.length === 9 &&
    packReport.published === false &&
    packReport.packages.every(
      (entry) =>
        /^sha256:[a-f0-9]{64}$/u.test(entry.hash) &&
        entry.provenanceConfigured === true,
    ),
  "release package report is incomplete",
);

const report = {
  schemaVersion: "1.0.0",
  publicPackages: manifests.length,
  lockRegistryEntries: lockPackages.length,
  lockEntriesMissingIntegrity: missingIntegrity.length,
  productionDependencies: licenses.packages.length,
  installedDevelopmentPackages: licenses.developmentPackages.length,
  productionLicenseIds,
  noticeRequired: false,
  installLifecycleScripts: 0,
  shaPinnedWorkflows: 2,
  fixedReleaseGroupPackages: manifests.length,
  dependencyUpdateEcosystems: ["npm", "github-actions"],
  tarballs: packReport.packages,
  published: false,
  publicationDeferred: true,
  signedProvenanceDeferred: true,
};
writeFileSync(
  resolve(root, ".artifacts", "qa-release-audit.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(
  `${JSON.stringify({ status: "PASS", ...report }, null, 2)}\n`,
);
