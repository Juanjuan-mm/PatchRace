import { Command } from "commander";

import type { CommandService, CommandName } from "@patchrace/core";
import { CoreCommandService } from "@patchrace/core";
import { TaskCommandService } from "@patchrace/tasks";

import { ComparisonCommandService } from "./comparison-service.js";
import { CandidateCommandService } from "./candidate-service.js";
import { TeachingCommandService } from "./teaching-service.js";
import { PATCHRACE_VERSION } from "./version.js";

export * from "./terminal.js";
export * from "./comparison-service.js";
export * from "./candidate-service.js";
export * from "./teaching-service.js";
export * from "./version.js";

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export interface CliDependencies {
  readonly service?: CommandService;
  readonly io?: CliIo;
}

const defaultIo: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

export function createCli(dependencies: CliDependencies = {}): Command {
  const io = dependencies.io ?? defaultIo;
  const service =
    dependencies.service ??
    new TeachingCommandService(
      new CandidateCommandService(
        new ComparisonCommandService(
          new TaskCommandService(new CoreCommandService()),
          io.stderr,
        ),
      ),
    );
  const program = new Command();

  program
    .name("patchrace")
    .description("Race coding agents, distill what wins, and make Pi better.")
    .version(PATCHRACE_VERSION)
    .option("--config <path>", "suite config", ".patchrace/suite.yaml")
    .option("--project <path>", "trusted repository root")
    .option("--state-dir <path>", "state directory")
    .option("--json", "emit stable machine-readable output")
    .option("--no-input", "fail rather than prompt")
    .option("--log-level <level>", "error|warn|info|debug", "info")
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({ writeOut: io.stdout, writeErr: io.stderr });

  const positionalKeys: Partial<Record<CommandName, readonly string[]>> = {
    report: ["runId"],
    diagnose: ["runId"],
    "teach pi": ["runId"],
    "candidate review": ["candidateId"],
    "candidate decide": ["candidateId"],
    promote: ["candidateId"],
    rollback: ["promotionId"],
  };
  const route =
    (commandName: CommandName) =>
    async (...args: unknown[]): Promise<void> => {
      const command = args.at(-1) as Command;
      const options = (args.at(-2) ?? {}) as Record<string, unknown>;
      const positional = args.slice(0, -2);
      const namedPositionals = Object.fromEntries(
        (positionalKeys[commandName] ?? []).map((key, index) => [
          key,
          positional[index],
        ]),
      );
      const result = await service.execute({
        command: commandName,
        options: {
          ...command.optsWithGlobals(),
          ...options,
          ...namedPositionals,
        },
      });
      const globalOptions = command.optsWithGlobals<{ json?: boolean }>();
      if (globalOptions.json === true) {
        io.stdout(`${JSON.stringify(result)}\n`);
      } else if (result.status === "placeholder") {
        io.stderr(
          `${commandName}: implementation is scheduled for a later milestone.\n`,
        );
      } else {
        io.stderr(`${commandName}: ${result.status}.\n`);
      }
    };

  program
    .command("init")
    .description("create a reviewable suite without invoking an agent")
    .option("--from-history", "seed candidates from local Git history")
    .option("--limit <count>", "maximum candidates")
    .option("--output <path>", "suite output path")
    .option("--force", "back up and replace existing generated files")
    .action(route("init"));

  program
    .command("mine")
    .description("produce task candidates for review")
    .option("--since <revision>", "oldest revision")
    .option("--max <count>", "maximum candidates")
    .option("--commit <sha>", "mine one commit")
    .option("--github-metadata", "read optional metadata through gh")
    .action(route("mine"));

  program
    .command("run")
    .description("run one or more durable trials")
    .option("--suite <id>", "suite id")
    .option("--variant <id>", "variant id")
    .option("--compare", "compare variants")
    .option("--resume <run-id>", "resume an interrupted run")
    .option("--verifier-root <path>", "external hidden verifier vault")
    .action(route("run"));

  program
    .command("race")
    .description("compare variants in a durable run")
    .option("--suite <id>", "suite id")
    .option("--variants <ids>", "comma-separated variant ids")
    .option("--repeat <count>", "repeat count")
    .option("--verifier-root <path>", "external hidden verifier vault")
    .action(route("race"));

  program
    .command("report <run-id>")
    .description("regenerate presentations from durable artifacts")
    .option("--format <format>", "json|html|junit|sarif", "html")
    .option("--output <path>", "report output path")
    .option("--redacted", "write a separate redacted export")
    .option("--preview", "preview export findings")
    .option("--confirm-export", "confirm the exact redacted export preview")
    .action(route("report"));

  program
    .command("diagnose <run-id>")
    .description("produce evidence-linked findings")
    .option("--focus <variant>", "focus variant")
    .option("--reflect", "use configured redacted reflection")
    .option("--format <format>", "json|html", "html")
    .option("--output <path>", "diagnosis report output path")
    .action(route("diagnose"));

  const teach = program
    .command("teach")
    .description("stage and validate workflow improvements");
  teach
    .command("pi [run-id]")
    .description("teach Pi from eligible evidence")
    .option("--target <kind>", "candidate kind")
    .option("--suite <id>", "training suite")
    .option("--baseline <id>", "baseline variant")
    .option("--budget-usd <amount>", "explicit cost budget")
    .option(
      "--phase <phase>",
      "diagnose|propose|screen|validate|report|all",
      "all",
    )
    .option("--fact <text>", "reviewed stable fact for guidance candidates")
    .option("--workflow-name <name>", "explicitly invoked workflow name")
    .option("--expected-effect <text>", "predeclared expected effect")
    .option("--minimum-improvement <ratio>", "predeclared success-rate delta")
    .option("--approve", "approve the exact review for validation")
    .option("--review-reason <text>", "reason for explicit review approval")
    .action(route("teach pi"));

  const candidate = program
    .command("candidate")
    .description("review and decide staged Pi candidates");
  candidate
    .command("review <candidate-id>")
    .description("read exact candidate review and validation evidence")
    .action(route("candidate review"));
  candidate
    .command("decide <candidate-id>")
    .description("append an explicit approve or reject decision")
    .option("--approve", "approve for validation only")
    .option("--reject", "reject and retain evidence")
    .requiredOption("--reason <text>", "bounded review reason")
    .action(route("candidate decide"));

  program
    .command("promote <candidate-id>")
    .description("promote an approved project-local candidate")
    .option("--preview", "show the exact plan")
    .option("--confirm", "confirm promotion")
    .option("--target <scope>", "promotion target", "project")
    .action(route("promote"));

  program
    .command("rollback <promotion-id>")
    .description("restore the exact pre-promotion state")
    .option("--preview", "show the exact reverse diff")
    .option("--confirm", "confirm rollback")
    .action(route("rollback"));

  program
    .command("doctor")
    .description("inspect environment readiness without revealing secrets")
    .option("--adapter <id>", "inspect one adapter")
    .action(route("doctor"));

  program
    .command("clean")
    .description("plan or perform exact-target cleanup")
    .option("--run <run-id>", "run to clean")
    .option("--dry-run", "list targets without deletion", true)
    .option("--worktrees", "include recorded worktrees")
    .option("--cache", "include eligible cache")
    .option("--older-than <duration>", "minimum cache age")
    .option("--artifacts", "include raw run artifacts")
    .option("--confirm", "confirm exact cleanup targets")
    .action(route("clean"));

  return program;
}
