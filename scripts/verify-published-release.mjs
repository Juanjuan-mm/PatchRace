import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const local = JSON.parse(
  readFileSync(resolve(root, ".artifacts", "release-packages.json"), "utf8"),
);
const wait = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function fetchWithRetry(url, accept) {
  let lastError;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const response = await globalThis.fetch(url, {
        headers: {
          accept,
          "user-agent": "patchrace-release-verifier/1.0.0",
        },
        signal: globalThis.AbortSignal.timeout(30_000),
      });
      if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 12) await wait(Math.min(30_000, attempt * 2_000));
    }
  }
  throw new Error(`Registry request failed for ${url}.`, { cause: lastError });
}

const checked = [];
for (const entry of local.packages) {
  const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(entry.name)}/${encodeURIComponent(entry.version)}`;
  const metadata = await (
    await fetchWithRetry(metadataUrl, "application/json")
  ).json();
  assert(
    metadata.name === entry.name && metadata.version === entry.version,
    `Registry identity mismatch for ${entry.name}@${entry.version}.`,
  );
  assert(
    metadata.repository?.url ===
      "git+https://github.com/Juanjuan-mm/PatchRace.git",
    `Registry repository mismatch for ${entry.name}.`,
  );
  const tarball = Buffer.from(
    await (
      await fetchWithRetry(metadata.dist.tarball, "application/octet-stream")
    ).arrayBuffer(),
  );
  const hash = `sha256:${createHash("sha256").update(tarball).digest("hex")}`;
  assert(
    hash === entry.hash,
    `Published tarball hash mismatch for ${entry.name}.`,
  );
  assert(
    typeof metadata.dist.integrity === "string" &&
      metadata.dist.integrity.startsWith("sha512-"),
    `Registry integrity is unavailable for ${entry.name}.`,
  );
  checked.push({
    name: entry.name,
    version: entry.version,
    hash,
    integrity: metadata.dist.integrity,
    tarball: metadata.dist.tarball,
  });
}

const report = {
  schemaVersion: "1.0.0",
  status: "PASS",
  registry: "https://registry.npmjs.org",
  checkedAt: new Date().toISOString(),
  packages: checked.sort((left, right) => left.name.localeCompare(right.name)),
};
writeFileSync(
  resolve(root, ".artifacts", "published-release.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(
  `${JSON.stringify({ status: "PASS", packages: checked.length })}\n`,
);
