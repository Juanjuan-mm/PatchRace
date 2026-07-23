import { readFileSync } from "node:fs";

interface PackageManifest {
  readonly version?: unknown;
}

function readPackageVersion(): string {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as PackageManifest;
  if (
    typeof manifest.version !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(manifest.version)
  )
    throw new Error("patchrace package.json contains an invalid version");
  return manifest.version;
}

export const PATCHRACE_VERSION = readPackageVersion();
