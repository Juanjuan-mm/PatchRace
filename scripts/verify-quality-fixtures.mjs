import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const temporaryRoot = mkdtempSync(join(root, ".quality-tmp-"));

function run(executable, args) {
  return spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
}

function expectFailure(label, result) {
  if (result.status === 0) {
    throw new Error(
      `${label} fixture unexpectedly passed\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
}

try {
  const formatFixture = join(temporaryRoot, "format.ts");
  const lintFixture = join(temporaryRoot, "lint.mjs");
  const typeFixture = join(temporaryRoot, "type.ts");
  const testFixture = join(temporaryRoot, "failure.test.mjs");

  writeFileSync(formatFixture, "export const badlyFormatted={answer:42}\n");
  writeFileSync(lintFixture, "const unused = 1;\n");
  writeFileSync(typeFixture, "const value: string = 42;\nvoid value;\n");
  writeFileSync(
    testFixture,
    'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("intentional", () => assert.equal(1, 2));\n',
  );

  expectFailure(
    "format",
    run(join(root, "node_modules/.bin/prettier"), [
      "--check",
      formatFixture,
      "--parser",
      "typescript",
    ]),
  );
  expectFailure(
    "lint",
    run(join(root, "node_modules/.bin/eslint"), [
      "--no-config-lookup",
      "--rule",
      "no-unused-vars:error",
      lintFixture,
    ]),
  );
  expectFailure(
    "typecheck",
    run(join(root, "node_modules/.bin/tsc"), [
      "--strict",
      "--noEmit",
      "--skipLibCheck",
      "--types",
      "node",
      typeFixture,
    ]),
  );
  expectFailure("test", run(process.execPath, ["--test", testFixture]));

  process.stdout.write(
    "quality fixtures: format, lint, typecheck, and test failures detected\n",
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
