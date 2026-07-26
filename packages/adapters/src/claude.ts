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

function contentBlocks(value: JsonValue | undefined): readonly JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function toolClass(name: string): string {
  const lower = name.toLowerCase();
  if (lower === "read" || lower.includes("read_file")) return "file.read";
  if (["grep", "glob", "search"].some((value) => lower.includes(value)))
    return "search";
  if (lower === "bash" || lower.includes("shell")) return "command";
  if (["edit", "write", "notebookedit"].some((value) => lower.includes(value)))
    return "edit";
  return "tool";
}

function mapToolUse(
  builder: TraceBuilder,
  record: RawRecord,
  block: Readonly<Record<string, JsonValue>>,
): TraceEventV1 {
  const name = jsonString(block["name"]) ?? "unknown";
  const input = jsonObject(block["input"]) ?? {};
  const kind = toolClass(name);
  if (kind === "file.read")
    return builder.fromRaw(
      record,
      "file.read.started",
      {
        tool: name,
        path: jsonString(input["file_path"]) ?? jsonString(input["path"]),
      },
      { actor: "tool", sensitivity: ["source-code", "local-path"] },
    );
  if (kind === "search")
    return builder.fromRaw(
      record,
      "search.started",
      {
        tool: name,
        searchKind: name.toLowerCase().includes("glob") ? "path" : "text",
        query: jsonString(input["pattern"]) ?? jsonString(input["query"]),
        scope: jsonString(input["path"]),
      },
      { actor: "tool", sensitivity: ["source-code", "local-path"] },
    );
  if (kind === "command")
    return builder.fromRaw(
      record,
      "command.started",
      {
        tool: name,
        invocationKind: "shell",
        command: jsonString(input["command"]),
      },
      { actor: "tool", sensitivity: ["source-code", "local-path"] },
    );
  if (kind === "edit")
    return builder.fromRaw(
      record,
      "edit.started",
      {
        tool: name,
        operation: name.toLowerCase().includes("write") ? "create" : "modify",
        path: jsonString(input["file_path"]) ?? jsonString(input["path"]),
      },
      { actor: "tool", sensitivity: ["source-code", "local-path"] },
    );
  return builder.fromRaw(
    record,
    "tool.started",
    {
      tool: name,
      normalizedClass: "other",
    },
    { actor: "tool" },
  );
}

