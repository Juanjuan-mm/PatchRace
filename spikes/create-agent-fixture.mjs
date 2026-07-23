import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`git ${args[0]}: ${stderr}`)));
  });
}

const root = await mkdtemp("/private/tmp/patchrace-agent-spikes-");
const fixtures = {};
for (const name of ["claude", "codex"]) {
  const cwd = join(root, name);
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "test"), { recursive: true });
  await writeFile(join(cwd, "package.json"), JSON.stringify({
    name: `patchrace-${name}-fixture`, private: true, type: "module",
    scripts: { test: "node --test" },
  }, null, 2) + "\n");
  await writeFile(join(cwd, "src", "add.js"), "export function add(a, b) {\n  return a - b;\n}\n");
  await writeFile(join(cwd, "test", "add.test.js"), "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../src/add.js';\n\ntest('adds two values', () => {\n  assert.equal(add(2, 3), 5);\n});\n");
  await writeFile(join(cwd, "TASK.md"), "Fix the implementation so `npm test` passes. Do not alter tests.\n");
  await git(cwd, ["init", "-q", "-b", "main"]);
  await git(cwd, ["config", "user.name", "PatchRace Spike"]);
  await git(cwd, ["config", "user.email", "spike@patchrace.invalid"]);
  await git(cwd, ["add", "."]);
  await git(cwd, ["commit", "-q", "-m", "fixture baseline"]);
  fixtures[name] = { cwd, baseline: await git(cwd, ["rev-parse", "HEAD"]) };
}
console.log(JSON.stringify({ root, fixtures }, null, 2));
