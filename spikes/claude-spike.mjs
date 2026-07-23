import http from "node:http";
import { spawn } from "node:child_process";

const claudeBinary = process.env.PATCHRACE_CLAUDE_BINARY ?? "/opt/homebrew/bin/claude";
const fixtureCwd = process.env.PATCHRACE_CLAUDE_FIXTURE ?? "/private/tmp/patchrace-agent-spikes-vgxORU/claude";

function run(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(claudeBinary, args, {
      cwd: fixtureCwd,
      env: options.env,
      detached: options.detached ?? false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal, stdout, stderr }));
    options.onSpawn?.(child);
  });
}

let slowResolve;
const slowSeen = new Promise((resolve) => { slowResolve = resolve; });
const requests = [];
const server = http.createServer((request, response) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    requests.push({ method: request.method, url: request.url, bodyBytes: Buffer.byteLength(body) });
    if (!request.url?.includes("/v1/messages")) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { type: "not_found", message: "fixture endpoint" } }));
      return;
    }
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    if (body.includes("CANCEL_ME")) {
      slowResolve();
      return;
    }
    const events = [
      ["message_start", { type: "message_start", message: { id: "msg_fixture", type: "message", role: "assistant", model: "claude-fixture", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 8, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "FIXTURE_OK" } }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 2 } }],
      ["message_stop", { type: "message_stop" }],
    ];
    for (const [name, data] of events) response.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    response.end();
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const env = {
  ...process.env,
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`,
  ANTHROPIC_API_KEY: "sk-ant-api03-fixture-only-not-a-secret",
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  DISABLE_TELEMETRY: "1",
  DISABLE_ERROR_REPORTING: "1",
  DISABLE_AUTOUPDATER: "1",
};
const options = [
  "--output-format", "stream-json", "--verbose", "--no-session-persistence", "--no-chrome",
  "--disable-slash-commands", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
  "--permission-mode", "dontAsk", "--tools=",
];

try {
  const version = await run(["--version"], { env });
  const success = await run(["-p", "Return the deterministic fixture response.", ...options], { env });
  if (success.code !== 0) throw new Error(`Claude fixture failed: ${success.stderr}\n${success.stdout}`);
  const records = success.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const result = records.find((record) => record.type === "result");
  if (!result || result.is_error || result.result !== "FIXTURE_OK") throw new Error("Claude stream lacked successful fixture result");

  let cancelChild;
  const cancelRun = run(["-p", "CANCEL_ME", ...options], {
    env, detached: true, onSpawn: (child) => { cancelChild = child; },
  });
  await Promise.race([
    slowSeen,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Claude cancellation request not observed")), 10000)),
  ]);
  process.kill(-cancelChild.pid, "SIGTERM");
  const cancelled = await cancelRun;

  console.log(JSON.stringify({
    status: "PASS",
    claudeVersion: version.stdout.trim(),
    realAuthState: "missing (observed separately through official headless result)",
    fixtureAuth: "isolated dummy API key sent only to loopback stub",
    structured: {
      recordTypes: [...new Set(records.map((record) => record.type))],
      recordCount: records.length,
      sessionIdPresent: records.some((record) => typeof record.session_id === "string"),
      result: result.result,
      usagePresent: Boolean(result.usage),
      costFieldPresent: Object.hasOwn(result, "total_cost_usd"),
    },
    cancellation: { exitCode: cancelled.code, signal: cancelled.signal, groupSignal: "SIGTERM" },
    stubRequests: requests,
  }, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
