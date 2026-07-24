import { describe, expect, it } from "vitest";

import { createDiagnosticBundle, createLogger } from "./logging.js";

describe("logging conventions", () => {
  it("writes structured redacted records to the injected stderr sink", () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "debug",
      secrets: ["private-value"],
      sink: (line) => lines.push(line),
    });

    logger.info("token private-value", {
      authorization: "sk-1234567890abcdef",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("private-value");
    expect(lines[0]).not.toContain("sk-1234567890abcdef");
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ level: "info" });
  });

  it("creates deterministic structured bundles when time is injected", () => {
    const bundle = createDiagnosticBundle(
      [],
      () => new Date("2026-07-22T00:00:00.000Z"),
    );
    expect(bundle.generatedAt).toBe("2026-07-22T00:00:00.000Z");
    expect(bundle.entries).toEqual([]);
  });
});
