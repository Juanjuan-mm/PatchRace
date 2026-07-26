import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runProcess } from "./process.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

async function cwd(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-process-"));
  roots.push(root);
  return root;
}

describe("runProcess", () => {
  it("passes only intentional environment values and streams both outputs", async () => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const result = await runProcess({
      executable: process.execPath,
      args: [
        "-e",
        "process.stdout.write(process.env.PATCHRACE_TEST ?? 'missing'); process.stderr.write(String(process.env.HOME))",
      ],
      cwd: await cwd(),
      inheritEnvironment: ["PATH"],
      environment: { PATCHRACE_TEST: "present" },
      onStdout: (chunk) => {
        stdout.push(Buffer.from(chunk));
      },
      onStderr: (chunk) => {
        stderr.push(Buffer.from(chunk));
      },
    });
    expect(result.status).toBe("completed");
    expect(Buffer.concat(stdout).toString()).toBe("present");
    expect(Buffer.concat(stderr).toString()).toBe("undefined");
    expect(result.passedEnvironmentNames).toEqual(["PATCHRACE_TEST"]);
  });

  it("terminates its process group at the time budget", async () => {
    const directory = await cwd();
    await writeFile(join(directory, "unrelated.txt"), "preserve\n");
    const result = await runProcess({
      executable: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      cwd: directory,
      timeoutMs: 30,
      terminationGraceMs: 30,
    });
    expect(result).toMatchObject({
      status: "budget_exhausted",
      terminationReason: "timeout",
    });
    if (process.platform === "win32") {
      expect(result.signal).toBeNull();
      expect(result.exitCode).not.toBe(0);
    } else {
      expect(result.signal).not.toBeNull();
    }
    expect(await readFile(join(directory, "unrelated.txt"), "utf8")).toBe(
      "preserve\n",
    );
  });

  it.skipIf(process.platform === "win32")(
    "force-kills descendants that retain pipes after the direct child exits",
    async () => {
      const directory = await cwd();
      const result = await runProcess({
        executable: process.execPath,
        args: [
          "-e",
          [
            "const { spawn } = require('node:child_process');",
            "spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)\"], { stdio: ['ignore', 'inherit', 'inherit'] });",
            "process.on('SIGTERM', () => process.exit(0));",
            "setInterval(() => {}, 1000);",
          ].join(" "),
        ],
        cwd: directory,
        timeoutMs: 100,
        terminationGraceMs: 30,
      });
      expect(result).toMatchObject({
        status: "budget_exhausted",
        terminationReason: "timeout",
      });
      expect(result.durationMs).toBeLessThan(2_000);
    },
  );

  it("honors cancellation", async () => {
    const directory = await cwd();
    await writeFile(join(directory, "unrelated.txt"), "preserve\n");
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const result = await runProcess({
      executable: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      cwd: directory,
      signal: controller.signal,
      terminationGraceMs: 30,
    });
    expect(result.status).toBe("cancelled");
    expect(await readFile(join(directory, "unrelated.txt"), "utf8")).toBe(
      "preserve\n",
    );
  });

  it("normalizes an unavailable executable without invoking a shell", async () => {
    const directory = await cwd();
    await expect(
      runProcess({
        executable: "patchrace-definitely-missing-executable",
        args: ["$(touch should-not-exist)"],
        cwd: directory,
      }),
    ).rejects.toMatchObject({ details: { code: "PROCESS_SPAWN_FAILED" } });
    await expect(access(join(directory, "should-not-exist"))).rejects.toThrow();
  });
});
