import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { runProcess, runScheduledJobs } from "../packages/core/dist/index.js";
import { buildTrajectoryTimeline } from "../packages/diagnosis/dist/index.js";
import { renderStaticHtml } from "../packages/report/dist/index.js";

const execute = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const MiB = 1024 * 1024;
const limits = Object.freeze({
  reportInputBytes: 50 * MiB,
  reportDurationMs: 10_000,
  reportPeakRssBytes: 750 * MiB,
  orchestrationPerTrialMs: 2_000,
  defaultDiskBytes: 2 * 1024 * MiB,
  timelineRetainedEvents: 10_000,
  concurrencyMinimumSpeedup: 2,
});

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function metric(value, limit, unit, status = value <= limit ? "PASS" : "FAIL") {
  return { value, limit, unit, status };
}

function hash(character) {
  return `sha256:${character.repeat(64)}`;
}

function metricValue(value, unit) {
  return {
    value,
    unit,
    availability: "observed",
    source: "qa-05",
  };
}

function trial(index, evidence) {
  const suffix = index.toString(16).toUpperCase().padStart(26, "0");
  return {
    schemaVersion: "1.0.0",
    trialId: `trial_${suffix}`,
    taskId: `task-${index}`,
    taskHash: hash("a"),
    baselineCommit: "b".repeat(40),
    variantId: "pi-main",
    variantHash: hash("c"),
    repetition: 1,
    attempt: 1,
    supersedesTrialId: null,
    terminalStatus: "completed",
    integrity: "valid",
    outcome: "passed",
    hardGates: [{ id: "tests", status: "passed", evidence: [evidence] }],
    metrics: {
      durationMs: metricValue(1, "ms"),
      costUsd: {
        value: null,
        unit: "USD",
        availability: "unavailable",
        source: "adapter",
      },
      tokens: {
        value: null,
        unit: "tokens",
        availability: "unavailable",
        source: "adapter",
      },
      footprintLines: metricValue(1, "lines"),
    },
    artifacts: {
      patch: `trials/${suffix}/patch.diff`,
      grade: `trials/${suffix}/grade.json`,
      trace: `trials/${suffix}/trace.jsonl`,
      result: `trials/${suffix}/result.json`,
    },
    limitations: [],
  };
}

function largeReport() {
  const evidencePayload = "observable-evidence-".padEnd(100 * 1024, "x");
  const trials = Array.from({ length: 520 }, (_, index) =>
    trial(index, `${evidencePayload}${index}`),
  );
  const variant = {
    variantId: "pi-main",
    variantHash: hash("c"),
    adapter: {
      id: "patchrace.pi.cli",
      kind: "pi",
      executable: "pi",
      version: "0.81.1",
    },
    model: null,
    harness: {},
    workflow: {},
    environmentNames: [],
  };
  const aggregate = {
    variantId: variant.variantId,
    variantHash: variant.variantHash,
    trialCount: trials.length,
    completedCount: trials.length,
    validCount: trials.length,
    passedCount: trials.length,
    failedCount: 0,
    hardGatePassRate: 1,
    allHardGatesPassed: true,
    raw: {
      stabilityVariance: metricValue(0, "ratio²"),
      meanCostUsd: {
        value: null,
        unit: "USD",
        availability: "unavailable",
        source: "adapter",
      },
      meanLatencyMs: metricValue(1, "ms"),
      meanFootprintLines: metricValue(1, "lines"),
    },
    caveats: [],
  };
  return {
    schemaVersion: "1.0.0",
    reportSchemaVersion: "1.0.0",
    source: {
      planHash: hash("d"),
      executionStatus: "completed",
      taskSnapshots: [],
      variants: [variant],
    },
    overview: {
      title: "QA-05 50 MiB normalized run set",
      taskCount: trials.length,
      variantCount: 1,
      plannedTrialCount: trials.length,
      completedEvidenceCount: trials.length,
      claimBoundary: "Synthetic non-inference performance evidence only.",
    },
    ranking: {
      schemaVersion: "1.0.0",
      policy: {
        schemaVersion: "1.0.0",
        id: "correctness-first-v1",
        first: "hard-gates",
        afterHardGates: ["latency"],
      },
      variants: [
        {
          rank: 1,
          variantId: variant.variantId,
          variantHash: variant.variantHash,
          aggregate,
          decisiveDimension: "hard-gates",
        },
      ],
      caveats: [],
    },
    trials,
    patches: [],
    timelines: [],
    caveats: ["synthetic_large_report_fixture"],
  };
}

