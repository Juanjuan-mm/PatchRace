import type { JsonValue } from "@patchrace/contracts";

import {
  CliAdapter,
  numberValue,
  objectValue,
  recordObject,
  stringValue,
} from "./base.js";
import { ADAPTER_COMPATIBILITY } from "./compatibility.js";
import {
  jsonNumber,
  jsonObject,
  jsonString,
  sumKnown,
  TraceBuilder,
} from "./normalizer.js";
import {
  emptyMetrics,
  type AdapterCapabilities,
  type AdapterError,
  type AdapterMetrics,
  type NormalizeContext,
  type PrepareInput,
  type PreparedInvocation,
  type ProbeResult,
  type RawRecord,
  type TraceEventV1,
} from "./types.js";

function messageText(value: JsonValue | undefined): string | null {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return null;
  const parts: string[] = [];
  for (const entry of value) {
    const block = jsonObject(entry);
    if (block === null) continue;
    const text = jsonString(block["text"]);
    if (text !== null) parts.push(text);
  }
  return parts.length === 0 ? null : parts.join("");
}

function toolClass(
  name: string,
): "file" | "search" | "command" | "edit" | "other" {
  const normalized = name.toLowerCase();
  if (["read", "read_file", "cat"].includes(normalized)) return "file";
  if (["grep", "find", "search", "rg"].includes(normalized)) return "search";
  if (["bash", "shell", "command", "exec"].includes(normalized))
    return "command";
  if (["edit", "write", "write_file", "apply_patch"].includes(normalized))
    return "edit";
  return "other";
}

function piToolEvent(
  builder: TraceBuilder,
  record: RawRecord,
  object: Readonly<Record<string, JsonValue>>,
): TraceEventV1 {
  const name =
    stringValue(object["toolName"]) ??
    stringValue(object["tool_name"]) ??
    stringValue(object["name"]) ??
    "unknown";
  const type = stringValue(object["type"]) ?? "tool_execution_start";
  const phase = type.endsWith("_start")
    ? "started"
    : type.endsWith("_end")
      ? object["isError"] === true
        ? "failed"
        : "completed"
      : "progress";
  const args =
    objectValue(object["args"]) ?? objectValue(object["arguments"]) ?? {};
  const classification = toolClass(name);
  if (classification === "file")
    return builder.fromRaw(
      record,
      `file.read.${phase}`,
      {
        tool: name,
        path: stringValue(args["path"]) ?? stringValue(args["file_path"]),
      },
      { actor: "tool", sensitivity: ["source-code", "local-path"] },
    );
  if (classification === "search")
    return builder.fromRaw(
      record,
      `search.${phase}`,
      {
        tool: name,
        searchKind: "text",
        query: stringValue(args["query"]) ?? stringValue(args["pattern"]),
        scope: stringValue(args["path"]),
      },
      { actor: "tool", sensitivity: ["source-code", "local-path"] },
    );
  if (classification === "command")
    return builder.fromRaw(
      record,
      `command.${phase}`,
      {
        tool: name,
        invocationKind: "shell",
        command:
          stringValue(args["command"]) ?? stringValue(args["cmd"]) ?? null,
        exitCode: numberValue(object["exitCode"]),
      },
      { actor: "tool", sensitivity: ["source-code", "local-path"] },
    );
  if (classification === "edit")
    return builder.fromRaw(
      record,
      `edit.${phase}`,
      {
        tool: name,
        operation: name.toLowerCase().includes("write") ? "create" : "modify",
        path: stringValue(args["path"]) ?? stringValue(args["file_path"]),
      },
      { actor: "tool", sensitivity: ["source-code", "local-path"] },
    );
  return builder.fromRaw(
    record,
    `tool.${phase}`,
    {
      tool: name,
      normalizedClass: "other",
    },
    { actor: "tool" },
  );
}

export class PiCliAdapter extends CliAdapter {
  readonly id = "patchrace.pi.cli";
  readonly kind = "pi" as const;
  protected readonly defaultExecutable = "pi";
  protected readonly versionArgs = ["--version"] as const;
  protected readonly capabilities: AdapterCapabilities = {
    headless: true,
    structuredStream: true,
    sessionPersistence: true,
    cancellation: "signal",
    fileEvents: "observed",
    commandEvents: "observed",
    editEvents: "observed",
    tokenUsage: "observed",
    costUsage: "unavailable",
    modelIdentity: "observed",
    sandboxModes: [],
    approvalModes: ["never"],
  };

