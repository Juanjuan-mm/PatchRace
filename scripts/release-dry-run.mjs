import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { packageManagerCommand } from "./package-manager-command.mjs";

const root = resolve(import.meta.dirname, "..");
const packageRoot = join(root, "packages");
const outputRoot = join(root, ".artifacts", "packages");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const run = (command, args, options = {}) => {
  const invocation = packageManagerCommand(command, args);
  const result = spawnSync(invocation.executable, invocation.args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  return result.stdout;
};
const tarText = (tarball, entry) =>
  run("tar", ["-xOf", tarball, entry], { maxBuffer: 64 * 1024 * 1024 });
const sha256File = (path) =>
  `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;

if (existsSync(outputRoot))
  rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

run("pnpm", ["build"], { stdio: "inherit" });

const sourcePackages = new Map();
for (const directory of readdirSync(packageRoot).sort()) {
  const workingDirectory = join(packageRoot, directory);
  const packageJsonPath = join(workingDirectory, "package.json");
  if (!existsSync(packageJsonPath)) continue;
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (packageJson.private === true) continue;
  run("pnpm", ["pack", "--pack-destination", outputRoot], {
    cwd: workingDirectory,
  });
  sourcePackages.set(packageJson.name, packageJson);
}

const tarballs = readdirSync(outputRoot)
  .filter((name) => name.endsWith(".tgz"))
  .sort();
assert(
  tarballs.length === sourcePackages.size,
  `expected ${sourcePackages.size} tarballs, found ${tarballs.length}`,
);

const forbiddenText = [
  { name: "personal macOS path", pattern: /\/Users\/[^/\s]+/u },
  { name: "personal Linux path", pattern: /\/home\/[^/\s]+/u },
  { name: "personal Windows path", pattern: /[A-Za-z]:\\Users\\/u },
  {
    name: "private key marker",
    pattern: /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/u,
  },
  {
    name: "credential-shaped literal",
    pattern:
      /\b(?:AKIA[A-Z0-9]{16}|gh[oprsu]_[A-Za-z0-9]{20,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,})\b/u,
  },
  { name: "raw run path", pattern: /\.patchrace\/runs\//u },
];
const audit = [];

for (const tarballName of tarballs) {
  const tarball = join(outputRoot, tarballName);
  const entries = run("tar", ["-tzf", tarball])
    .split("\n")
    .filter(Boolean)
    .sort();
  const packedManifest = JSON.parse(tarText(tarball, "package/package.json"));
  const sourceManifest = sourcePackages.get(packedManifest.name);
  assert(sourceManifest !== undefined, `${tarballName} has an unknown package`);
  assert(
    packedManifest.version === sourceManifest.version,
    `${packedManifest.name} packed version drifted`,
  );
  assert(
    packedManifest.license === "Apache-2.0" &&
      packedManifest.type === "module" &&
      packedManifest.publishConfig?.access === "public" &&
      packedManifest.publishConfig?.provenance === true,
    `${packedManifest.name} lacks release license/ESM/public provenance metadata`,
  );
  for (const required of [
    "package/package.json",
    "package/LICENSE",
    "package/README.md",
    "package/dist/index.js",
    "package/dist/index.d.ts",
  ])
    assert(
      entries.includes(required),
      `${packedManifest.name} omits ${required}`,
    );
  if (packedManifest.name === "@patchrace/contracts")
    for (const schema of [
      "package/schemas/suite-v1.json",
      "package/schemas/task-v1.json",
      "package/schemas/trace-event-v1.json",
    ])
      assert(
        entries.includes(schema),
        `${packedManifest.name} omits ${schema}`,
      );

  const forbiddenEntries = entries.filter(
    (entry) =>
      !/^package\/(?:package\.json|README\.md|LICENSE|dist\/[^/].*|schemas\/[^/]+\.json)$/u.test(
        entry,
      ) ||
      entry.includes(".test.") ||
      entry.endsWith(".tsbuildinfo") ||
      entry.includes("node_modules") ||
      entry.includes("fixtures/") ||
      entry.includes(".artifacts/") ||
      /package\/dist\/.*(?<!\.d)\.ts$/u.test(entry),
  );
  assert(
    forbiddenEntries.length === 0,
    `${packedManifest.name} contains forbidden entries: ${forbiddenEntries.join(", ")}`,
  );

  const dependencies = {
    ...packedManifest.dependencies,
    ...packedManifest.optionalDependencies,
    ...packedManifest.peerDependencies,
  };
  for (const [name, specifier] of Object.entries(dependencies)) {
    assert(
      !String(specifier).startsWith("workspace:") &&
        !String(specifier).startsWith("catalog:"),
      `${packedManifest.name} did not rewrite ${name}`,
    );
  }
  for (const lifecycle of ["preinstall", "install", "postinstall", "prepare"])
    assert(
      packedManifest.scripts?.[lifecycle] === undefined,
      `${packedManifest.name} contains install lifecycle ${lifecycle}`,
    );

  const maps = entries.filter((entry) => entry.endsWith(".map"));
  const textEntries = entries.filter(
    (entry) =>
      entry === "package/package.json" ||
      entry === "package/README.md" ||
      entry.startsWith("package/dist/") ||
      entry.startsWith("package/schemas/"),
  );
  for (const entry of textEntries) {
    const content = tarText(tarball, entry);
    for (const forbidden of forbiddenText)
      assert(
        !forbidden.pattern.test(content),
        `${packedManifest.name} ${entry} contains ${forbidden.name}`,
      );
    if (entry.endsWith(".map")) {
      const map = JSON.parse(content);
      assert(
        map.sourcesContent === undefined,
        `${packedManifest.name} ${entry} embeds source content`,
      );
      assert(
        Array.isArray(map.sources) &&
          map.sources.every(
            (source) =>
              typeof source === "string" &&
              !source.startsWith("/") &&
              !/^[A-Za-z]:\\/u.test(source),
          ),
        `${packedManifest.name} ${entry} contains an absolute source path`,
      );
    }
  }
  if (packedManifest.name === "patchrace") {
    assert(
      packedManifest.bin?.patchrace === "./dist/main.js",
      "patchrace bin does not target dist/main.js",
    );
    assert(
      tarText(tarball, "package/dist/main.js").startsWith(
        "#!/usr/bin/env node",
      ),
      "patchrace binary lacks the Node shebang",
    );
  }

  audit.push({
    name: packedManifest.name,
    version: packedManifest.version,
    tarball: basename(tarball),
    hash: sha256File(tarball),
    size: readFileSync(tarball).byteLength,
    entries: entries.length,
    sourceMaps: maps.length,
    provenanceConfigured: true,
  });
}

const report = {
  schemaVersion: "1.0.0",
  packages: audit.sort((left, right) => left.name.localeCompare(right.name)),
  published: false,
  registryVersion: null,
  note: "Local release-candidate tarballs only; registry publication and signed provenance require the protected launch workflow.",
};
writeFileSync(
  join(root, ".artifacts", "release-packages.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(
  `release dry run audited ${audit.length} packages and wrote .artifacts/release-packages.json\n`,
);
