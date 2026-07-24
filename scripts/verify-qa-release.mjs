import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const path of [
  "scripts/release-dry-run.mjs",
  "scripts/check-licenses.mjs",
  "scripts/audit-release.mjs",
  ".artifacts/release-packages.json",
  ".artifacts/licenses.json",
  ".artifacts/qa-release-audit.json",
])
  assert(existsSync(resolve(root, path)), `missing release evidence ${path}`);

const audit = JSON.parse(read(".artifacts/qa-release-audit.json"));
assert(
  audit.publicPackages === 9 &&
    audit.lockRegistryEntries === 274 &&
    audit.lockEntriesMissingIntegrity === 0 &&
    audit.productionDependencies === 7 &&
    audit.installedDevelopmentPackages >= 240 &&
    audit.noticeRequired === false &&
    audit.installLifecycleScripts === 0 &&
    audit.tarballs.length === 9 &&
    audit.published === false,
  "local release audit summary is incomplete",
);
const packer = read("scripts/release-dry-run.mjs");
for (const control of [
  "forbiddenEntries",
  "sourcesContent",
  "workspace:",
  "catalog:",
  "private key marker",
  "credential-shaped literal",
  "provenanceConfigured",
])
  assert(packer.includes(control), `package audit lacks ${control}`);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      publicPackages: audit.publicPackages,
      lockRegistryEntries: audit.lockRegistryEntries,
      productionDependencies: audit.productionDependencies,
      installedDevelopmentPackages: audit.installedDevelopmentPackages,
      noticeRequired: audit.noticeRequired,
      published: false,
      signedProvenanceClaimed: false,
    },
    null,
    2,
  )}\n`,
);
