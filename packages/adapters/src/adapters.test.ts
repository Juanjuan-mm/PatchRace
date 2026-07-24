import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { canonicalHash, type TrialId } from "@patchrace/contracts";
import { Redactor } from "@patchrace/core";
import { afterEach, describe, expect, it } from "vitest";

import { ClaudeCodeAdapter } from "./claude.js";
import { CodexAdapter } from "./codex.js";
import {
  ADAPTER_COMPATIBILITY,
  isSupportedVersion,
  normalizeCliVersion,
} from "./compatibility.js";
import { createOtlpJsonTrace, writeOtlpJsonTraceExport } from "./export.js";
import {
  createPiSdkRuntime,
  PiSdkAdapter,
  type PiSdkSession,
} from "./pi-sdk.js";
import { PiCliAdapter } from "./pi.js";
import { MemoryAdapterSink } from "./sinks.js";
import type {
  AdapterKind,
  AdapterSink,
  AgentAdapter,
  PrepareInput,
  RawRecord,
  TraceEventV1,
} from "./types.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

const fixtureCli = `#!/usr/bin/env node
const fs = require("node:fs");
const kind = process.env.FIXTURE_KIND;
const version = process.env.FIXTURE_VERSION || (kind === "pi" ? "0.81.1" : kind === "claude-code" ? "2.1.104" : "0.145.0-alpha.18");
const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log(kind === "claude-code" ? version + " (Claude Code)" : kind === "codex" ? "codex-cli " + version : version);
  process.exit(0);
}
if ((kind === "claude-code" && args[0] === "auth") || (kind === "codex" && args[0] === "login")) {
  if (kind === "claude-code") console.log(JSON.stringify({ loggedIn: process.env.FIXTURE_AUTH !== "missing", authMethod: "fixture" }));
  else console.log(process.env.FIXTURE_AUTH === "missing" ? "Not logged in" : "Logged in using Fixture");
  process.exit(process.env.FIXTURE_AUTH === "missing" ? 1 : 0);
}
const instruction = args.join(" ");
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
process.stderr.write("fixture progress\\n");
if (instruction.includes("MALFORMED")) process.stdout.write("{not-json}\\n");
if (instruction.includes("OVERSIZED")) emit({ type: "unknown", payload: "x".repeat(4096) });
if (kind === "pi") {
  emit({ type: "session", model: "fixture-model" });
  emit({ type: "agent_start" });
  if (instruction.includes("HANG")) setInterval(() => {}, 1000);
  else {
    emit({ type: "turn_start" });
    emit({ type: "tool_execution_start", toolName: "bash", args: { command: "node --test" } });
    emit({ type: "tool_execution_end", toolName: "bash", exitCode: 0 });
    emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "FIXTURE_OK" }], usage: { input: 3, output: 2, totalTokens: 5 } } });
    emit({ type: "turn_end" });
    emit({ type: "agent_end" });
  }
} else if (kind === "claude-code") {
  emit({ type: "system", subtype: "init", session_id: "session_fixture", model: "fixture-model" });
  if (instruction.includes("HANG")) setInterval(() => {}, 1000);
  else if (instruction.includes("AUTH_FAIL")) emit({ type: "result", subtype: "authentication_failed", is_error: true, result: "Not logged in" });
  else {
    emit({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "Bash", input: { command: "node --test" } }, { type: "text", text: "FIXTURE_OK" }] } });
    emit({ type: "result", subtype: "success", is_error: false, result: "FIXTURE_OK", duration_ms: 10, num_turns: 1, total_cost_usd: 0.01, usage: { input_tokens: 3, cache_read_input_tokens: 1, output_tokens: 2 } });
  }
} else {
  emit({ type: "thread.started", thread_id: "thread_fixture" });
  emit({ type: "turn.started" });
  if (instruction.includes("HANG")) setInterval(() => {}, 1000);
  else {
    emit({ type: "item.started", item: { id: "cmd", type: "command_execution", command: "node --test", status: "in_progress" } });
    emit({ type: "item.completed", item: { id: "cmd", type: "command_execution", command: "node --test", status: "completed", exit_code: 0 } });
    emit({ type: "item.completed", item: { id: "edit", type: "file_change", status: "completed", changes: [{ path: "message.txt", kind: "update" }] } });
    emit({ type: "item.completed", item: { id: "message", type: "agent_message", text: "FIXTURE_OK" } });
    emit({ type: "turn.completed", usage: { input_tokens: 3, cached_input_tokens: 1, output_tokens: 2, reasoning_output_tokens: 1 } });
  }
}
if (!instruction.includes("HANG")) fs.writeFileSync("message.txt", "fixed\\n");
`;

