import type { CommandResult } from "@patchrace/core";

import { parseNamedOptions, tokenizeArguments } from "./arguments.js";
import type { PatchRaceBridge } from "./bridge.js";
import type { PiExtensionApi, PiExtensionCommandContext } from "./pi-api.js";
import {
  PATCHRACE_SESSION_ENTRY,
  sessionStateLines,
  stateFromResult,
} from "./session-state.js";

const RACE_OPTIONS = new Set([
  "--config",
  "--suite",
  "--variants",
  "--repeat",
  "--verifier-root",
  "--state-dir",
]);
const RACE_STATUS = "patchrace-race";

function positiveInteger(value: string, option: string): string {
  if (!/^[1-9]\d*$/u.test(value))
    throw new Error(`${option} must be a positive integer.`);
  return value;
}

function startArguments(
  options: ReadonlyMap<string, string>,
): readonly string[] {
  const values = ["race"];
  for (const name of [
    "--config",
    "--suite",
    "--variants",
    "--repeat",
    "--verifier-root",
    "--state-dir",
  ]) {
    const value = options.get(name);
    if (value === undefined) continue;
    values.push(
      name,
      name === "--repeat" ? positiveInteger(value, name) : value,
    );
  }
  return values;
}

async function interactiveOptions(
  context: PiExtensionCommandContext,
): Promise<ReadonlyMap<string, string> | null> {
  const config = await context.ui.input(
    "PatchRace suite config",
    ".patchrace/suite.yaml",
  );
  if (config === undefined) return null;
  const variants = await context.ui.input(
    "Variant IDs (comma-separated; blank uses config)",
  );
  if (variants === undefined) return null;
  const repeat = await context.ui.input("Repetitions", "1");
  if (repeat === undefined) return null;
  const options = new Map<string, string>();
  options.set("--config", config.trim() || ".patchrace/suite.yaml");
  if (variants.trim().length > 0) options.set("--variants", variants.trim());
  options.set("--repeat", positiveInteger(repeat.trim() || "1", "--repeat"));
  return options;
}

function exactCommand(cwd: string, arguments_: readonly string[]): string {
  return `patchrace --json --project ${JSON.stringify(cwd)} ${arguments_
    .map((value) => JSON.stringify(value))
    .join(" ")}`;
}

function resultText(result: CommandResult): string {
  return JSON.stringify(
    {
      command: result.command,
      status: result.status,
      sideEffects: result.sideEffects,
      data: result.data ?? null,
    },
    null,
    2,
  );
}

async function inspectRace(
  bridge: PatchRaceBridge,
  runId: string,
  context: PiExtensionCommandContext,
): Promise<void> {
  await context.waitForIdle();
  context.ui.setStatus(RACE_STATUS, `inspecting ${runId}`);
  try {
    const result = await bridge.execute({
      cwd: context.cwd,
      arguments: ["report", runId, "--format", "json"],
    });
    await context.ui.editor(`PatchRace run ${runId}`, resultText(result));
  } finally {
    context.ui.setStatus(RACE_STATUS, undefined);
  }
}

export function registerRaceCommand(
  pi: PiExtensionApi,
  bridge: PatchRaceBridge,
): void {
  pi.registerCommand("race", {
    description: "Configure, start, or inspect a durable PatchRace race",
    handler: async (rawArguments, context) => {
      try {
        const tokens = tokenizeArguments(rawArguments);
        if (tokens[0] === "inspect") {
          const runId = tokens[1];
          if (runId === undefined || tokens.length !== 2)
            throw new Error("Usage: /race inspect <run-id>");
          await inspectRace(bridge, runId, context);
          return;
        }
        const options =
          tokens.length === 0
            ? await interactiveOptions(context)
            : parseNamedOptions(tokens, RACE_OPTIONS);
        if (options === null) {
          context.ui.notify("PatchRace race cancelled.", "warning");
          return;
        }
        const arguments_ = startArguments(options);
        const command = exactCommand(context.cwd, arguments_);
        context.ui.setWidget(RACE_STATUS, [
          "PatchRace race preview",
          command,
          "This may execute trusted repository setup/verifier commands and paid Agent trials.",
        ]);
        const confirmed = await context.ui.confirm(
          "Start PatchRace race?",
          `${command}\n\nThis may execute repository commands and consume configured Agent time/tokens/cost. Continue?`,
        );
        if (!confirmed) {
          context.ui.notify(
            "PatchRace race cancelled before execution.",
            "warning",
          );
          return;
        }

        await context.waitForIdle();
        context.ui.setStatus(RACE_STATUS, "running");
        const result = await bridge.execute({
          cwd: context.cwd,
          arguments: arguments_,
          onProgress: (text) => {
            const summary = text.trim();
            if (summary.length > 0) context.ui.setStatus(RACE_STATUS, summary);
          },
        });
        const state = stateFromResult(result);
        pi.appendEntry(PATCHRACE_SESSION_ENTRY, state);
        context.ui.setWidget(RACE_STATUS, sessionStateLines(state));
        const next = await context.ui.select("PatchRace race completed", [
          "Inspect result",
          "Keep status",
        ]);
        if (next === "Inspect result")
          await context.ui.editor("PatchRace race result", resultText(result));
        context.ui.notify("PatchRace race completed.", "info");
      } catch (error) {
        context.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      } finally {
        context.ui.setStatus(RACE_STATUS, undefined);
      }
    },
  });
}
