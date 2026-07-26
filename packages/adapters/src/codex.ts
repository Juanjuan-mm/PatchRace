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

function itemEvent(
  builder: TraceBuilder,
  record: RawRecord,
  envelope: Readonly<Record<string, JsonValue>>,
): TraceEventV1 {
  const item = objectValue(envelope["item"]) ?? {};
  const itemType = stringValue(item["type"]) ?? "unknown";
  const envelopeType = stringValue(envelope["type"]) ?? "item.updated";
  const phase = envelopeType === "item.started" ? "started" : "completed";
  if (itemType === "agent_message" || itemType === "reasoning")
    return builder.fromRaw(
      record,
      "message.observable",
      {
        role: "assistant",
        kind: itemType === "reasoning" ? "vendor_reasoning_summary" : "message",
        text: stringValue(item["text"]),
      },
      { sensitivity: ["prompt", "source-code"] },
    );
  if (itemType === "command_execution")
    return builder.fromRaw(
      record,
      `command.${phase === "completed" && stringValue(item["status"]) === "failed" ? "failed" : phase}`,
      {
        invocationKind: "shell",
        command: stringValue(item["command"]),
        exitCode: numberValue(item["exit_code"]),
        status: stringValue(item["status"]),
      },
      { actor: "tool", sensitivity: ["source-code", "local-path"] },
    );
  if (itemType === "file_change") {
    const changes = Array.isArray(item["changes"]) ? item["changes"] : [];
    const paths = changes
      .map((change) => jsonObject(change))
      .filter(
        (change): change is Readonly<Record<string, JsonValue>> =>
          change !== null,
      )
      .map((change) => jsonString(change["path"]))
      .filter((path): path is string => path !== null);
    return builder.fromRaw(
      record,
      `edit.${phase}`,
      {
        operation: "patch",
        paths,
        status: stringValue(item["status"]),
      },
      { actor: "tool", sensitivity: ["source-code", "local-path"] },
    );
  }
  if (itemType === "web_search")
    return builder.fromRaw(
      record,
      `search.${phase}`,
      {
        searchKind: "web",
        query: stringValue(item["query"]),
      },
      { actor: "tool", sensitivity: ["prompt", "personal-data"] },
    );
  if (itemType === "mcp_tool_call")
    return builder.fromRaw(
      record,
      `tool.${phase}`,
      {
        tool: stringValue(item["tool"]),
        server: stringValue(item["server"]),
        normalizedClass: "mcp",
        status: stringValue(item["status"]),
      },
      { actor: "tool" },
    );
  return builder.fromRaw(
    record,
    `tool.${phase}`,
    {
      vendorItemType: itemType,
      normalizedClass: "other",
      status: stringValue(item["status"]),
    },
    { actor: "tool" },
  );
}

export class CodexAdapter extends CliAdapter {
  readonly id = "patchrace.codex.cli";
  readonly kind = "codex" as const;
  protected readonly defaultExecutable = "codex";
  protected readonly versionArgs = ["--version"] as const;
  protected readonly capabilities: AdapterCapabilities = {
    headless: true,
    structuredStream: true,
    sessionPersistence: true,
    cancellation: "signal",
    fileEvents: "unavailable",
    commandEvents: "observed",
    editEvents: "observed",
    tokenUsage: "observed",
    costUsage: "unavailable",
    modelIdentity: "unavailable",
    sandboxModes: ["read-only", "workspace-write"],
    approvalModes: ["never"],
  };

  protected authArgs(): readonly string[] | null {
    return ["login", "status"];
  }

  protected parseAuth(result: {
    readonly ok: boolean;
    readonly stdout: string;
    readonly stderr: string;
  }): ProbeResult["auth"] {
    const text = `${result.stdout}\n${result.stderr}`.trim();
    if (/not logged in|login required|no authentication/i.test(text))
      return { state: "missing" };
    if (/logged in using|authenticated/i.test(text)) {
      const method = /logged in using\s+([^\n]+)/i.exec(text)?.[1]?.trim();
      return { state: "ready", ...(method === undefined ? {} : { method }) };
    }
    return { state: result.ok ? "unknown" : "missing" };
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
    const sandbox = input.sandboxMode ?? "workspace-write";
    const args = [
      "exec",
      "--json",
      "--sandbox",
      sandbox,
      "--ask-for-approval",
      "never",
      "-C",
      resolved.cwd,
    ];
    if (input.persistSession === false) args.push("--ephemeral");
    if (input.model !== undefined) args.push("--model", input.model);
    args.push(input.instruction);
    return {
      executable: input.executable ?? this.defaultExecutable,
      args,
      ...(input.model === undefined ? {} : { model: input.model }),
      sandboxMode: sandbox,
      approvalMode: "never",
      limitations: ADAPTER_COMPATIBILITY.codex.degradations,
    };
  }