async function reportWorker(directory) {
  const report = largeReport();
  const serialized = JSON.stringify(report);
  const inputBytes = Buffer.byteLength(serialized);
  if (inputBytes < limits.reportInputBytes)
    throw new Error(`Large report fixture is only ${inputBytes} bytes.`);
  const normalizedPath = join(directory, "normalized-report.json");
  const htmlPath = join(directory, "report.html");
  await writeFile(normalizedPath, serialized);
  const started = performance.now();
  const html = renderStaticHtml(report);
  const durationMs = performance.now() - started;
  await writeFile(htmlPath, html);
  const [normalizedInfo, htmlInfo] = await Promise.all([
    stat(normalizedPath),
    stat(htmlPath),
  ]);
  const maxRssKiB = process.resourceUsage().maxRSS;
  process.stdout.write(
    `${JSON.stringify({
      inputBytes,
      outputBytes: htmlInfo.size,
      retainedBytes: normalizedInfo.size + htmlInfo.size,
      durationMs,
      maxRssBytes: maxRssKiB * 1024,
    })}\n`,
  );
}

async function schedulerOverhead() {
  const trialCount = 2_000;
  const samples = [];
  for (let sample = 0; sample < 5; sample += 1) {
    const jobs = Array.from({ length: trialCount }, (_, index) => ({
      id: `job-${index}`,
      run: async () => index,
    }));
    const started = performance.now();
    const results = await runScheduledJobs(jobs, { concurrency: 1 });
    samples.push(performance.now() - started);
    if (results.some((result) => result.status !== "completed"))
      throw new Error("No-op scheduler benchmark did not complete.");
  }
  const durationMs = median(samples);
  return {
    trials: trialCount,
    samplesMs: samples,
    medianDurationMs: durationMs,
    medianPerTrialMs: durationMs / trialCount,
    maximumPerTrialMs: Math.max(...samples) / trialCount,
  };
}

async function processRunnerOverhead(directory) {
  const trialCount = 20;
  const samples = [];
  for (let index = 0; index < trialCount; index += 1) {
    const started = performance.now();
    const result = await runProcess({
      executable: process.execPath,
      args: ["-e", ""],
      cwd: directory,
      inheritEnvironment: ["PATH"],
      timeoutMs: 5_000,
      maxOutputBytes: 1024,
    });
    if (result.status !== "completed")
      throw new Error(`Process runner sample ${index} did not complete.`);
    samples.push(performance.now() - started);
  }
  return {
    trials: trialCount,
    samplesMs: samples,
    medianPerTrialMs: median(samples),
    maximumPerTrialMs: Math.max(...samples),
  };
}

async function concurrencyBenchmark() {
  const jobCount = 40;
  const run = async (concurrency) => {
    let active = 0;
    let maximumActive = 0;
    const jobs = Array.from({ length: jobCount }, (_, index) => ({
      id: `delay-${index}`,
      run: async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
        active -= 1;
      },
    }));
    const started = performance.now();
    const results = await runScheduledJobs(jobs, { concurrency });
    if (results.some((result) => result.status !== "completed"))
      throw new Error(`Concurrency ${concurrency} benchmark did not complete.`);
    return { durationMs: performance.now() - started, maximumActive };
  };
  const sequential = await run(1);
  const concurrent = await run(4);
  return {
    jobs: jobCount,
    sequential,
    concurrent,
    speedup: sequential.durationMs / concurrent.durationMs,
  };
}

function traceEvent(index, adapter, trialId) {
  return {
    schemaVersion: "1.0.0",
    eventId: `${adapter}-${index}`,
    sequence: index + 1,
    trialId,
    type:
      index % 3 === 0
        ? "file.read.completed"
        : index % 3 === 1
          ? "command.completed"
          : "test.completed",
    time: {
      wall: null,
      monotonicMs: index,
      precision: "millisecond",
    },
    actor: "tool",
    source: { adapter, adapterVersion: "qa-05" },
    availability: "observed",
    data:
      index % 3 === 0
        ? { path: `src/file-${index % 100}.ts` }
        : index % 3 === 1
          ? { argv: ["node", "--test", String(index % 100)] }
          : { suite: `suite-${index % 100}` },
    sensitivity: [],
  };
}

