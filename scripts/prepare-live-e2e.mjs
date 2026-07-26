import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const artifactRoot = resolve(root, ".artifacts", "live-e2e");
const baselineTag = "v0.1.0-rc.2";
const sha256 = (value) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0)
    throw new Error(
      `${executable} ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  return result.stdout.trim();
}

await mkdir(artifactRoot, { recursive: true });
const workspace = await mkdtemp(join(artifactRoot, "patchrace-node26-"));
const project = join(workspace, "repository");
run(
  "git",
  [
    "clone",
    "--local",
    "--no-hardlinks",
    "--branch",
    baselineTag,
    "--single-branch",
    root,
    project,
  ],
  root,
);
const commit = run("git", ["rev-parse", "HEAD"], project);
const liveRoot = join(project, ".patchrace", "live");
const verifierRoot = join(workspace, "verifier");
await mkdir(liveRoot, { recursive: true });
await mkdir(verifierRoot, { recursive: true });

const instruction = `PatchRace currently supports Node 22.22+ and Node 24. Add complete Node 26 support without dropping either LTS line.

Update every public package engine, runtime doctor behavior and remediation, the provider-free platform verifier, the GitHub Actions platform matrix, and the relevant public platform/development documentation. The release matrix must cover Node 22.22, 24, and 26 on windows-2025, macos-15, macos-15-intel, ubuntu-22.04, ubuntu-24.04, and ubuntu-24.04-arm as applicable. Add or update deterministic regression coverage. Keep the dependency graph and lockfile unchanged, preserve those exact platform labels, and do not weaken any release, security, privacy, or cleanup gate.
`;
const verifier = `import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const baselineCommit = ${JSON.stringify(commit)};
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const sortedEntries = (value) =>
  Object.entries(value ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  );
const manifests = [
  "package.json",
  ...readdirSync(resolve(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => \`packages/\${entry.name}/package.json\`),
];
for (const path of manifests) {
  const manifest = JSON.parse(read(path));
  const baseline = JSON.parse(
    execFileSync("git", ["show", baselineCommit + ":" + path], {
      cwd: root,
      encoding: "utf8",
    }),
  );
  if (manifest.engines?.node !== ">=22.22.0 <27")
    throw new Error(\`\${path} does not declare the reviewed Node range\`);
  for (const field of dependencyFields)
    if (
      JSON.stringify(sortedEntries(manifest[field])) !==
      JSON.stringify(sortedEntries(baseline[field]))
    )
      throw new Error(\`\${path} changes \${field}\`);
}
const doctor = read("packages/core/src/doctor.ts");
for (const value of ["major === 26", "22.22+/24.x/26.x"])
  if (!doctor.includes(value)) throw new Error(\`doctor omits \${value}\`);
if (!/Node 22.*24.*26/u.test(doctor))
  throw new Error("doctor remediation omits the supported Node lines");
const platform = read("scripts/verify-qa-platform.mjs");
for (const value of ['"win32"', "22, 24, 26"])
  if (!platform.includes(value)) throw new Error(\`platform gate omits \${value}\`);
const workflow = read(".github/workflows/ci.yml");
for (const value of [
  "windows-2025",
  "macos-15-intel",
  "ubuntu-22.04",
  "ubuntu-24.04-arm",
  "26.x",
])
  if (!workflow.includes(value)) throw new Error(\`CI matrix omits \${value}\`);
`;
const instructionPath = join(liveRoot, "instruction.md");
const verifierPath = join(verifierRoot, "verify-node26.mjs");
await writeFile(instructionPath, instruction);
await writeFile(verifierPath, verifier);

const task = {
  schemaVersion: "1.0.0",
  id: "patchrace-node26-support",
  revision: 1,
  baseline: {
    repository: "PatchRace",
    commit,
    submodules: "disabled",
    lfs: "disabled",
  },
  instruction: {
    file: "instruction.md",
    hash: sha256(instruction),
  },
  setup: {
    commands: [
      {
        id: "install",
        kind: "setup",
        argv: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
        timeoutSeconds: 120,
        expectedExitCodes: [0],
        cache: "read-only",
        network: "required",
      },
      {
        id: "build",
        kind: "setup",
        argv: ["pnpm", "build"],
        timeoutSeconds: 120,
        expectedExitCodes: [0],
        cache: "read-only",
        network: "forbidden",
      },
    ],
    assets: [],
  },
  verifier: {
    visibility: "hidden",
    assets: [
      {
        source: "verify-node26.mjs",
        mount: ".patchrace-live/verify-node26.mjs",
        hash: sha256(verifier),
      },
    ],
    commands: [
      {
        id: "node26-contract",
        kind: "test",
        argv: ["node", ".patchrace-live/verify-node26.mjs"],
        timeoutSeconds: 30,
        expectedExitCodes: [0],
        cache: "none",
        network: "forbidden",
      },
      {
        id: "regression-tests",
        kind: "test",
        argv: [
          "pnpm",
          "vitest",
          "run",
          "packages/core/src/doctor.test.ts",
          "packages/core/src/config.test.ts",
          "packages/core/src/process.test.ts",
        ],
        timeoutSeconds: 120,
        expectedExitCodes: [0],
        cache: "read-only",
        network: "forbidden",
      },
      {
        id: "typecheck",
        kind: "typecheck",
        argv: ["pnpm", "typecheck"],
        timeoutSeconds: 120,
        expectedExitCodes: [0],
        cache: "read-only",
        network: "forbidden",
      },
    ],
  },
  assertions: [
    {
      id: "verifiers-protected",
      kind: "protected-paths",
      paths: [".patchrace-live/**"],
    },
    {
      id: "bounded-change",
      kind: "diff-limit",
      maxChangedFiles: 24,
      maxLines: 700,
      maxBinaryFiles: 0,
      allowDependencyChanges: true,
      allowLockfileChanges: false,
    },
  ],
  budgets: {
    trialSeconds: 900,
    setupSeconds: 180,
    graderSeconds: 300,
    maxTokens: 32_768,
    maxCostUsd: null,
    maxOutputBytes: 1024 * 1024 * 1024,
    maxRecords: 100_000,
    maxPatchLines: 700,
    maxChangedFiles: 24,
    diskMiB: 2048,
  },
  provenance: {
    source: "manual",
    sourceCommit: commit,
    referencePatchHash: sha256(""),
    createdAt: new Date().toISOString(),
    reviewedBy: "live-e2e-profile-v1",
    exclusions: [
      "This is a seeded regression task on a real PatchRace release, not an upstream issue benchmark.",
    ],
  },
  metadata: {
    ecosystem: "typescript-monorepo",
    category: "cross-platform-support",
    split: "validation",
    profile: "patchrace-node26-v1",
  },
};
await writeFile(
  join(liveRoot, "task.json"),
  `${JSON.stringify(task, null, 2)}\n`,
);

const summary = {
  schemaVersion: "1.0.0",
  status: "READY",
  profile: "patchrace-node26-v1",
  baselineTag,
  baselineCommit: commit,
  workspace,
  project,
  task: join(liveRoot, "task.json"),
  verifierRoot,
  providerCalls: false,
};
await writeFile(
  join(workspace, "prepared.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
