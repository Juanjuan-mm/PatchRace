import { CliPatchRaceBridge, type PatchRaceBridge } from "./bridge.js";
import { registerCandidateCommands } from "./candidate.js";
import { registerDiagnosisCommands } from "./diagnosis.js";
import type { PiExtensionApi } from "./pi-api.js";
import { registerRaceCommand } from "./race.js";
import { registerStatusCommand } from "./status.js";
import {
  latestSessionState,
  PATCHRACE_SESSION_ENTRY,
  sessionStateLines,
  stateFromResult,
} from "./session-state.js";

export const PI_EXTENSION_API_VERSION = "1.0.0" as const;
export const PATCHRACE_STATUS_WIDGET = "patchrace-status";

export interface PatchRaceExtensionOptions {
  readonly bridge?: PatchRaceBridge;
}

function commandArguments(args: string): "help" | "doctor" | "reload" {
  const normalized = args.trim();
  if (normalized.length === 0 || normalized === "help") return "help";
  if (normalized === "doctor") return "doctor";
  if (normalized === "reload") return "reload";
  throw new Error(
    "Usage: /patchrace [help|doctor|reload]. Workflow commands are registered separately.",
  );
}

export function createPatchRaceExtension(
  options: PatchRaceExtensionOptions = {},
): (pi: PiExtensionApi) => void {
  const bridge = options.bridge ?? new CliPatchRaceBridge();
  return (pi) => {
    registerRaceCommand(pi, bridge);
    registerDiagnosisCommands(pi, bridge);
    registerCandidateCommands(pi, bridge);
    registerStatusCommand(pi);
    pi.registerCommand("patchrace", {
      description: "Show PatchRace help or inspect local readiness",
      handler: async (args, context) => {
        try {
          const command = commandArguments(args);
          if (command === "help") {
            context.ui.notify(
              "PatchRace commands: /patchrace doctor|reload. Race, coach, review, and status commands are provided by this package.",
              "info",
            );
            return;
          }
          await context.waitForIdle();
          if (command === "reload") {
            if (context.reload === undefined)
              throw new Error(
                "This Pi version does not expose extension reload.",
              );
            await context.reload();
            context.ui.notify(
              "PatchRace extension resources reloaded.",
              "info",
            );
            return;
          }
          context.ui.setStatus(PATCHRACE_STATUS_WIDGET, "checking readiness");
          const result = await bridge.execute({
            cwd: context.cwd,
            arguments: ["doctor"],
            onProgress: (text) => {
              const summary = text.trim();
              if (summary.length > 0)
                context.ui.setStatus(PATCHRACE_STATUS_WIDGET, summary);
            },
          });
          const state = stateFromResult(result);
          pi.appendEntry(PATCHRACE_SESSION_ENTRY, state);
          context.ui.setWidget(
            PATCHRACE_STATUS_WIDGET,
            sessionStateLines(state),
          );
          context.ui.notify(
            "PatchRace readiness inspection completed.",
            "info",
          );
        } catch (error) {
          context.ui.notify(
            error instanceof Error ? error.message : String(error),
            "error",
          );
        } finally {
          context.ui.setStatus(PATCHRACE_STATUS_WIDGET, undefined);
        }
      },
    });

    pi.on("session_start", (_event, context) => {
      const state = latestSessionState(context.sessionManager.getEntries());
      if (state !== null)
        context.ui.setWidget(PATCHRACE_STATUS_WIDGET, sessionStateLines(state));
    });
  };
}

export default createPatchRaceExtension();

export * from "./bridge.js";
export * from "./candidate.js";
export * from "./compatibility.js";
export * from "./diagnosis.js";
export * from "./pi-api.js";
export * from "./race.js";
export * from "./session-state.js";
export * from "./status.js";