async function fixture(): Promise<{ root: string; executable: string }> {
  const root = await mkdtemp(join(tmpdir(), "patchrace-adapters-"));
  roots.push(root);
  const executable = join(root, "fixture-agent.cjs");
  await writeFile(executable, fixtureCli);
  await chmod(executable, 0o755);
  await writeFile(join(root, "message.txt"), "broken\n");
  await mkdir(join(root, "resources"));
  await mkdir(join(root, "sessions"));
  return { root, executable };
}

function prepareInput(
  kind: AdapterKind,
  root: string,
  executable: string,
  instruction = "Complete the shared fixture",
  budgetOverrides: PrepareInput["budgets"] = {},
  version?: string,
): PrepareInput {
  return {
    executable,
    trialId:
      `trial_0000000000000000000000000${kind === "pi" ? "0" : kind === "claude-code" ? "1" : "2"}` as TrialId,
    taskHash: canonicalHash({ fixture: "shared" }),
    variantHash: canonicalHash({ kind }),
    worktree: root,
    instruction,
    resourceRoot: join(root, "resources"),
    sessionRoot: join(root, "sessions"),
    persistSession: false,
    environment: {
      FIXTURE_KIND: kind,
      FIXTURE_VERSION:
        version ??
        (kind === "pi"
          ? "0.81.1"
          : kind === "claude-code"
            ? "2.1.218"
            : "0.145.0"),
    },
    budgets: { wallMs: 2_000, terminationGraceMs: 30, ...budgetOverrides },
    resourcePolicy: {
      extensions: false,
      skills: false,
      promptTemplates: false,
      contextFiles: false,
    },
  };
}

async function collectTrace(
  adapter: AgentAdapter,
  records: readonly RawRecord[],
  trialId: TrialId,
): Promise<TraceEventV1[]> {
  async function* source(): AsyncIterable<RawRecord> {
    yield* records;
  }
  const events: TraceEventV1[] = [];
  for await (const event of adapter.normalize(source(), { trialId }))
    events.push(event);
  return events;
}

