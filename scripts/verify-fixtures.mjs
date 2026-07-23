import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const fixturesRoot = join(root, "fixtures", "m2");
const manifest = JSON.parse(
  readFileSync(join(fixturesRoot, "manifest.json"), "utf8"),
);
const required = [
  "success-typescript",
  "success-python",
  "failure",
  "dirty-state",
  "hidden-test",
  "timeout",
  "conflicting-patch",
];
const actual = manifest.scenarios.map((scenario) => scenario.id);

if (JSON.stringify(actual) !== JSON.stringify(required)) {
  throw new Error(`fixture inventory mismatch: ${actual.join(", ")}`);
}

function run(command, args, cwd, timeout = 10_000) {
  return spawnSync(command, args, { cwd, encoding: "utf8", timeout });
}

function expect(label, condition, detail = "") {
  if (!condition)
    throw new Error(`${label} failed${detail ? `: ${detail}` : ""}`);
}

const temporaryRoot = mkdtempSync(join(tmpdir(), "patchrace-fixtures-"));

try {
  for (const scenario of manifest.scenarios) {
    const source = join(fixturesRoot, scenario.path);
    const target = join(temporaryRoot, basename(scenario.path));
    cpSync(source, target, { recursive: true });
    const preservedPath = join(target, ".patchrace-unrelated-state");
    const preservedContent = "preserve unrelated fixture state\n";
    writeFileSync(preservedPath, preservedContent);

    if (scenario.id === "success-typescript" || scenario.id === "failure") {
      const result = run(process.execPath, ["--test"], target);
      expect(
        scenario.id,
        result.status === scenario.expectedExit,
        result.stderr,
      );
    } else if (scenario.id === "success-python") {
      const python = run(
        "python3",
        ["-m", "unittest", "discover", "-s", "test"],
        target,
      );
      expect(scenario.id, python.status === 0, python.stderr);
    } else if (scenario.id === "dirty-state") {
      expect("dirty git init", run("git", ["init", "-q"], target).status === 0);
      expect("dirty git add", run("git", ["add", "."], target).status === 0);
      expect(
        "dirty git commit",
        run(
          "git",
          [
            "-c",
            "user.name=PatchRace Fixture",
            "-c",
            "user.email=fixture@invalid",
            "commit",
            "-qm",
            "baseline",
          ],
          target,
        ).status === 0,
      );
      writeFileSync(join(target, scenario.dirtyFile), "user-owned change\n");
      const status = run("git", ["status", "--porcelain"], target);
      expect(
        scenario.id,
        status.stdout.includes(scenario.dirtyFile),
        status.stdout,
      );
    } else if (scenario.id === "hidden-test") {
      const before = run(
        process.execPath,
        ["--test", "test/public.test.mjs"],
        target,
      );
      expect(
        "hidden test before injection",
        before.status === 0,
        before.stderr,
      );
      cpSync(
        join(target, "held-back", "held-back.test.mjs"),
        join(target, "test", "held-back.test.mjs"),
      );
      const after = run(process.execPath, ["--test", "test"], target);
      expect("hidden test after injection", after.status !== 0, after.stderr);
    } else if (scenario.id === "timeout") {
      const timeout = run(
        process.execPath,
        ["hang.mjs"],
        target,
        scenario.timeoutMs,
      );
      expect(
        scenario.id,
        timeout.error?.code === "ETIMEDOUT",
        String(timeout.error),
      );
    } else if (scenario.id === "conflicting-patch") {
      expect(
        "conflict git init",
        run("git", ["init", "-q"], target).status === 0,
      );
      expect(
        "first patch",
        run("git", ["apply", "candidate-a.diff"], target).status === 0,
      );
      const second = run(
        "git",
        ["apply", "--check", "candidate-b.diff"],
        target,
      );
      expect(scenario.id, second.status !== 0, second.stderr);
      expect(
        "conflicting patch preserves accepted patch",
        readFileSync(join(target, "message.txt"), "utf8") === "candidate a\n",
      );
    }

    expect(
      `${scenario.id} preserves unrelated state`,
      readFileSync(preservedPath, "utf8") === preservedContent,
    );
  }

  process.stdout.write(`fixtures verified: ${actual.join(", ")}\n`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
