import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const path of [
  "docs/QA_RELEASE_AUDIT.md",
  "scripts/release-dry-run.mjs",
  "scripts/check-licenses.mjs",
  "scripts/audit-release.mjs",
  "scripts/verify-registry-provenance.mjs",
  ".artifacts/release-packages.json",
  ".artifacts/licenses.json",
  ".artifacts/qa-release-audit.json",
  ".artifacts/registry-provenance.json",
])
  assert(existsSync(resolve(root, path)), `missing QA-08 evidence ${path}`);

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
const registry = JSON.parse(read(".artifacts/registry-provenance.json"));
assert(
  registry.checked.length === 7 &&
    registry.registry === "https://registry.npmjs.org" &&
    registry.checked.every(
      (entry) =>
        /^sha512-/u.test(entry.integrity) &&
        ["BSD-3-Clause", "ISC", "MIT"].includes(entry.license),
    ),
  "registry provenance evidence is incomplete",
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

const review = read("docs/QA_RELEASE_AUDIT.md");
for (const [label, pattern] of [
  ["advisory result", /no known high or critical npm advisories/iu],
  ["publication boundary", /Publication performed: no/u],
  ["source-map count", /All 208 published source maps/u],
  ["NOTICE decision", /A project `NOTICE`\s+file/u],
  ["attestation deferral", /actual signed attestations/u],
  ["point-in-time boundary", /point-in-time external evidence/u],
])
  assert(pattern.test(review), `release review omits ${label}`);
assert(
  review.includes("0.0.0") &&
    review.includes("LCH-06") &&
    review.includes("LCH-08"),
  "release review hides unpublished/version/provenance deferrals",
);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      task: "QA-08",
      publicPackages: audit.publicPackages,
      lockRegistryEntries: audit.lockRegistryEntries,
      productionDependencies: audit.productionDependencies,
      installedDevelopmentPackages: audit.installedDevelopmentPackages,
      registryIntegrityMatches: registry.checked.length,
      noticeRequired: audit.noticeRequired,
      published: false,
      signedProvenanceClaimed: false,
    },
    null,
    2,
  )}\n`,
);
