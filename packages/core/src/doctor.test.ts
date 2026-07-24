import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { inspectEnvironment } from "./doctor.js";

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

describe("doctor", () => {
  it("reports runtime, Git, capacity, config, executable version and non-secret auth readiness", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-doctor-"));
    roots.push(root);
    await execute("git", ["init", "-q", root]);
    await mkdir(join(root, ".patchrace"));
    const configPath = join(root, ".patchrace", "suite.json");
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: "1.0.0",
        project: { root: ".." },
        adapters: {
          fixture: { kind: "fixture", executable: process.execPath },
        },
        variants: { baseline: { adapter: "fixture" } },
        suites: { smoke: { tasks: ["task"], split: "validation" } },
        tasks: { task: { file: "task.yaml" } },
      }),
    );
    const report = await inspectEnvironment({
      projectRoot: root,
      configPath,
      adapterId: "fixture",
      minimumFreeMiB: 0,
    });
    expect(report.projectRoot).toBe(".");
    expect(report.checks.map(({ id }) => id)).toEqual([
      "runtime.node",
      "tool.git",
      "filesystem.capacity",
      "config.suite",
      "adapter.fixture",
    ]);
    expect(
      report.checks.find(({ id }) => id === "adapter.fixture"),
    ).toMatchObject({ status: "warn", details: { auth: "unknown" } });
    expect(JSON.stringify(report)).not.toContain(root);
  });
});
