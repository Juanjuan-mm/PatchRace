import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { inspectEnvironment } from "./doctor.js";

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ).finally(() => vi.unstubAllEnvs()),
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

  it("passes only configured environment names to adapter auth probes", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-doctor-auth-"));
    roots.push(root);
    await execute("git", ["init", "-q", root]);
    await mkdir(join(root, ".patchrace"));
    const authProbe = join(root, "claude-fixture.mjs");
    await writeFile(
      authProbe,
      [
        'if (process.argv.includes("--version")) {',
        '  console.log("claude fixture 1.0.0");',
        "} else {",
        '  const allowed = process.env["PATCHRACE_DOCTOR_AUTH_TEST"] === "ready";',
        '  const unlisted = process.env["PATCHRACE_DOCTOR_UNLISTED_TEST"];',
        "  process.exit(allowed && unlisted === undefined ? 0 : 1);",
        "}",
      ].join("\n"),
    );
    vi.stubEnv("PATCHRACE_DOCTOR_AUTH_TEST", "ready");
    vi.stubEnv("PATCHRACE_DOCTOR_UNLISTED_TEST", "must-not-be-passed");
    const configPath = join(root, ".patchrace", "suite.json");
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: "1.0.0",
        project: { root: ".." },
        defaults: {
          environment: {
            inherit: ["PATH"],
            pass: ["PATCHRACE_DOCTOR_AUTH_TEST"],
          },
        },
        adapters: {
          claude: {
            kind: "claude-code",
            executable: process.execPath,
            args: [authProbe],
          },
        },
        variants: { baseline: { adapter: "claude" } },
        suites: { smoke: { tasks: ["task"], split: "validation" } },
        tasks: { task: { file: "task.yaml" } },
      }),
    );

    const report = await inspectEnvironment({
      projectRoot: root,
      configPath,
      adapterId: "claude",
      minimumFreeMiB: 0,
    });

    expect(
      report.checks.find(({ id }) => id === "adapter.claude"),
    ).toMatchObject({ status: "pass", details: { auth: "ready" } });
    expect(JSON.stringify(report)).not.toContain("must-not-be-passed");
  });
});