function largeTraceBenchmark() {
  const eventsPerVariant = 50_000;
  const piTrial = "trial_00000000000000000000000000";
  const codexTrial = "trial_00000000000000000000000001";
  const traces = [
    {
      variantId: "pi",
      events: Array.from({ length: eventsPerVariant }, (_, index) =>
        traceEvent(index, "pi", piTrial),
      ),
    },
    {
      variantId: "codex",
      events: Array.from({ length: eventsPerVariant }, (_, index) =>
        traceEvent(index, "codex", codexTrial),
      ),
    },
  ];
  const started = performance.now();
  const timeline = buildTrajectoryTimeline({
    traces,
    maxEvents: limits.timelineRetainedEvents,
  });
  return {
    inputEvents: timeline.inputEventCount,
    retainedEvents: timeline.retainedEventCount,
    truncated: timeline.truncated,
    rows: timeline.rows.length,
    durationMs: performance.now() - started,
  };
}

async function main() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "patchrace-qa05-"));
  try {
    const [scheduler, processRunner, concurrency] = await Promise.all([
      schedulerOverhead(),
      processRunnerOverhead(temporaryRoot),
      concurrencyBenchmark(),
    ]);
    const trace = largeTraceBenchmark();
    const worker = await execute(
      process.execPath,
      [scriptPath, "--report-worker", temporaryRoot],
      {
        env: {
          PATH: process.env.PATH ?? "",
          LANG: process.env.LANG ?? "C",
        },
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      },
    );
    const report = JSON.parse(worker.stdout);
    const gates = {
      schedulerPerTrial: metric(
        scheduler.maximumPerTrialMs,
        limits.orchestrationPerTrialMs,
        "ms/trial",
      ),
      processRunnerPerTrial: metric(
        processRunner.maximumPerTrialMs,
        limits.orchestrationPerTrialMs,
        "ms/trial",
      ),
      reportDuration: metric(report.durationMs, limits.reportDurationMs, "ms"),
      reportPeakRss: metric(
        report.maxRssBytes,
        limits.reportPeakRssBytes,
        "bytes",
      ),
      retainedDisk: metric(
        report.retainedBytes,
        limits.defaultDiskBytes,
        "bytes",
      ),
      concurrencySpeedup: metric(
        concurrency.speedup,
        limits.concurrencyMinimumSpeedup,
        "ratio",
        concurrency.speedup >= limits.concurrencyMinimumSpeedup
          ? "PASS"
          : "FAIL",
      ),
      traceBound: {
        value: trace.retainedEvents,
        limit: limits.timelineRetainedEvents,
        unit: "events",
        status:
          trace.truncated &&
          trace.retainedEvents === limits.timelineRetainedEvents
            ? "PASS"
            : "FAIL",
      },
    };
    const summary = {
      schemaVersion: "1.0.0",
      status: Object.values(gates).every((gate) => gate.status === "PASS")
        ? "PASS"
        : "FAIL",
      generatedAt: new Date().toISOString(),
      environment: {
        platform: `${process.platform}-${process.arch}`,
        node: process.version,
        cpus: (await import("node:os")).cpus().length,
      },
      boundary: {
        inference: false,
        repositoryDependencyInstallation: false,
        overheadGateBranch: "absolute <=2 seconds per trial",
        normalizedInputTargetBytes: limits.reportInputBytes,
      },
      scheduler,
      processRunner,
      concurrency,
      trace,
      report,
      gates,
    };
    const outputPath = resolve(
      process.env.PATCHRACE_QA_PERFORMANCE_OUTPUT ??
        ".artifacts/qa-performance.json",
    );
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, {
      mode: 0o600,
    });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (summary.status !== "PASS") process.exitCode = 1;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[2] === "--report-worker") {
  const directory = process.argv[3];
  if (directory === undefined) throw new Error("Missing report worker root.");
  await reportWorker(directory);
} else {
  await main();
}