describe("shared adapter contract", () => {
  const cases = [
    ["pi", () => new PiCliAdapter()],
    ["claude-code", () => new ClaudeCodeAdapter()],
    ["codex", () => new CodexAdapter()],
  ] as const;

  for (const [kind, create] of cases) {
    for (const version of ADAPTER_COMPATIBILITY[kind].fixtureVersions) {
      it(`${kind} ${version} probes, prepares, streams, completes, and normalizes the shared fixture`, async () => {
        const files = await fixture();
        const adapter = create();
        const probe = await adapter.probe(
          {
            executable: files.executable,
            cwd: files.root,
            environment: { FIXTURE_KIND: kind, FIXTURE_VERSION: version },
          },
          new AbortController().signal,
        );
        expect(probe.executable).toMatchObject({ exists: true });
        expect(probe.version).toMatchObject({
          normalized: normalizeCliVersion(version),
          supported: true,
        });
        expect(probe.auth.state).toBe(kind === "pi" ? "unknown" : "ready");
        const prepared = await adapter.prepare(
          prepareInput(
            kind,
            files.root,
            files.executable,
            "Complete the shared fixture",
            {},
            version,
          ),
          new AbortController().signal,
        );
        expect(prepared.instructionHash).not.toContain(
          "Complete the shared fixture",
        );
        expect(prepared.environmentNames).toContain("FIXTURE_KIND");
        expect(prepared.args.join(" ")).toContain(
          kind === "pi"
            ? "--mode json"
            : kind === "claude-code"
              ? "stream-json"
              : "exec --json",
        );
        const sink = new MemoryAdapterSink();
        const result = await adapter.run(
          prepared,
          sink,
          new AbortController().signal,
        );
        expect(result.status).toBe("completed");
        expect(result.records.length).toBeGreaterThan(2);
        expect(sink.chunks.length).toBeGreaterThan(0);
        expect(await readFile(join(files.root, "message.txt"), "utf8")).toBe(
          "fixed\n",
        );
        const trace = await collectTrace(
          adapter,
          result.records,
          prepared.trialId,
        );
        expect(trace.some((event) => event.type === "trial.completed")).toBe(
          true,
        );
        expect(trace.at(-1)?.type).toBe("trace.summary");
        expect(trace.map((event) => event.sequence)).toEqual(
          trace.map((_, index) => index + 1),
        );
        expect(result.metrics.inputTokens).toBe(3);
      });
    }
  }

  it("supports explicit executable prefix arguments for cross-platform script CLIs", async () => {
    const files = await fixture();
    const adapter = new PiCliAdapter();
    const executableArgs = [files.executable];
    const probe = await adapter.probe(
      {
        executable: process.execPath,
        executableArgs,
        cwd: files.root,
        environment: { FIXTURE_KIND: "pi", FIXTURE_VERSION: "0.81.1" },
      },
      new AbortController().signal,
    );
    expect(probe).toMatchObject({
      availability: "degraded",
      version: { normalized: "0.81.1", supported: true },
    });
    const input = prepareInput(
      "pi",
      files.root,
      process.execPath,
      "Complete the prefixed fixture",
    );
    const prepared = await adapter.prepare(
      { ...input, executableArgs },
      new AbortController().signal,
    );
    expect(prepared.args[0]).toBe(files.executable);
    const result = await adapter.run(
      prepared,
      new MemoryAdapterSink(),
      new AbortController().signal,
    );
    expect(result.status).toBe("completed");
  });

  it("persists raw chunks before parsed records and retains malformed output", async () => {
    const files = await fixture();
    const adapter = new CodexAdapter();
    const prepared = await adapter.prepare(
      prepareInput("codex", files.root, files.executable, "MALFORMED fixture"),
      new AbortController().signal,
    );
    const order: string[] = [];
    const records: RawRecord[] = [];
    const sink: AdapterSink = {
      async persistChunk(stream) {
        order.push(`chunk:${stream}`);
      },
      async persistRecord(record) {
        order.push(`record:${record.stream}`);
        records.push(record);
      },
    };
    const result = await adapter.run(
      prepared,
      sink,
      new AbortController().signal,
    );
    expect(result.status).toBe("completed");
    expect(result.errors).toContainEqual(
      expect.objectContaining({ category: "malformed_output" }),
    );
    expect(order.indexOf("chunk:stdout")).toBeLessThan(
      order.indexOf("record:stdout"),
    );
    const trace = await collectTrace(adapter, records, prepared.trialId);
    expect(trace).toContainEqual(
      expect.objectContaining({ type: "error.observed" }),
    );
  });

  it("bounds oversized records and normalizes vendor authentication failure", async () => {
    const files = await fixture();
    const codex = new CodexAdapter();
    const oversized = await codex.prepare(
      prepareInput("codex", files.root, files.executable, "OVERSIZED fixture", {
        maxRecordBytes: 128,
      }),
      new AbortController().signal,
    );
    const bounded = await codex.run(
      oversized,
      new MemoryAdapterSink(),
      new AbortController().signal,
    );
    expect(bounded.records).toContainEqual(
      expect.objectContaining({ parseError: "record_too_large" }),
    );
    expect(
      bounded.records.find((record) => record.parseError === "record_too_large")
        ?.text.length,
    ).toBeLessThanOrEqual(128);

    const claude = new ClaudeCodeAdapter();
    const authFailure = await claude.prepare(
      prepareInput("claude-code", files.root, files.executable, "AUTH_FAIL"),
      new AbortController().signal,
    );
    const result = await claude.run(
      authFailure,
      new MemoryAdapterSink(),
      new AbortController().signal,
    );
    expect(result.status).toBe("failed");
    expect(result.errors).toContainEqual(
      expect.objectContaining({ category: "auth_unavailable" }),
    );
    expect(JSON.stringify(result.errors)).not.toContain("Not logged in");
  });

  it("normalizes timeout and idempotent in-flight cancellation", async () => {
    const files = await fixture();
    const timeoutAdapter = new PiCliAdapter();
    const timeoutPrepared = await timeoutAdapter.prepare(
      prepareInput("pi", files.root, files.executable, "HANG", {
        wallMs: 30,
      }),
      new AbortController().signal,
    );
    const timedOut = await timeoutAdapter.run(
      timeoutPrepared,
      new MemoryAdapterSink(),
      new AbortController().signal,
    );
    expect(timedOut.status).toBe("budget_exhausted");
    expect(timedOut.errors).toContainEqual(
      expect.objectContaining({ category: "timeout" }),
    );

    const cancelAdapter = new ClaudeCodeAdapter();
    const cancelPrepared = await cancelAdapter.prepare(
      prepareInput("claude-code", files.root, files.executable, "HANG"),
      new AbortController().signal,
    );
    let firstRecordResolve!: () => void;
    const firstRecord = new Promise<void>((resolve) => {
      firstRecordResolve = resolve;
    });
    const sink: AdapterSink = {
      async persistChunk() {},
      async persistRecord() {
        firstRecordResolve();
      },
    };
    const running = cancelAdapter.run(
      cancelPrepared,
      sink,
      new AbortController().signal,
    );
    await firstRecord;
    expect(
      await cancelAdapter.cancel(
        { invocationId: cancelPrepared.invocationId },
        "user",
      ),
    ).toMatchObject({ status: "requested" });
    expect(
      await cancelAdapter.cancel(
        { invocationId: cancelPrepared.invocationId },
        "shutdown",
      ),
    ).toMatchObject({ status: "already_requested", reason: "user" });
    expect((await running).status).toBe("cancelled");

    const beforeSpawnAdapter = new CodexAdapter();
    const beforeSpawnPrepared = await beforeSpawnAdapter.prepare(
      prepareInput("codex", files.root, files.executable),
      new AbortController().signal,
    );
    const beforeSpawn = new AbortController();
    beforeSpawn.abort();
    const cancelledBeforeSpawn = await beforeSpawnAdapter.run(
      beforeSpawnPrepared,
      new MemoryAdapterSink(),
      beforeSpawn.signal,
    );
    expect(cancelledBeforeSpawn).toMatchObject({
      status: "cancelled",
      process: null,
    });
  });

  it("reports missing executables, unsupported versions, and unavailable auth without secrets", async () => {
    const files = await fixture();
    const missing = await new CodexAdapter().probe(
      { executable: join(files.root, "missing"), cwd: files.root },
      new AbortController().signal,
    );
    expect(missing).toMatchObject({
      availability: "unavailable",
      executable: { exists: false },
    });
    const unsupported = await new ClaudeCodeAdapter().probe(
      {
        executable: files.executable,
        cwd: files.root,
        environment: {
          FIXTURE_KIND: "claude-code",
          FIXTURE_VERSION: "9.0.0",
          FIXTURE_AUTH: "missing",
          SECRET_VALUE: "do-not-return",
        },
      },
      new AbortController().signal,
    );
    expect(unsupported.version.supported).toBe(false);
    expect(JSON.stringify(unsupported)).not.toContain("do-not-return");
    const malformed = await new PiCliAdapter().probe(
      {
        executable: files.executable,
        cwd: files.root,
        environment: { FIXTURE_KIND: "pi", FIXTURE_VERSION: "not-a-version" },
      },
      new AbortController().signal,
    );
    expect(malformed.version).toMatchObject({
      normalized: null,
      supported: false,
    });
    const missingAuth = await new ClaudeCodeAdapter().probe(
      {
        executable: files.executable,
        cwd: files.root,
        environment: {
          FIXTURE_KIND: "claude-code",
          FIXTURE_VERSION: "2.1.104",
          FIXTURE_AUTH: "missing",
        },
      },
      new AbortController().signal,
    );
    expect(missingAuth).toMatchObject({
      availability: "unavailable",
      auth: { state: "missing" },
    });
  });
});

