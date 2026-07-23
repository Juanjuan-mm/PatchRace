import { resolve } from "node:path";

import { PatchRaceError, SCHEMA_VERSION } from "@patchrace/contracts";

import { executeCleanup, planCacheCleanup, planRunCleanup } from "./cleanup.js";
import { inspectEnvironment } from "./doctor.js";

export const commandNames = [
  "init",
  "mine",
  "run",
  "race",
  "report",
  "diagnose",
  "teach pi",
  "candidate review",
  "candidate decide",
  "promote",
  "rollback",
  "doctor",
  "clean",
] as const;

export type CommandName = (typeof commandNames)[number];

export interface CommandRequest {
  readonly command: CommandName;
  readonly options: Readonly<Record<string, unknown>>;
}

export interface CommandResult {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly ok: true;
  readonly command: CommandName;
  readonly status: "placeholder" | "completed" | "dry-run";
  readonly sideEffects: readonly string[];
  readonly data?: unknown;
}

export class CoreCommandService implements CommandService {
  async execute(request: CommandRequest): Promise<CommandResult> {
    if (request.command === "doctor") {
      const projectRoot = resolve(
        String(request.options["project"] ?? process.cwd()),
      );
      const configPath = resolve(
        projectRoot,
        String(request.options["config"] ?? ".patchrace/suite.yaml"),
      );
      const report = await inspectEnvironment({
        projectRoot,
        configPath,
        ...(typeof request.options["adapter"] === "string"
          ? { adapterId: request.options["adapter"] }
          : {}),
      });
      return {
        schemaVersion: SCHEMA_VERSION,
        ok: true,
        command: request.command,
        status: "completed",
        sideEffects: [],
        data: report,
      };
    }
    if (request.command === "clean") {
      if (
        typeof request.options["run"] !== "string" &&
        request.options["cache"] !== true
      )
        throw new PatchRaceError({
          code: "CLEANUP_TARGET_REQUIRED",
          category: "USAGE",
          message:
            "Cleanup requires an explicit owned target; provide --run <run-id> or --cache.",
          path: "clean",
        });
      const projectRoot = resolve(
        String(request.options["project"] ?? process.cwd()),
      );
      const stateRoot = resolve(
        projectRoot,
        String(request.options["stateDir"] ?? ".patchrace"),
      );
      const age = String(request.options["olderThan"] ?? "30d");
      const match = /^(\d+)([mhd])$/.exec(age);
      if (request.options["cache"] === true && match === null)
        throw new PatchRaceError({
          code: "CLEANUP_DURATION_INVALID",
          category: "USAGE",
          message:
            "Cleanup duration must use an integer followed by m, h, or d.",
          path: "olderThan",
        });
      const multiplier =
        match?.[2] === "m"
          ? 60_000
          : match?.[2] === "h"
            ? 3_600_000
            : 86_400_000;
      const plan =
        typeof request.options["run"] === "string"
          ? await planRunCleanup({
              stateRoot,
              runId: request.options["run"],
              includeWorktrees: request.options["worktrees"] === true,
              includeArtifacts: request.options["artifacts"] === true,
            })
          : await planCacheCleanup({
              stateRoot,
              olderThanMs: Number(match?.[1]) * multiplier,
            });
      const confirmed = request.options["confirm"] === true;
      const result = await executeCleanup(plan, { confirm: confirmed });
      return {
        schemaVersion: SCHEMA_VERSION,
        ok: true,
        command: request.command,
        status: confirmed ? "completed" : "dry-run",
        sideEffects: result.removed,
        data: confirmed ? result : plan,
      };
    }
    return new PlaceholderCommandService().execute(request);
  }
}

export interface CommandService {
  execute(request: CommandRequest): Promise<CommandResult>;
}

export class PlaceholderCommandService implements CommandService {
  async execute(request: CommandRequest): Promise<CommandResult> {
    return Promise.resolve({
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      command: request.command,
      status: "placeholder",
      sideEffects: [],
    });
  }
}
