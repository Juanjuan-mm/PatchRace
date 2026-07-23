import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createRedactedExport,
  RedactionTransform,
  Redactor,
} from "./redaction.js";

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

describe("secret redaction", () => {
  it("redacts known tokens, configured values, paths and sensitive fields without broad false positives", () => {
    const redactor = new Redactor({
      literals: [{ name: "fixture", value: "literal-secret-value" }],
      paths: ["/private/example/repository"],
    });
    const value = redactor.redactValue({
      prompt:
        "use sk-abcdefghijklmnopqrstuvwxyz and literal-secret-value at /private/example/repository",
      tokenCount: 42,
      token: "opaque",
      ordinary: "sk-short-example",
    });
    expect(value).toEqual({
      prompt:
        "use [REDACTED:openai] and [REDACTED:fixture] at [REDACTED:path-1]",
      tokenCount: 42,
      token: "[REDACTED:field-token]",
      ordinary: "sk-short-example",
    });
    expect(
      redactor.findings().reduce((sum, finding) => sum + finding.count, 0),
    ).toBe(4);
  });

  it("redacts JSON- and HTML-encoded values without leaking stream prefixes", async () => {
    const value = 'private & personal\n"source"';
    const path = "/Users/Example & Person/private repository";
    const redactor = new Redactor({
      literals: [{ name: "personal", value }],
      paths: [path],
    });
    const json = JSON.stringify({ prompt: value, path });
    const html =
      "private &amp; personal\n&quot;source&quot; at /Users/Example &amp; Person/private repository";
    expect(redactor.redactText(json)).not.toContain("private");
    expect(redactor.redactText(html)).not.toContain("Example");

    const longToken = `sk-${"a".repeat(900)}`;
    const transform = new RedactionTransform(new Redactor());
    const output: Buffer[] = [];
    transform.on("data", (chunk: Buffer) => output.push(Buffer.from(chunk)));
    transform.write(longToken.slice(0, 700));
    expect(output).toEqual([]);
    transform.end(longToken.slice(700));
    await new Promise<void>((resolve, reject) => {
      transform.on("end", resolve);
      transform.on("error", reject);
    });
    expect(Buffer.concat(output).toString("utf8")).toBe("[REDACTED:openai]");
  });

  it("fails a bounded redaction stream before emitting partial output", async () => {
    const transform = new RedactionTransform(new Redactor(), { maxBytes: 8 });
    const output: Buffer[] = [];
    transform.on("data", (chunk: Buffer) => output.push(Buffer.from(chunk)));
    const failed = new Promise<Error>((resolve) =>
      transform.on("error", resolve),
    );
    transform.write("123456789");
    expect((await failed).message).toContain("no partial output");
    expect(output).toEqual([]);
  });

  it("creates a separate create-new export and preserves raw evidence", async () => {
    const parent = await mkdtemp(join(tmpdir(), "patchrace-redaction-"));
    roots.push(parent);
    const source = join(parent, "source");
    const destination = join(parent, "export");
    await mkdir(join(source, "raw"), { recursive: true });
    await writeFile(
      join(source, "raw", "stdout.log"),
      "token=literal-secret-value\n",
    );
    const result = await createRedactedExport({
      sourceRoot: source,
      destinationRoot: destination,
      logicalPaths: ["raw/stdout.log"],
      redactor: new Redactor({
        literals: [{ name: "fixture", value: "literal-secret-value" }],
      }),
    });
    expect(await readFile(join(source, "raw", "stdout.log"), "utf8")).toContain(
      "literal-secret-value",
    );
    expect(
      await readFile(join(destination, "raw", "stdout.log"), "utf8"),
    ).toContain("[REDACTED:fixture]");
    expect(result.manifestHash).toMatch(/^sha256:/);
    await expect(
      createRedactedExport({
        sourceRoot: source,
        destinationRoot: destination,
        logicalPaths: [],
        redactor: new Redactor(),
      }),
    ).rejects.toMatchObject({ details: { code: "EXPORT_DESTINATION_EXISTS" } });
  });
});