  protected authArgs(): readonly string[] | null {
    return null;
  }

  protected parseAuth(_result: {
    readonly ok: boolean;
    readonly stdout: string;
    readonly stderr: string;
  }): ProbeResult["auth"] {
    return {
      state: "unknown",
      detail:
        "Pi CLI has no supported non-mutating auth status command; readiness is established by invocation preflight.",
    };
  }

  protected override retainStructuredRecord(record: RawRecord): boolean {
    // Pi's message_update payload contains the cumulative assistant message,
    // so retaining every update grows quadratically for long turns. The exact
    // vendor bytes remain append-only in raw/stdout.log; message_end retains
    // the completed observable message and usage in structured records.
    return record.vendorType !== "message_update";
  }

  protected override environmentFor(
    _input: PrepareInput,
    resolved: {
      readonly cwd: string;
      readonly resourceRoot?: string;
      readonly sessionRoot?: string;
    },
  ): Readonly<Record<string, string>> {
    return {
      PI_TELEMETRY: "0",
      ...(resolved.resourceRoot === undefined
        ? {}
        : { PI_CODING_AGENT_DIR: resolved.resourceRoot }),
      ...(resolved.sessionRoot === undefined
        ? {}
        : { PI_CODING_AGENT_SESSION_DIR: resolved.sessionRoot }),
    };
  }

  protected buildInvocation(
    input: PrepareInput,
    resolved: {
      readonly cwd: string;
      readonly resourceRoot?: string;
      readonly sessionRoot?: string;
    },
  ): Omit<
    PreparedInvocation,
    | "invocationId"
    | "adapter"
    | "adapterVersion"
    | "executionMode"
    | "trialId"
    | "taskHash"
    | "variantHash"
    | "cwd"
    | "instructionHash"
    | "executableArgumentCount"
    | "inheritEnvironment"
    | "environment"
    | "environmentNames"
    | "budgets"
  > {
    const policy = input.resourcePolicy ?? {};
    const args: string[] = ["--mode", "json"];
    if (input.model !== undefined) args.push("--model", input.model);
    if (policy.extensions === false) args.push("--no-extensions");
    if (policy.skills === false) args.push("--no-skills");
    if (policy.promptTemplates === false) args.push("--no-prompt-templates");
    if (policy.contextFiles === false) args.push("--no-context-files");
    if (input.persistSession === false || resolved.sessionRoot === undefined)
      args.push("--no-session");
    else args.push("--session-dir", resolved.sessionRoot);
    args.push("--print", input.instruction);
    return {
      executable: input.executable ?? this.defaultExecutable,
      args,
      ...(resolved.resourceRoot === undefined
        ? {}
        : { resourceRoot: resolved.resourceRoot }),
      ...(resolved.sessionRoot === undefined
        ? {}
        : { sessionRoot: resolved.sessionRoot }),
      ...(input.model === undefined ? {} : { model: input.model }),
      sandboxMode: input.sandboxMode ?? "workspace-write",
      approvalMode: "never",
      limitations: ADAPTER_COMPATIBILITY.pi.degradations,
    };
  }

  protected extractMetrics(
    records: readonly RawRecord[],
    controllerDurationMs: number,
  ): AdapterMetrics {
    let inputTokens: number | null = null;
    let cachedInputTokens: number | null = null;
    let outputTokens: number | null = null;
    let totalTokens: number | null = null;
    let costAmount: number | null = null;
    let turns = 0;
    let toolCalls = 0;
    let model: string | null = null;
    for (const record of records) {
      const object = recordObject(record);
      if (object === null) continue;
      const type = stringValue(object["type"]);
      if (type === "turn_end") turns += 1;
      if (type === "tool_execution_start") toolCalls += 1;
      const message = objectValue(object["message"]);
      const usage =
        objectValue(object["usage"]) ??
        (message === null ? null : objectValue(message["usage"]));
      if (usage !== null) {
        inputTokens =
          numberValue(usage["input_tokens"]) ??
          numberValue(usage["input"]) ??
          inputTokens;
        cachedInputTokens =
          numberValue(usage["cache_read"]) ??
          numberValue(usage["cached_input_tokens"]) ??
          cachedInputTokens;
        outputTokens =
          numberValue(usage["output_tokens"]) ??
          numberValue(usage["output"]) ??
          outputTokens;
        totalTokens =
          numberValue(usage["total_tokens"]) ??
          numberValue(usage["totalTokens"]) ??
          totalTokens;
        const cost = objectValue(usage["cost"]);
        costAmount = cost === null ? costAmount : numberValue(cost["total"]);
      }
      model =
        stringValue(object["model"]) ??
        (message === null ? null : stringValue(message["model"])) ??
        model;
    }
    totalTokens ??= sumKnown(inputTokens, outputTokens);
    return {
      ...emptyMetrics(controllerDurationMs),
      inputTokens,
      cachedInputTokens,
      outputTokens,
      totalTokens,
      cost:
        costAmount === null ? null : { amount: costAmount, currency: "USD" },
      turns: turns === 0 ? null : turns,
      toolCalls: toolCalls === 0 ? null : toolCalls,
      model,
    };
  }

