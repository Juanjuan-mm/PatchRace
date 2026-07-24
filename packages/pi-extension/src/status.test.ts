import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ArtifactStore, type RunManifest } from "@patchrace/core";

import type {
  PiCommandDefinition,
  PiExtensionApi,
  PiExtensionCommandContext,
  PiSessionEntry,
} from "./pi-api.js";
import { registerStatusCommand } from "./status.js";

const roots: string[] = [];
type RunId = RunManifest["runId"];

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixtureRun(options: {
  readonly root: string;
  readonly runId: RunId;
  readonly createdAt: string;
}) {
  const store = await ArtifactStore.create({
    stateRoot: join(options.root, ".patchrace"),
    manifest: {
      schemaVersion: "1.0.0",
      runId: options.runId,
      createdAt: options.createdAt,
      planHash: sha256(options.runId),
      source: {},
      controller: {},
      budgets: {},
      trials: [],
      artifactIndexVersion: "1.0.0",
    },
  });
  await store.finalizeJson(
    "execution.json",
    {
      schemaVersion: "1.0.0",
      status: "completed",
      plan: {
        tasks: [{ taskId: "task-1" }],
        variants: [{ variantId: "pi" }],
        repetitions: 1,
      },
      trials: [{ trialId: "trial_1" }],
    },
    { sensitivity: "local", producer: "fixture" },
  );
  const report = await store.finalizeJson(
    "report/report.json",
    { schemaVersion: "1.0.0", overview: { title: "Fixture report" } },
    { sensitivity: "local", producer: "fixture" },
  );
  await store.finalizeIndex();
  return { store, report };
}

function statusHarness(options: {
  readonly entries?: readonly PiSessionEntry[];
  readonly selection?: string;
}) {
  const commands = new Map<string, PiCommandDefinition>();
  const entries = [...(options.entries ?? [])];
  const editors: { title: string; text: string | undefined }[] = [];
  const widgets: string[][] = [];
  const notifications: { message: string; level: string }[] = [];
  const api: PiExtensionApi = {
    registerCommand: (name, definition) => commands.set(name, definition),
    appendEntry: (customType, data) =>
      entries.push({ type: "custom", customType, data }),
    on: () => undefined,
  };
  const context = (cwd: string): PiExtensionCommandContext => ({
    cwd,
    sessionManager: { getEntries: () => entries },
    waitForIdle: () => Promise.resolve(),
    ui: {
      notify: (message, level) => notifications.push({ message, level }),
      confirm: () => Promise.resolve(false),
      input: () => Promise.resolve(undefined),
      select: () => Promise.resolve(options.selection),
      editor: (title, text) => {
        editors.push({ title, text });
        return Promise.resolve(undefined);
      },
      setStatus: () => undefined,
      setWidget: (_id, lines) => {
        if (lines !== undefined) widgets.push([...lines]);
      },
    },
  });
  return { api, commands, context, entries, editors, widgets, notifications };
}

describe("Pi durable status", () => {
  it("rediscovers the newest run and opens a hash-verified report", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-status-"));
    roots.push(root);
    await fixtureRun({
      root,
      runId: "run_01K0FAKE000000000000000000" as RunId,
      createdAt: "2026-07-23T01:00:00Z",
    });
    const latest = await fixtureRun({
      root,
      runId: "run_01K0FAKE000000000000000001" as RunId,
      createdAt: "2026-07-23T02:00:00Z",
    });
    const selection = `report/report.json (${latest.report.mediaType}, ${String(latest.report.size)} bytes)`;
    const value = statusHarness({ selection });
    registerStatusCommand(value.api);

    await value.commands.get("status")?.handler("", value.context(root));

    expect(value.widgets[0]?.join("\n")).toContain(latest.store.runId);
    expect(value.widgets[0]?.join("\n")).toContain("Trials: 1/1");
    expect(value.editors[0]?.text).toContain("Fixture report");
    expect(value.entries.at(-1)?.data).toEqual(
      expect.objectContaining({ runId: latest.store.runId }),
    );
  });

  it("restores a remembered run after reload or compaction", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-status-"));
    roots.push(root);
    const run = await fixtureRun({
      root,
      runId: "run_01K0FAKE000000000000000002" as RunId,
      createdAt: "2026-07-23T03:00:00Z",
    });
    const value = statusHarness({
      entries: [
        {
          type: "custom",
          customType: "patchrace-state-v1",
          data: {
            schemaVersion: "1.0.0",
            command: "race",
            status: "completed",
            runId: run.store.runId,
            artifactRoot: null,
          },
        },
      ],
      selection: "Close",
    });
    registerStatusCommand(value.api);

    await value.commands.get("status")?.handler("", value.context(root));

    expect(value.widgets[0]?.join("\n")).toContain(run.store.runId);
  });

  it("refuses hash drift and symlinked artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-status-"));
    roots.push(root);
    const valueRun = await fixtureRun({
      root,
      runId: "run_01K0FAKE000000000000000003" as RunId,
      createdAt: "2026-07-23T04:00:00Z",
    });
    const label = `report/report.json (${valueRun.report.mediaType}, ${String(valueRun.report.size)} bytes)`;
    const first = statusHarness({ selection: label });
    registerStatusCommand(first.api);
    await writeFile(
      join(valueRun.store.runRoot, "report", "report.json"),
      Buffer.alloc(valueRun.report.size, "x"),
    );

    await first.commands
      .get("status")
      ?.handler(valueRun.store.runId, first.context(root));

    expect(first.editors).toEqual([]);
    expect(first.notifications.at(-1)?.message).toContain("hash mismatch");

    const outside = join(root, "outside.txt");
    await writeFile(outside, Buffer.alloc(valueRun.report.size, "y"));
    await unlink(join(valueRun.store.runRoot, "report", "report.json"));
    await symlink(
      outside,
      join(valueRun.store.runRoot, "report", "report.json"),
    );
    const second = statusHarness({ selection: label });
    registerStatusCommand(second.api);
    await second.commands
      .get("status")
      ?.handler(valueRun.store.runId, second.context(root));
    expect(second.notifications.at(-1)?.message).toContain("non-symlink");
  });

  it("reports corrupt owned run state instead of silently claiming no run exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-status-"));
    roots.push(root);
    await mkdir(
      join(root, ".patchrace", "runs", "run_01K0FAKE000000000000000004"),
      { recursive: true },
    );
    const value = statusHarness({});
    registerStatusCommand(value.api);

    await value.commands.get("status")?.handler("", value.context(root));

    expect(value.notifications.at(-1)).toMatchObject({ level: "error" });
    expect(value.notifications.at(-1)?.message).not.toContain(
      "No durable PatchRace run was found",
    );
    expect(value.entries).toEqual([]);
  });
});