  protected extractMetrics(
    records: readonly RawRecord[],
    controllerDurationMs: number,
  ): AdapterMetrics {
    let metrics = emptyMetrics(controllerDurationMs);
    for (const record of records) {
      const object = recordObject(record);
      if (object === null || stringValue(object["type"]) !== "turn.completed")
        continue;
      const usage = objectValue(object["usage"]);
      if (usage === null) continue;
      const inputTokens = numberValue(usage["input_tokens"]);
      const cachedInputTokens = numberValue(usage["cached_input_tokens"]);
      const outputTokens = numberValue(usage["output_tokens"]);
      const reasoningOutputTokens = numberValue(
        usage["reasoning_output_tokens"],
      );
      metrics = {
        ...metrics,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        reasoningOutputTokens,
        totalTokens: sumKnown(inputTokens, outputTokens, reasoningOutputTokens),
      };
    }
    return metrics;
  }

  protected vendorErrors(records: readonly RawRecord[]): AdapterError[] {
    const errors: AdapterError[] = [];
    for (const record of records) {
      const object = recordObject(record);
      if (object === null) continue;
      const type = stringValue(object["type"]);
      if (type !== "turn.failed" && type !== "error") continue;
      const message =
        stringValue(object["message"]) ??
        stringValue(objectValue(object["error"])?.["message"]) ??
        "";
      const auth = /auth|login|credential|unauthorized/i.test(message);
      const network = /network|connect|timeout|rate limit/i.test(message);
      errors.push({
        code: auth
          ? "CODEX_AUTH_UNAVAILABLE"
          : network
            ? "CODEX_VENDOR_UNAVAILABLE"
            : "CODEX_AGENT_ERROR",
        category: auth
          ? "auth_unavailable"
          : network
            ? "network_or_vendor"
            : "agent_error",
        message: auth
          ? "Codex reported that official CLI authentication is unavailable."
          : network
            ? "Codex reported a network or vendor service failure."
            : "Codex reported an agent execution error.",
        rawRef: { path: "raw/records.jsonl", record: record.sequence },
        retryable: auth ? "no" : network ? "yes" : "unknown",
        ...(auth ? { remediation: "Run the official codex login flow." } : {}),
      });
    }
    return errors;
  }

  async *normalize(
    raw: AsyncIterable<RawRecord>,
    context: NormalizeContext,
  ): AsyncIterable<TraceEventV1> {
    const builder = new TraceBuilder(this.kind, this.adapterVersion, context);
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
      if (type === "thread.started")
        yield builder.fromRaw(record, "trial.started", {
          vendorThreadId: stringValue(object["thread_id"]),
        });
      else if (type === "turn.started")
        yield builder.fromRaw(record, "turn.started", {});
      else if (type?.startsWith("item.") === true)
        yield itemEvent(builder, record, object);
      else if (type === "turn.completed") {
        const usage = objectValue(object["usage"]);
        if (usage !== null)
          yield builder.fromRaw(record, "usage.reported", {
            input: numberValue(usage["input_tokens"]),
            cachedInput: numberValue(usage["cached_input_tokens"]),
            output: numberValue(usage["output_tokens"]),
            reasoningOutput: numberValue(usage["reasoning_output_tokens"]),
          });
        yield builder.fromRaw(record, "turn.completed", {});
        yield builder.fromRaw(record, "trial.completed", {
          terminalState: "completed",
        });
      } else if (type === "turn.failed" || type === "error") {
        yield builder.fromRaw(record, "error.observed", {
          code: "CODEX_AGENT_ERROR",
          category: "agent_error",
          retryable: "unknown",
        });
        if (type === "turn.failed")
          yield builder.fromRaw(record, "trial.failed", {
            terminalState: "failed",
          });
      } else builder.skipped();
    }
    yield builder.unavailable(
      "costUsage",
      "Codex JSONL does not expose vendor cost for the supported profile.",
    );
    yield builder.unavailable(
      "fileReads",
      "Codex file reads are unavailable unless represented by an emitted item.",
    );
    yield builder.summary(ADAPTER_COMPATIBILITY.codex.degradations);
  }
}
