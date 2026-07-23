export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LogRecord {
  readonly schemaVersion: "1.0.0";
  readonly level: LogLevel;
  readonly message: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface Logger {
  error(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  debug(message: string, fields?: Readonly<Record<string, unknown>>): void;
}

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly secrets?: readonly string[];
  readonly sink?: (line: string) => void;
}

const priorities: Readonly<Record<LogLevel, number>> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const tokenPattern = /\b(?:sk|ghp|github_pat|xox[baprs])-[-_A-Za-z0-9]{8,}\b/g;

function redactString(value: string, secrets: readonly string[]): string {
  let redacted = value.replace(tokenPattern, "[REDACTED]");
  for (const secret of secrets) {
    if (secret.length > 0) redacted = redacted.replaceAll(secret, "[REDACTED]");
  }
  return redacted;
}

function redactRecord(
  value: Readonly<Record<string, unknown>>,
  secrets: readonly string[],
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, redact(entry, secrets)]),
  );
}

export function redact(
  value: unknown,
  secrets: readonly string[] = [],
): unknown {
  if (typeof value === "string") return redactString(value, secrets);
  if (Array.isArray(value)) return value.map((entry) => redact(entry, secrets));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        redact(entry, secrets),
      ]),
    );
  }
  return value;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const threshold = priorities[options.level ?? "info"];
  const sink =
    options.sink ?? ((line: string) => process.stderr.write(`${line}\n`));
  const secrets = options.secrets ?? [];

  const write = (
    level: LogLevel,
    message: string,
    fields: Readonly<Record<string, unknown>> = {},
  ): void => {
    if (priorities[level] > threshold) return;
    const record: LogRecord = {
      schemaVersion: "1.0.0",
      level,
      message: redactString(message, secrets),
      fields: redactRecord(fields, secrets),
    };
    sink(JSON.stringify(record));
  };

  return {
    error: (message, fields) => write("error", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    info: (message, fields) => write("info", message, fields),
    debug: (message, fields) => write("debug", message, fields),
  };
}

export interface DiagnosticBundle {
  readonly schemaVersion: "1.0.0";
  readonly generatedAt: string;
  readonly runtime: {
    readonly node: string;
    readonly platform: string;
    readonly architecture: string;
  };
  readonly entries: readonly LogRecord[];
}

export function createDiagnosticBundle(
  entries: readonly LogRecord[],
  now: () => Date = () => new Date(),
): DiagnosticBundle {
  return {
    schemaVersion: "1.0.0",
    generatedAt: now().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    entries,
  };
}
