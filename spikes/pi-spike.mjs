import http from "node:http";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const packageRoot = process.env.PATCHRACE_PI_PACKAGE_ROOT ?? "/private/tmp/patchrace-m1-pi/node_modules/@earendil-works/pi-coding-agent";
const piBinary = join(packageRoot, "dist", "cli.js");

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      detached: options.detached ?? false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ child, code, signal, stdout, stderr }));
    options.onSpawn?.(child);
  });
}

async function listFiles(root) {
  const found = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else found.push(path.slice(root.length + 1));
    }
  }
  await visit(root);
  return found.sort();
}

let slowRequestResolve;
const slowRequestSeen = new Promise((resolve) => { slowRequestResolve = resolve; });
const requests = [];
const server = http.createServer((request, response) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    requests.push({ method: request.method, url: request.url, bodyBytes: Buffer.byteLength(body) });
    if (request.url !== "/v1/chat/completions") {
      response.writeHead(404).end();
      return;
    }
    if (body.includes("CANCEL_ME")) {
      slowRequestResolve();
      response.writeHead(200, { "content-type": "text/event-stream" });
      return;
    }
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const created = Math.floor(Date.now() / 1000);
    response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created, model: "stub-model", choices: [{ index: 0, delta: { role: "assistant", content: "STUB_OK" }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created, model: "stub-model", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 } })}\n\n`);
    response.end("data: [DONE]\n\n");
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const root = await mkdtemp("/private/tmp/patchrace-pi-spike-");
const agentDir = join(root, "agent");
const sessionDir = join(root, "sessions");
const fixture = join(root, "fixture");
await mkdir(agentDir, { recursive: true });
await mkdir(sessionDir, { recursive: true });
await mkdir(fixture, { recursive: true });
await writeFile(join(fixture, "README.md"), "# isolated Pi fixture\n");
await writeFile(join(agentDir, "models.json"), JSON.stringify({
  providers: {
    "patchrace-stub": {
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      api: "openai-completions",
      apiKey: "fixture-only-not-a-secret",
      compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
      models: [{
        id: "stub-model", name: "PatchRace deterministic stub", reasoning: false,
        input: ["text"], contextWindow: 4096, maxTokens: 512,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }],
    },
  },
}, null, 2));

const isolatedEnv = {
  ...process.env,
  PI_CODING_AGENT_DIR: agentDir,
  PI_CODING_AGENT_SESSION_DIR: sessionDir,
  PI_OFFLINE: "1",
  PI_TELEMETRY: "0",
};
const common = [
  piBinary,
  "--provider", "patchrace-stub", "--model", "stub-model", "--api-key", "fixture-only-not-a-secret",
  "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--offline",
];

try {
  const version = await run(process.execPath, [piBinary, "--version"], { cwd: fixture, env: isolatedEnv });
  if (version.code !== 0) throw new Error(`Pi version probe failed: ${version.stderr}`);

  const cli = await run(process.execPath, [
    ...common, "--mode", "json", "--session-dir", sessionDir, "--print", "Reply with the fixture response.",
  ], { cwd: fixture, env: isolatedEnv });
  if (cli.code !== 0) throw new Error(`Pi JSON run failed: ${cli.stderr}`);
  const cliEvents = cli.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const sessionFiles = await listFiles(sessionDir);
  if (!cliEvents.some((event) => event.type === "agent_end")) throw new Error("Pi JSON run lacked agent_end");
  if (sessionFiles.length === 0) throw new Error("Pi JSON run did not persist a session");

  const sdk = await import(pathToFileURL(join(packageRoot, "dist", "index.js")));
  const modelRuntime = await sdk.ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: join(agentDir, "models.json"),
  });
  const model = modelRuntime.getModel("patchrace-stub", "stub-model");
  if (!model) throw new Error("SDK did not resolve isolated stub model");
  const { session } = await sdk.createAgentSession({
    cwd: fixture,
    agentDir,
    model,
    modelRuntime,
    sessionManager: sdk.SessionManager.inMemory(),
  });
  const sdkEventTypes = [];
  const unsubscribe = session.subscribe((event) => sdkEventTypes.push(event.type));
  await session.prompt("Reply with the fixture response through the SDK.");
  const sdkMessageCount = session.state.messages.length;
  unsubscribe();
  session.dispose();
  if (!sdkEventTypes.includes("agent_end")) throw new Error("Pi SDK run lacked agent_end");

  let cancelChild;
  const cancellationRun = run(process.execPath, [
    ...common, "--mode", "json", "--no-session", "--print", "CANCEL_ME",
  ], {
    cwd: fixture,
    env: isolatedEnv,
    detached: true,
    onSpawn: (child) => { cancelChild = child; },
  });
  await Promise.race([
    slowRequestSeen,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Pi cancellation fixture did not reach stub")), 5000)),
  ]);
  process.kill(-cancelChild.pid, "SIGTERM");
  const cancelled = await cancellationRun;
  if (cancelled.code === null && cancelled.signal !== "SIGTERM") throw new Error(`Unexpected cancellation signal: ${cancelled.signal}`);

  const firstSession = await readFile(join(sessionDir, sessionFiles[0]), "utf8");
  const sessionRecordTypes = firstSession.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line).type);
  const summary = {
    status: "PASS",
    piVersion: version.stdout.trim(),
    installPackage: "@earendil-works/pi-coding-agent",
    isolatedAgentDir: true,
    realCredentialAccess: "none",
    authBehavior: "custom provider used a fixture-only literal key; normal missing auth remains a preflight condition",
    cli: { exitCode: cli.code, eventTypes: [...new Set(cliEvents.map((event) => event.type))], eventCount: cliEvents.length },
    session: { files: sessionFiles.length, recordTypes: [...new Set(sessionRecordTypes)] },
    sdk: { eventTypes: [...new Set(sdkEventTypes)], eventCount: sdkEventTypes.length, messageCount: sdkMessageCount },
    cancellation: { exitCode: cancelled.code, signal: cancelled.signal, groupSignal: "SIGTERM" },
    stubRequests: requests,
    tempRoot: root,
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
