import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { PatchRaceProcessLauncher } from "./bridge.js";
import { CliPatchRaceBridge, NodePatchRaceProcessLauncher } from "./bridge.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("CliPatchRaceBridge", () => {
  it("uses an argument array, stable JSON output, and the current project", async () => {
    const calls: unknown[] = [];
    const launcher: PatchRaceProcessLauncher = {
      run: (options) => {
        calls.push(options);
        return Promise.resolve({
          exitCode: 0,
          signal: null,
          stdout: JSON.stringify({
            schemaVersion: "1.0.0",
            ok: true,
            command: "doctor",
            status: "completed",
            sideEffects: [],
          }),
          stderr: "checking\n",
        });
      },
    };
    const progress: string[] = [];
    const result = await new CliPatchRaceBridge(
      "/opt/bin/patchrace",
      launcher,
    ).execute({
      cwd: "/repo with spaces",
      arguments: ["doctor"],
      onProgress: (text) => progress.push(text),
    });

    expect(result.command).toBe("doctor");
    expect(calls).toEqual([
      expect.objectContaining({
        executable: "/opt/bin/patchrace",
        arguments: ["--json", "--project", "/repo with spaces", "doctor"],
        cwd: "/repo with spaces",
      }),
    ]);
    expect(progress).toEqual([]);
  });

  it("fails closed on invalid arguments, command failure, or malformed JSON", async () => {
    const launcher: PatchRaceProcessLauncher = {
      run: () =>
        Promise.resolve({
          exitCode: 2,
          signal: null,
          stdout: "",
          stderr: "bad usage",
        }),
    };
    const bridge = new CliPatchRaceBridge("patchrace", launcher);

    await expect(
      bridge.execute({ cwd: "/repo", arguments: [] }),
    ).rejects.toThrow("requires a command");
    await expect(
      bridge.execute({ cwd: "/repo", arguments: ["race\0unsafe"] }),
    ).rejects.toThrow("contain no NUL");
    await expect(
      bridge.execute({ cwd: "/repo", arguments: ["doctor"] }),
    ).rejects.toThrow("bad usage");

    const malformed = new CliPatchRaceBridge("patchrace", {
      run: () =>
        Promise.resolve({
          exitCode: 0,
          signal: null,
          stdout: "not-json",
          stderr: "",
        }),
    });
    await expect(
      malformed.execute({ cwd: "/repo", arguments: ["doctor"] }),
    ).rejects.toThrow("malformed");
  });

  it("runs the real child-process bridge without shell interpretation", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-pi-bridge-"));
    roots.push(root);
    const executable = join(root, "patchrace-fixture.mjs");
    await writeFile(
      executable,
      `#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
await writeFile("argv.json", JSON.stringify(process.argv.slice(2)));
process.stderr.write("fixture progress\\n");
process.stdout.write(JSON.stringify({
  schemaVersion: "1.0.0",
  ok: true,
  command: "doctor",
  status: "completed",
  sideEffects: []
}) + "\\n");
`,
    );
    await chmod(executable, 0o755);
    await writeFile(join(root, "sentinel.txt"), "preserve\n");
    const progress: string[] = [];

    const result = await new CliPatchRaceBridge(
      executable,
      new NodePatchRaceProcessLauncher(),
    ).execute({
      cwd: root,
      arguments: ["doctor", "; touch shell-injection"],
      onProgress: (text) => progress.push(text),
    });

    expect(result).toMatchObject({ command: "doctor", status: "completed" });
    expect(progress.join("")).toBe("fixture progress\n");
    expect(JSON.parse(await readFile(join(root, "argv.json"), "utf8"))).toEqual(
      ["--json", "--project", root, "doctor", "; touch shell-injection"],
    );
    await expect(readFile(join(root, "shell-injection"))).rejects.toMatchObject(
      {
        code: "ENOENT",
      },
    );
    expect(await readFile(join(root, "sentinel.txt"), "utf8")).toBe(
      "preserve\n",
    );
  });
});
