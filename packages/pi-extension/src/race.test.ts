import { describe, expect, it } from "vitest";

import type { PatchRaceBridge } from "./bridge.js";
import type {
  PiCommandDefinition,
  PiExtensionApi,
  PiExtensionCommandContext,
} from "./pi-api.js";
import { registerRaceCommand } from "./race.js";

function raceHarness(answers: {
  readonly inputs?: readonly (string | undefined)[];
  readonly confirms?: readonly boolean[];
  readonly selections?: readonly (string | undefined)[];
}) {
  const commands = new Map<string, PiCommandDefinition>();
  const notifications: { message: string; level: string }[] = [];
  const widgets: string[][] = [];
  const editors: { title: string; text: string | undefined }[] = [];
  const entries: unknown[] = [];
  const inputs = [...(answers.inputs ?? [])];
  const confirms = [...(answers.confirms ?? [])];
  const selections = [...(answers.selections ?? [])];
  const api: PiExtensionApi = {
    registerCommand: (name, definition) => commands.set(name, definition),
    appendEntry: (customType, data) => entries.push({ customType, data }),
    on: () => undefined,
  };
  const context: PiExtensionCommandContext = {
    cwd: "/repo",
    sessionManager: { getEntries: () => [] },
    waitForIdle: () => Promise.resolve(),
    ui: {
      notify: (message, level) => notifications.push({ message, level }),
      input: () => Promise.resolve(inputs.shift()),
      confirm: () => Promise.resolve(confirms.shift() ?? false),
      select: () => Promise.resolve(selections.shift()),
      editor: (title, text) => {
        editors.push({ title, text });
        return Promise.resolve(undefined);
      },
      setStatus: () => undefined,
      setWidget: (_id, lines) => {
        if (lines !== undefined) widgets.push([...lines]);
      },
    },
  };
  return { api, commands, context, notifications, widgets, editors, entries };
}

describe("Pi race command", () => {
  it("configures, confirms, starts, persists, and inspects without replacing the session", async () => {
    const calls: unknown[] = [];
    const bridge: PatchRaceBridge = {
      execute: (invocation) => {
        calls.push(invocation);
        return Promise.resolve({
          schemaVersion: "1.0.0",
          ok: true,
          command: "race",
          status: "completed",
          sideEffects: [".patchrace/runs/run_1"],
          data: { runId: "run_1", report: { overview: { taskCount: 2 } } },
        });
      },
    };
    const value = raceHarness({
      inputs: [".patchrace/suite.yaml", "pi,claude", "2"],
      confirms: [true],
      selections: ["Inspect result"],
    });
    registerRaceCommand(value.api, bridge);

    await value.commands.get("race")?.handler("", value.context);

    expect(calls).toEqual([
      expect.objectContaining({
        cwd: "/repo",
        arguments: [
          "race",
          "--config",
          ".patchrace/suite.yaml",
          "--variants",
          "pi,claude",
          "--repeat",
          "2",
        ],
      }),
    ]);
    expect(value.widgets[0]?.join("\n")).toContain(
      "repository setup/verifier commands",
    );
    expect(value.entries).toHaveLength(1);
    expect(value.editors[0]?.text).toContain('"runId": "run_1"');
    expect(value.notifications.at(-1)).toEqual({
      message: "PatchRace race completed.",
      level: "info",
    });
  });

  it("requires explicit confirmation before invoking a race", async () => {
    let invoked = false;
    const value = raceHarness({ confirms: [false] });
    registerRaceCommand(value.api, {
      execute: () => {
        invoked = true;
        throw new Error("must not run");
      },
    });

    await value.commands
      .get("race")
      ?.handler("--config suite.json --repeat 1", value.context);

    expect(invoked).toBe(false);
    expect(value.notifications.at(-1)?.message).toContain(
      "cancelled before execution",
    );
  });

  it("inspects a durable run without a risk confirmation or Agent call", async () => {
    const calls: unknown[] = [];
    const value = raceHarness({});
    registerRaceCommand(value.api, {
      execute: (invocation) => {
        calls.push(invocation);
        return Promise.resolve({
          schemaVersion: "1.0.0",
          ok: true,
          command: "report",
          status: "completed",
          sideEffects: [],
          data: { content: "report" },
        });
      },
    });

    await value.commands
      .get("race")
      ?.handler("inspect run_saved", value.context);

    expect(calls).toEqual([
      expect.objectContaining({
        arguments: ["report", "run_saved", "--format", "json"],
      }),
    ]);
    expect(value.editors[0]?.title).toContain("run_saved");
  });

  it("rejects malformed or unknown options before confirmation", async () => {
    const value = raceHarness({});
    registerRaceCommand(value.api, {
      execute: () => {
        throw new Error("must not run");
      },
    });

    await value.commands.get("race")?.handler("--repeat zero", value.context);
    await value.commands
      .get("race")
      ?.handler("--shell 'rm -rf x'", value.context);

    expect(value.notifications.map((item) => item.level)).toEqual([
      "error",
      "error",
    ]);
    expect(value.notifications[0]?.message).toContain("positive integer");
    expect(value.notifications[1]?.message).toContain("Unsupported option");
  });
});
