import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageRoot = join(root, "packages");
const queue = [];
const seen = new Map();

function resolvePackageJson(dependency, from) {
  const requireFromParent = createRequire(from);
  try {
    return requireFromParent.resolve(`${dependency}/package.json`);
  } catch (error) {
    if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
    let directory = dirname(requireFromParent.resolve(dependency));
    while (directory !== dirname(directory)) {
      const candidate = join(directory, "package.json");
      if (existsSync(candidate)) {
        const packageJson = JSON.parse(readFileSync(candidate, "utf8"));
        if (packageJson.name === dependency) return candidate;
      }
      directory = dirname(directory);
    }
    throw error;
  }
}

for (const directory of readdirSync(packageRoot).sort()) {
  const packageJsonPath = join(packageRoot, directory, "package.json");
  if (!existsSync(packageJsonPath)) continue;
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  for (const dependency of Object.keys({
    ...packageJson.dependencies,
    ...packageJson.optionalDependencies,
  })) {
    if (!dependency.startsWith("@patchrace/")) {
      queue.push({ dependency, from: packageJsonPath });
    }
  }
}

while (queue.length > 0) {
  const item = queue.shift();
  if (seen.has(item.dependency)) continue;
  const packageJsonPath = resolvePackageJson(item.dependency, item.from);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const license = packageJson.license ?? packageJson.licenses ?? null;
  seen.set(item.dependency, {
    name: packageJson.name,
    version: packageJson.version,
    license,
  });
  for (const dependency of Object.keys({
    ...packageJson.dependencies,
    ...packageJson.optionalDependencies,
  })) {
    queue.push({
      dependency,
      from: join(dirname(packageJsonPath), "package.json"),
    });
  }
}

const inventory = [...seen.values()].sort((left, right) =>
  left.name.localeCompare(right.name),
);
const installed = new Map();
const pnpmModules = join(root, "node_modules", ".pnpm");
for (const slot of readdirSync(pnpmModules)) {
  const modules = join(pnpmModules, slot, "node_modules");
  if (!existsSync(modules)) continue;
  for (const first of readdirSync(modules)) {
    if (first === ".bin") continue;
    const candidates = first.startsWith("@")
      ? readdirSync(join(modules, first)).map((second) =>
          join(modules, first, second, "package.json"),
        )
      : [join(modules, first, "package.json")];
    for (const packageJsonPath of candidates) {
      if (!existsSync(packageJsonPath)) continue;
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      installed.set(`${packageJson.name}@${packageJson.version}`, {
        name: packageJson.name,
        version: packageJson.version,
        license: packageJson.license ?? packageJson.licenses ?? null,
      });
    }
  }
}
const developmentInventory = [...installed.values()].sort(
  (left, right) =>
    left.name.localeCompare(right.name) ||
    left.version.localeCompare(right.version),
);
const serialized = JSON.stringify(
  {
    schemaVersion: "1.0.0",
    packages: inventory,
    developmentPackages: developmentInventory,
  },
  null,
  2,
);
const forbidden = [
  "AGPL",
  "GPL-1",
  "GPL-2",
  "GPL-3",
  "SSPL",
  "UNLICENSED",
  "UNKNOWN",
];
const findings = developmentInventory.filter((entry) => {
  const license = JSON.stringify(entry.license).toUpperCase();
  return (
    entry.license === null ||
    forbidden.some((identifier) => license.includes(identifier))
  );
});
if (findings.length > 0) {
  throw new Error(
    `forbidden or unknown licenses found: ${findings.map((entry) => entry.name).join(", ")}`,
  );
}

const artifacts = join(root, ".artifacts");
mkdirSync(artifacts, { recursive: true });
writeFileSync(join(artifacts, "licenses.json"), `${serialized}\n`);
process.stdout.write(
  `license inventory passed for ${inventory.length} production and ${developmentInventory.length} installed development packages; wrote .artifacts/licenses.json\n`,
);