describe("Pi SDK execution path", () => {
  it("injects the isolated resource root and emits CLI-compatible records", async () => {
    const files = await fixture();
    let factoryInput: { readonly agentDir: string } | undefined;
    const runtime = createPiSdkRuntime({
      async createSession(input) {
        factoryInput = input;
        const listeners: ((event: unknown) => void)[] = [];
        const session: PiSdkSession = {
          subscribe(listener) {
            listeners.push(listener);
            return () => undefined;
          },
          async prompt() {
            for (const listener of listeners) {
              listener({ type: "agent_start" });
              listener({
                type: "message_end",
                message: {
                  role: "assistant",
                  content: [{ type: "text", text: "FIXTURE_OK" }],
                },
              });
              listener({ type: "agent_end" });
            }
          },
          dispose() {},
          sessionRef: "sdk-session",
        };
        return session;
      },
    });
    const adapter = new PiSdkAdapter(runtime);
    const prepared = await adapter.prepare(
      prepareInput("pi", files.root, files.executable),
      new AbortController().signal,
    );
    expect(prepared.executionMode).toBe("sdk");
    const result = await adapter.run(
      prepared,
      new MemoryAdapterSink(),
      new AbortController().signal,
    );
    expect(result.status).toBe("completed");
    expect(factoryInput?.agentDir).toBe(prepared.resourceRoot);
    expect(result.sessionRefs).toEqual(["sdk-session"]);
    const trace = await collectTrace(adapter, result.records, prepared.trialId);
    expect(trace.some((event) => event.type === "trial.completed")).toBe(true);
  });
});

