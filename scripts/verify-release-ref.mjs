import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(
  typeof tag === "string" && /^v\d+\.\d+\.\d+$/u.test(tag),
  "Release ref must be a stable vMAJOR.MINOR.PATCH tag.",
);
const version = tag.slice(1);
const packages = readdirSync(resolve(root, "packages"), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const path = resolve(root, "packages", entry.name, "package.json");
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  })
  .filter((entry) => entry !== null && entry.private !== true);

assert(
  packages.length === 9,
  `Expected 9 public packages, found ${packages.length}.`,
);
for (const manifest of packages) {
  assert(
    manifest.version === version,
    `${manifest.name} is ${manifest.version}; expected ${version} from ${tag}.`,
  );
}

const releaseNotes = resolve(root, "docs", "releases", `${tag}.md`);
readFileSync(releaseNotes, "utf8");
process.stdout.write(
  `${JSON.stringify({
    status: "PASS",
    tag,
    version,
    packages: packages.map(({ name }) => name).sort(),
    releaseNotes: `docs/releases/${tag}.md`,
  })}\n`,
);
