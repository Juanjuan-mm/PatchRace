import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const requireFromCore = createRequire(
  resolve(root, "packages", "core", "package.json"),
);
const { parse } = requireFromCore("yaml");
const lock = parse(readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8"));
const licenses = JSON.parse(
  readFileSync(resolve(root, ".artifacts", "licenses.json"), "utf8"),
);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function registryMetadata(entry) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await globalThis.fetch(
        `https://registry.npmjs.org/${encodeURIComponent(entry.name)}/${encodeURIComponent(entry.version)}`,
        {
          headers: {
            accept: "application/json",
            "user-agent": "patchrace-qa-release-audit/0.0.0",
          },
          signal: globalThis.AbortSignal.timeout(30_000),
        },
      );
      assert(
        response.ok,
        `registry metadata failed for ${entry.name}: ${response.status}`,
      );
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `registry metadata failed for ${entry.name} after 3 attempts`,
    {
      cause: lastError,
    },
  );
}

const results = await Promise.all(
  licenses.packages.map(async (entry) => {
    const lockEntry = lock.packages?.[`${entry.name}@${entry.version}`];
    assert(lockEntry !== undefined, `lock entry missing for ${entry.name}`);
    const metadata = await registryMetadata(entry);
    assert(
      metadata.name === entry.name &&
        metadata.version === entry.version &&
        metadata.dist?.integrity === lockEntry.resolution?.integrity,
      `registry integrity mismatch for ${entry.name}@${entry.version}`,
    );
    assert(
      metadata.license === entry.license,
      `registry license mismatch for ${entry.name}@${entry.version}`,
    );
    return {
      name: entry.name,
      version: entry.version,
      integrity: metadata.dist.integrity,
      license: metadata.license,
      registry: "https://registry.npmjs.org",
    };
  }),
);

const report = {
  schemaVersion: "1.0.0",
  checked: results,
  checkedAt: new Date().toISOString(),
  registry: "https://registry.npmjs.org",
};
writeFileSync(
  resolve(root, ".artifacts", "registry-provenance.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(
  `${JSON.stringify(
    {
      status: "PASS",
      packages: results.length,
      registry: report.registry,
      lockIntegrityMatched: true,
    },
    null,
    2,
  )}\n`,
);
