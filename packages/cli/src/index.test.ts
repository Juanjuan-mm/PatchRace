import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  commandNames,
  type CommandRequest,
  type CommandResult,
} from "@patchrace/core";

import { createCli, PATCHRACE_VERSION } from "./index.js";

const executeFile = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("CLI skeleton", () => {
  it("reports the version from its package manifest", () => {
    expect(createCli().version()).toBe(PATCHRACE_VERSION);
    expect(PATCHRACE_VERSION).not.toBe("0.0.0");
  });

  it("exposes every v0.1 command", () => {
    const program = createCli();
    const topLevel = program.commands.map((command) => command.name());
    expect(topLevel).toEqual([
      "init",
      "mine",
      "run",
      "race",
      "report",
      "diagnose",
      "teach",
      "candidate",
      "promote",
      "rollback",
      "doctor",
      "clean",
    ]);
    expect(
      program.commands
        .find((command) => command.name() === "teach")
        ?.commands[0]?.name(),
    ).toBe("pi");
    expect(
      program.commands
        .find((command) => command.name() === "candidate")
        ?.commands.map((command) => command.name()),
    ).toEqual(["review", "decide"]);
    expect(commandNames).toHaveLength(13);
  });

  it("routes JSON mode to a side-effect-free service and stdout only", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const execute = vi.fn(
      async (request: CommandRequest): Promise<CommandResult> => ({
        schemaVersion: "1.0.0",
        ok: true,
        command: request.command,
        status: "placeholder",
        sideEffects: [],
      }),
    );
    const cli = createCli({
      service: { execute },
      io: {
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
      },
    });

    await cli.parseAsync(["node", "patchrace", "doctor", "--json"]);

    expect(execute).toHaveBeenCalledOnce();
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      ok: true,
      command: "doctor",
    });
    expect(stderr).toEqual([]);
  });

  it("initializes and verifies a manual suite with stable JSON output", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-cli-init-"));
    temporaryDirectories.push(root);
    await executeFile("git", ["init", "-q"], { cwd: root });
    await executeFile("git", ["config", "user.name", "PatchRace Fixture"], {
      cwd: root,
    });
    await executeFile(
      "git",
      ["config", "user.email", "fixture@example.invalid"],
      { cwd: root },
    );
    await writeFile(join(root, "README.md"), "fixture\n");
    await executeFile("git", ["add", "README.md"], { cwd: root });
    await executeFile("git", ["commit", "-qm", "baseline"], { cwd: root });
    const stdout: string[] = [];
    const stderr: string[] = [];
    const cli = createCli({
      io: {
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
      },
    });

    await cli.parseAsync([
      "node",
      "patchrace",
      "--project",
      root,
      "--json",
      "init",
    ]);

    expect(JSON.parse(stdout.join(""))).toMatchObject({
      ok: true,
      command: "init",
      status: "completed",
      data: { agentInvoked: false },
    });
    expect(stderr).toEqual([]);
    expect(
      await readFile(join(root, ".patchrace", "suite.yaml"), "utf8"),
    ).toContain("manual-task");
  });

  it("mines a review-required local Git candidate without exposing author identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-cli-mine-"));
    temporaryDirectories.push(root);
    await executeFile("git", ["init", "-q", "-b", "main"], { cwd: root });
    await executeFile("git", ["config", "user.name", "Private Fixture"], {
      cwd: root,
    });
    await executeFile(
      "git",
      ["config", "user.email", "private@example.invalid"],
      { cwd: root },
    );
    await writeFile(join(root, ".gitignore"), ".patchrace/\n");
    await writeFile(join(root, "app.js"), "export const value = 1;\n");
    await executeFile("git", ["add", "."], { cwd: root });
    await executeFile("git", ["commit", "-qm", "baseline"], { cwd: root });
    await writeFile(join(root, "app.js"), "export const value = 2;\n");
    await writeFile(
      join(root, "app.test.js"),
      "import { value } from './app.js'; if (value !== 2) throw new Error('bad');\n",
    );
    await executeFile("git", ["add", "."], { cwd: root });
    await executeFile("git", ["commit", "-qm", "fix value with test"], {
      cwd: root,
    });
    const commit = (
      await executeFile("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim();
    const stdout: string[] = [];
    const stderr: string[] = [];

    await createCli({
      io: {
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
      },
    }).parseAsync([
      "node",
      "patchrace",
      "--project",
      root,
      "--json",
      "mine",
      "--commit",
      commit,
    ]);

    const output = stdout.join("");
    expect(JSON.parse(output)).toMatchObject({
      command: "mine",
      status: "completed",
      data: {
        candidates: [
          {
            eligibility: "eligible",
            review: { required: true, status: "pending" },
          },
        ],
      },
    });
    expect(output).not.toContain("private@example.invalid");
    expect(stderr).toEqual([]);
    expect(
      await readFile(
        join(
          root,
          ".patchrace",
          "mined",
          `mined-${commit.slice(0, 12)}`,
          "candidate.json",
        ),
        "utf8",
      ),
    ).toContain('"status":"pending"');
  });
});