export class ClaudeCodeAdapter extends CliAdapter {
  readonly id = "patchrace.claude-code.cli";
  readonly kind = "claude-code" as const;
  protected readonly defaultExecutable = "claude";
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
    costUsage: "observed",
    modelIdentity: "observed",
    sandboxModes: [],
    approvalModes: ["never"],
  };

  protected authArgs(): readonly string[] | null {
    return ["auth", "status"];
  }

  protected parseAuth(result: {
    readonly ok: boolean;
    readonly stdout: string;
    readonly stderr: string;
  }): ProbeResult["auth"] {
    const text = `${result.stdout}\n${result.stderr}`.trim();
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed !== null && typeof parsed === "object") {
        const value = parsed as Record<string, unknown>;
        if (value["loggedIn"] === true)
          return {
            state: "ready",
            ...(typeof value["authMethod"] === "string"
              ? { method: value["authMethod"] }
              : {}),
          };
        if (value["loggedIn"] === false) return { state: "missing" };
      }
    } catch {
      // Fall through to the bounded official status text.
    }
    if (/not logged in|loggedin["':\s]+false/i.test(text))
      return { state: "missing" };
    if (/logged in|loggedin["':\s]+true/i.test(text)) return { state: "ready" };
    return { state: result.ok ? "unknown" : "missing" };
  }

  protected buildInvocation(
    input: PrepareInput,
    _resolved: {
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
    const args = [
      "-p",
      input.instruction,
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      "dontAsk",
    ];
    if (input.model !== undefined) args.push("--model", input.model);
    if (input.persistSession === false) args.push("--no-session-persistence");
    return {
      executable: input.executable ?? this.defaultExecutable,
      args,
      ...(input.model === undefined ? {} : { model: input.model }),
      sandboxMode: input.sandboxMode ?? "workspace-write",
      approvalMode: "never",
      limitations: ADAPTER_COMPATIBILITY["claude-code"].degradations,
    };
  }

  protected extractMetrics(
    records: readonly RawRecord[],
    controllerDurationMs: number,
  ): AdapterMetrics {
    let metrics = emptyMetrics(controllerDurationMs);
    for (const record of records) {
      const object = recordObject(record);
      if (object === null || stringValue(object["type"]) !== "result") continue;
      const usage = objectValue(object["usage"]);
      const inputTokens =
        usage === null ? null : numberValue(usage["input_tokens"]);
      const cachedInputTokens =
        usage === null ? null : numberValue(usage["cache_read_input_tokens"]);
      const outputTokens =
        usage === null ? null : numberValue(usage["output_tokens"]);
      metrics = {
        ...metrics,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        totalTokens: sumKnown(inputTokens, cachedInputTokens, outputTokens),
        cost:
          numberValue(object["total_cost_usd"]) === null
            ? null
            : {
                amount: numberValue(object["total_cost_usd"])!,
                currency: "USD",
              },
        turns: numberValue(object["num_turns"]),
        vendorDurationMs: numberValue(object["duration_ms"]),
      };
    }
    return metrics;
  }

  protected vendorErrors(records: readonly RawRecord[]): AdapterError[] {
    const errors: AdapterError[] = [];
    for (const record of records) {
      const object = recordObject(record);
      if (object === null || stringValue(object["type"]) !== "result") continue;
      if (object["is_error"] !== true) continue;
      const subtype = stringValue(object["subtype"]) ?? "unknown";
      const result = stringValue(object["result"]) ?? "";
      const auth = /auth|login|credential/i.test(`${subtype} ${result}`);
      errors.push({
        code: auth ? "CLAUDE_AUTH_UNAVAILABLE" : "CLAUDE_AGENT_ERROR",
        category: auth ? "auth_unavailable" : "agent_error",
        message: auth
          ? "Claude Code reported that official CLI authentication is unavailable."
          : "Claude Code reported an agent execution error.",
        vendorCode: subtype,
        rawRef: { path: "raw/records.jsonl", record: record.sequence },
        retryable: auth ? "no" : "unknown",
        ...(auth
          ? { remediation: "Run the official Claude Code login flow." }
          : {}),
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
      if (type === "system") {
        yield builder.fromRaw(record, "trial.started", {
          sessionId: stringValue(object["session_id"]),
          model: stringValue(object["model"]),
        });
      } else if (type === "assistant" || type === "user") {
        const message = objectValue(object["message"]);
        for (const entry of contentBlocks(message?.["content"])) {
          const block = jsonObject(entry);
          if (block === null) continue;
          const blockType = jsonString(block["type"]);
          if (blockType === "text") {
            const text = jsonString(block["text"]);
            if (text !== null)
              yield builder.fromRaw(
                record,
                "message.observable",
                {
                  role: jsonString(message?.["role"]) ?? type,
                  text,
                },
                { sensitivity: ["prompt", "source-code"] },
              );
          } else if (blockType === "tool_use")
            yield mapToolUse(builder, record, block);
          else if (blockType === "tool_result")
            yield builder.fromRaw(
              record,
              "tool.completed",
              {
                toolUseId: jsonString(block["tool_use_id"]),
                isError: block["is_error"] === true,
              },
              { actor: "tool", sensitivity: ["source-code"] },
            );
          else builder.skipped();
        }
      } else if (type === "result") {
        const failed = object["is_error"] === true;
        const text = stringValue(object["result"]);
        if (text !== null)
          yield builder.fromRaw(
            record,
            "message.observable",
            {
              role: "assistant",
              text,
            },
            { sensitivity: ["prompt", "source-code"] },
          );
        const usage = objectValue(object["usage"]);
        if (usage !== null)
          yield builder.fromRaw(record, "usage.reported", {
            input: numberValue(usage["input_tokens"]),
            cachedInput: numberValue(usage["cache_read_input_tokens"]),
            cacheWrite: numberValue(usage["cache_creation_input_tokens"]),
            output: numberValue(usage["output_tokens"]),
          });
        const cost = numberValue(object["total_cost_usd"]);
        if (cost !== null) {
          sawCost = true;
          yield builder.fromRaw(record, "cost.reported", {
            amount: cost,
            currency: "USD",
            accountingBasis: "vendor_reported",
          });
        }
        if (failed)
          yield builder.fromRaw(record, "error.observed", {
            code: "CLAUDE_AGENT_ERROR",
            category: "agent_error",
            vendorCode: stringValue(object["subtype"]),
            retryable: "unknown",
          });
        yield builder.fromRaw(
          record,
          failed ? "trial.failed" : "trial.completed",
          {
            terminalState: failed ? "failed" : "completed",
          },
        );
      } else builder.skipped();
    }
    if (!sawCost)
      yield builder.unavailable(
        "costUsage",
        "Claude Code did not expose vendor cost in the captured result.",
      );
    yield builder.summary(ADAPTER_COMPATIBILITY["claude-code"].degradations);
  }
}
