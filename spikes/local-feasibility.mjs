import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

function exec(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      detached: options.detached ?? false,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      const result = { code, signal, stdout, stderr };
      if (code === 0 || options.allowFailure) resolve(result);
      else reject(new Error(`${command} ${args.join(" ")} failed (${code}): ${stderr}`));
    });
    if (options.input !== undefined) child.stdin.end(options.input);
    options.onSpawn?.(child);
  });
}

async function git(cwd, ...args) {
  return (await exec("git", args, { cwd })).stdout.trim();
}

async function initRepo(path) {
  await mkdir(path, { recursive: true });
  await git(path, "init", "-q", "-b", "main");
  await git(path, "config", "user.name", "PatchRace Spike");
  await git(path, "config", "user.email", "spike@patchrace.invalid");
}

const root = await mkdtemp("/private/tmp/patchrace-local-spikes-");

// SPIKE-04: create, seed, interrupt, inspect, retain, and clean an owned worktree.
const worktreeRepo = join(root, "worktree-repo");
const worktreePath = join(root, "owned-worktree");
await initRepo(worktreeRepo);
await writeFile(join(worktreeRepo, "tracked.txt"), "baseline\n");
await git(worktreeRepo, "add", "tracked.txt");
await git(worktreeRepo, "commit", "-q", "-m", "baseline");
const baseline = await git(worktreeRepo, "rev-parse", "HEAD");
await writeFile(join(worktreeRepo, "unrelated-user-file.txt"), "preserve me\n");
await git(worktreeRepo, "worktree", "add", "-q", "--detach", worktreePath, baseline);
await writeFile(join(worktreePath, "trial-output.txt"), "partial evidence\n");
let worker;
const workerRun = exec(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
  cwd: worktreePath, detached: true, allowFailure: true, onSpawn: (child) => { worker = child; },
});
await new Promise((resolve) => setTimeout(resolve, 100));
process.kill(-worker.pid, "SIGTERM");
const workerResult = await workerRun;
const porcelainBefore = await git(worktreeRepo, "worktree", "list", "--porcelain");
const retainedEvidence = await readFile(join(worktreePath, "trial-output.txt"), "utf8");
await git(worktreeRepo, "worktree", "remove", "--force", worktreePath);
const porcelainAfter = await git(worktreeRepo, "worktree", "list", "--porcelain");
const mainStatus = await git(worktreeRepo, "status", "--short");
const mainHead = await git(worktreeRepo, "rev-parse", "HEAD");
let removed = false;
try { await access(worktreePath); } catch { removed = true; }
if (!removed || mainHead !== baseline || !mainStatus.includes("unrelated-user-file.txt")) {
  throw new Error("Worktree lifecycle modified unrelated repository state");
}

