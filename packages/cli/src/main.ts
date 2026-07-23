#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { CommanderError } from "commander";

import { ExitCode, normalizeError } from "@patchrace/contracts";

import { createCli } from "./index.js";

export async function main(
  argv: readonly string[] = process.argv,
): Promise<number> {
  try {
    await createCli().parseAsync([...argv]);
    return ExitCode.Ok;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (
        error.code === "commander.helpDisplayed" ||
        error.code === "commander.version"
      ) {
        return ExitCode.Ok;
      }
      return ExitCode.Usage;
    }

    const normalized = normalizeError(error);
    const machineMode = argv.includes("--json");
    if (machineMode) {
      process.stdout.write(`${JSON.stringify(normalized.toJSON())}\n`);
    } else {
      process.stderr.write(
        `${normalized.details.code}: ${normalized.message}\n`,
      );
    }
    return normalized.exitCode;
  }
}

export function isDirectExecution(
  moduleUrl: string,
  executablePath: string | undefined,
): boolean {
  if (!executablePath) return false;
  try {
    return (
      realpathSync(fileURLToPath(moduleUrl)) === realpathSync(executablePath)
    );
  } catch {
    return false;
  }
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  process.exitCode = await main();
}
