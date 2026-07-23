import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import type { PatchRaceBridge } from "./bridge.js";
import { createPatchRaceExtension, PATCHRACE_STATUS_WIDGET } from "./index.js";
import type {
  PiCommandDefinition,
  PiExtensionApi,
  PiExtensionCommandContext,
} from "./pi-api.js";
import { PATCHRACE_SESSION_ENTRY } from "./session-state.js";

function harness() {
  const commands = new Map<string, PiCommandDefinition>();
  const entries: { type: string; customType?: string; data?: unknown }[] = [];
  const notifications: { message: string; level: string }[] = [];
  const widgets: { id: string; lines: readonly string[] | undefined }[] = [];
  const statuses: { id: string; text: string | undefined }[] = [];
  let sessionStart:
    | ((
        event: unknown,
        context: PiExtensionCommandContext,
      ) => void | Promise<void>)
    | undefined;
  const api: PiExtensionApi = {
    registerCommand: (name, definition) => commands.set(name, definition),
    appendEntry: (customType, data) =>
      entries.push({ type: "custom", customType, data }),
    on: (_event, handler) => {
      sessionStart = handler;
    },
  };
  const context: PiExtensionCommandContext = {
    cwd: "/trusted/project",
    ui: {
      notify: (message, level) => notifications.push({ message, level }),
      confirm: () => Promise.resolve(false),
      input: () => Promise.resolve(undefined),
      select: () => Promise.resolve(undefined),
      editor: () => Promise.resolve(undefined),
      setStatus: (id, text) => statuses.push({ id, text }),
      setWidget: (id, lines) => widgets.push({ id, lines }),
    },
    sessionManager: { getEntries: () => entries },
    waitForIdle: () => Promise.resolve(),
  };
  return {
    api,
    commands,
    context,
    entries,
    notifications,
    widgets,
    statuses,
    sessionStart: () => sessionStart,
  };
}

describe("Pi extension scaffold", () => {
  it("declares a Pi package entry that can be rebuilt and reloaded", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      keywords: string[];
      pi: { extensions: string[] };
      scripts: { dev: string };
      files: string[];
    };
    expect(manifest.keywords).toContain("pi-package");
    expect(manifest.pi.extensions).toEqual(["./dist/index.js"]);
    expect(manifest.scripts.dev).toContain("--watch");
    expect(manifest.files).toContain("dist");
  });

  it("delegates readiness to the bridge without replacing the Pi session", async () => {
    const calls: unknown[] = [];
    const bridge: PatchRaceBridge = {
      execute: (invocation) => {
        calls.push(invocation);
        return Promise.resolve({
          schemaVersion: "1.0.0",
          ok: true,
          command: "doctor",
          status: "completed",
          sideEffects: [],
          data: {
            runId: "run_fixture",
            artifactRoot: ".patchrace/runs/run_fixture",
          },
        });
      },
    };
    const value = harness();
    createPatchRaceExtension({ bridge })(value.api);

    await value.commands.get("patchrace")?.handler("doctor", value.context);

    expect(calls).toEqual([
      expect.objectContaining({
        cwd: "/trusted/project",
        arguments: ["doctor"],
      }),
    ]);
    expect(value.entries).toEqual([
      expect.objectContaining({ customType: PATCHRACE_SESSION_ENTRY }),
    ]);
    expect(value.widgets.at(-1)).toEqual({
      id: PATCHRACE_STATUS_WIDGET,
      lines: [
        "PatchRace doctor: completed",
        "Run: run_fixture",
        "Artifacts: .patchrace/runs/run_fixture",
      ],
    });
    expect(value.notifications.at(-1)?.level).toBe("info");
  });

  it("restores only schema-valid PatchRace session state on reload", async () => {
    const value = harness();
    value.entries.push(
      { type: "custom", customType: PATCHRACE_SESSION_ENTRY, data: {} },
      {
        type: "custom",
        customType: PATCHRACE_SESSION_ENTRY,
        data: {
          schemaVersion: "1.0.0",
          command: "race",
          status: "completed",
          runId: "run_saved",
          artifactRoot: null,
        },
      },
    );
    createPatchRaceExtension({
      bridge: {
        execute: () => {
          throw new Error("not used");
        },
      },
    })(value.api);

    await value.sessionStart()?.({}, value.context);

    expect(value.widgets).toEqual([
      {
        id: PATCHRACE_STATUS_WIDGET,
        lines: ["PatchRace race: completed", "Run: run_saved"],
      },
    ]);
  });

  it("uses Pi's reload lifecycle without invoking PatchRace or a provider", async () => {
    const value = harness();
    let reloaded = 0;
    const context = {
      ...value.context,
      reload: () => {
        reloaded += 1;
        return Promise.resolve();
      },
    };
    createPatchRaceExtension({
      bridge: {
        execute: () => {
          throw new Error("must not invoke bridge");
        },
      },
    })(value.api);

    await value.commands.get("patchrace")?.handler("reload", context);

    expect(reloaded).toBe(1);
    expect(value.notifications.at(-1)?.message).toContain("reloaded");
  });
});