describe("compatibility and standard export", () => {
  it("machine-tests documented supported ranges", () => {
    const unsupportedBelowMinimum: Readonly<Record<AdapterKind, string>> = {
      pi: "0.80.99",
      "claude-code": "2.1.103",
      codex: "0.144.99",
    };
    for (const entry of Object.values(ADAPTER_COMPATIBILITY)) {
      for (const fixtureVersion of entry.fixtureVersions)
        expect(isSupportedVersion(entry.adapter, fixtureVersion)).toBe(true);
      expect(isSupportedVersion(entry.adapter, entry.minimum)).toBe(true);
      expect(
        isSupportedVersion(
          entry.adapter,
          unsupportedBelowMinimum[entry.adapter],
        ),
      ).toBe(false);
      expect(isSupportedVersion(entry.adapter, entry.maximumExclusive)).toBe(
        false,
      );
    }
    expect(normalizeCliVersion("codex-cli 0.145.0-alpha.18")).toBe("0.145.0");
  });

  it("requires opt-in and writes a redacted local OTLP/JSON trace without publishing", async () => {
    const files = await fixture();
    const event: TraceEventV1 = {
      schemaVersion: "1.0.0",
      eventId: "evt_fixture",
      sequence: 1,
      trialId: "trial_00000000000000000000000000" as TrialId,
      type: "message.observable",
      time: { wall: null, monotonicMs: 1, precision: "millisecond" },
      actor: "agent",
      source: { adapter: "codex", adapterVersion: "0.1.0" },
      availability: "observed",
      data: {
        text: "secret-fixture-value",
        token: "opaque-sensitive-field",
        ordinary: "sk-short-example",
      },
      sensitivity: ["prompt"],
    };
    expect(() =>
      createOtlpJsonTrace([event], {
        optIn: "denied" as never,
        redactor: new Redactor(),
      }),
    ).toThrow(/opt-in/);
    const redactor = new Redactor({
      literals: [{ name: "fixture", value: "secret-fixture-value" }],
    });
    const result = await writeOtlpJsonTraceExport({
      exportRoot: files.root,
      logicalPath: "export/trace.otlp.json",
      events: [event],
      optIn: "confirmed",
      redactor,
    });
    const output = await readFile(join(files.root, result.logicalPath), "utf8");
    expect(output).toContain("resourceSpans");
    expect(output).toContain("[REDACTED:fixture]");
    expect(output).toContain("[REDACTED:field-token]");
    expect(output).not.toContain("secret-fixture-value");
    expect(output).not.toContain("opaque-sensitive-field");
    expect(output).toContain("sk-short-example");
    expect(output).toContain("absence of unknown secrets is not guaranteed");
    expect(result.published).toBe(false);
  });
});