// SPIKE-05: reconstruct three historical tasks and inject held-back tests only at grade time.
const historyRepo = join(root, "history-repo");
await initRepo(historyRepo);
await mkdir(join(historyRepo, "src"), { recursive: true });
await mkdir(join(historyRepo, "test"), { recursive: true });
const tasks = [
  { id: "add", before: "export const add = (a, b) => a - b;\n", after: "export const add = (a, b) => a + b;\n", expected: "assert.equal(add(2, 3), 5);" },
  { id: "multiply", before: "export const multiply = (a, b) => a + b;\n", after: "export const multiply = (a, b) => a * b;\n", expected: "assert.equal(multiply(3, 4), 12);" },
  { id: "isEven", before: "export const isEven = (n) => n % 2 === 1;\n", after: "export const isEven = (n) => n % 2 === 0;\n", expected: "assert.equal(isEven(8), true);" },
];
for (const task of tasks) await writeFile(join(historyRepo, "src", `${task.id}.js`), task.before);
await writeFile(join(historyRepo, "package.json"), '{"type":"module","scripts":{"test":"node --test"}}\n');
await git(historyRepo, "add", ".");
await git(historyRepo, "commit", "-q", "-m", "three buggy baselines");
const historical = [];
for (const task of tasks) {
  const source = join(historyRepo, "src", `${task.id}.js`);
  const test = join(historyRepo, "test", `${task.id}.test.js`);
  await writeFile(source, task.after);
  await writeFile(test, `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { ${task.id} } from '../src/${task.id}.js';\ntest('${task.id}', () => { ${task.expected} });\n`);
  await git(historyRepo, "add", ".");
  await git(historyRepo, "commit", "-q", "-m", `fix ${task.id} regression`);
  historical.push({ task, commit: await git(historyRepo, "rev-parse", "HEAD"), parent: await git(historyRepo, "rev-parse", "HEAD^") });
}
const reconstruction = [];
for (let index = 0; index < historical.length; index += 1) {
  const item = historical[index];
  const taskRoot = join(root, `reconstructed-${index + 1}`);
  await git(historyRepo, "worktree", "add", "-q", "--detach", taskRoot, item.parent);
  const heldTestPath = join(taskRoot, "test", `${item.task.id}.test.js`);
  let hiddenBefore = true;
  try { await access(heldTestPath); hiddenBefore = false; } catch {}
  const sourcePatch = (await exec("git", ["diff", item.parent, item.commit, "--", `src/${item.task.id}.js`], { cwd: historyRepo })).stdout;
  await exec("git", ["apply", "-"], { cwd: taskRoot, input: sourcePatch });
  const heldTest = await git(historyRepo, "show", `${item.commit}:test/${item.task.id}.test.js`);
  await mkdir(join(taskRoot, "test"), { recursive: true });
  await writeFile(heldTestPath, `${heldTest}\n`);
  const grade = await exec(process.execPath, ["--test", `test/${item.task.id}.test.js`], { cwd: taskRoot, allowFailure: true });
  reconstruction.push({ id: item.task.id, parent: item.parent, commit: item.commit, hiddenBeforeAgent: hiddenBefore, injectedAfterPatch: true, gradeExitCode: grade.code });
  await git(historyRepo, "worktree", "remove", "--force", taskRoot);
}
if (reconstruction.some((item) => !item.hiddenBeforeAgent || item.gradeExitCode !== 0)) throw new Error("Historical reconstruction failed");

// SPIKE-06: deterministic trajectory differential and evidence-linked diagnosis.
const traceA = [
  { id: "a1", type: "file.read.completed", path: "src/add.js" },
  { id: "a2", type: "file.read.completed", path: "test/add.test.js" },
  { id: "a3", type: "command.completed", command: "node --test test/add.test.js", exitCode: 0, kind: "test" },
];
const traceB = [
  { id: "b1", type: "search.completed", query: "addition", matches: 0 },
  { id: "b2", type: "file.read.completed", path: "README.md" },
  { id: "b3", type: "search.completed", query: "add(", matches: 2 },
  { id: "b4", type: "command.completed", command: "npm test", exitCode: 1, kind: "test" },
  { id: "b5", type: "file.read.completed", path: "src/add.js" },
  { id: "b6", type: "command.completed", command: "node --test test/add.test.js", exitCode: 0, kind: "test" },
];
const paths = (trace) => trace.filter((event) => event.path).map((event) => event.path);
const commands = (trace) => trace.filter((event) => event.command).map((event) => event.command);
const tests = (trace) => trace.filter((event) => event.kind === "test").map((event) => `${event.command}:${event.exitCode}`);
const differential = {
  fileOrder: { a: paths(traceA), b: paths(traceB) },
  commands: { a: commands(traceA), b: commands(traceB) },
  testOrder: { a: tests(traceA), b: tests(traceB) },
  diagnosis: {
    category: "discovery",
    confidence: "high",
    claim: "Trace B delayed the relevant implementation read until after an avoidable broad test failure; Trace A read implementation and focused test before testing.",
    evidence: [
      { trace: "A", eventIds: ["a1", "a2", "a3"] },
      { trace: "B", eventIds: ["b1", "b2", "b3", "b4", "b5", "b6"] },
    ],
    alternative: "The broad test may be required in a larger repository; this fixture only establishes the observable ordering difference.",
  },
};

console.log(JSON.stringify({
  status: "PASS",
  tempRoot: root,
  worktree: {
    baseline,
    createListedOwnedPath: porcelainBefore.includes(worktreePath),
    interruptedWorker: { exitCode: workerResult.code, signal: workerResult.signal },
    retainedEvidence: retainedEvidence.trim(),
    cleanedOwnedPathOnly: removed && !porcelainAfter.includes(worktreePath),
    unrelatedStatePreserved: mainStatus.includes("unrelated-user-file.txt") && mainHead === baseline,
  },
  historicalReconstruction: reconstruction,
  traceDifferential: differential,
}, null, 2));