  protected vendorErrors(records: readonly RawRecord[]): AdapterError[] {
    const errors: AdapterError[] = [];
    for (const record of records) {
      const object = recordObject(record);
      if (object === null) continue;
      const type = stringValue(object["type"]);
      if (type !== "error" && type !== "agent_error") continue;
      errors.push({
        code: "PI_AGENT_ERROR",
        category: "agent_error",
        message: "Pi reported an agent execution error.",
        rawRef: { path: "raw/records.jsonl", record: record.sequence },
        retryable: "unknown",
      });
    }
    return errors;
  }

  async *normalize(
    raw: AsyncIterable<RawRecord>,
    context: NormalizeContext,
  ): AsyncIterable<TraceEventV1> {
    const builder = new TraceBuilder(this.kind, this.adapterVersion, context);
    let sawCost = false;
    for await (const record of raw) {
      builder.observe(record);
      if (record.parseError !== undefined) {
        yield builder.parserError(record);
        continue;
      }
      const object = recordObject(record);
      if (object === null) {
        builder.skipped();
        continue;
      }
      const type = stringValue(object["type"]);
      if (type === "session") {
        yield builder.fromRaw(record, "capability.reported", {
          sessionPersistence: true,
          model: stringValue(object["model"]),
        });
      } else if (type === "agent_start")
        yield builder.fromRaw(record, "trial.started", {});
      else if (type === "agent_end")
        yield builder.fromRaw(record, "trial.completed", {
          terminalState: "completed",
        });
      else if (type === "turn_start")
        yield builder.fromRaw(record, "turn.started", {});
      else if (type === "turn_end")
        yield builder.fromRaw(record, "turn.completed", {});
      else if (type?.startsWith("tool_execution_") === true)
        yield piToolEvent(builder, record, object);
      else if (type === "message_end" || type === "message_update") {
        const message = objectValue(object["message"]);
        const text = message === null ? null : messageText(message["content"]);
        if (text !== null)
          yield builder.fromRaw(
            record,
            "message.observable",
            {
              role: stringValue(message?.["role"]) ?? "assistant",
              text,
            },
            { sensitivity: ["prompt", "source-code"] },
          );
        const usage =
          objectValue(object["usage"]) ??
          (message === null ? null : objectValue(message["usage"]));
        if (usage !== null) {
          const cost = objectValue(usage["cost"]);
          sawCost ||= cost !== null && jsonNumber(cost["total"]) !== null;
          yield builder.fromRaw(record, "usage.reported", {
            input:
              jsonNumber(usage["input_tokens"]) ?? jsonNumber(usage["input"]),
            cachedInput:
              jsonNumber(usage["cached_input_tokens"]) ??
              jsonNumber(usage["cache_read"]),
            output:
              jsonNumber(usage["output_tokens"]) ?? jsonNumber(usage["output"]),
            total:
              jsonNumber(usage["total_tokens"]) ??
              jsonNumber(usage["totalTokens"]),
          });
        }
      } else if (type === "error" || type === "agent_error")
        yield builder.fromRaw(record, "error.observed", {
          code: "PI_AGENT_ERROR",
          category: "agent_error",
          retryable: "unknown",
        });
      else builder.skipped();
    }
    if (!sawCost)
      yield builder.unavailable(
        "costUsage",
        "Pi did not expose cost in the captured stream.",
      );
    yield builder.summary(ADAPTER_COMPATIBILITY.pi.degradations);
  }
}
