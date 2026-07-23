import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  executeRedactedReportExport,
  previewRedactedReportExport,
} from "./report-export.js";

describe("shareable report export", () => {
  it("previews findings then requires confirmation and preserves raw evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-report-export-"));
    const source = join(root, "source");
    const destination = join(root, "shared");
    await mkdir(join(source, "report", "shareable"), { recursive: true });
    await mkdir(join(source, "raw"), { recursive: true });
    await writeFile(
      join(source, "report", "shareable", "report.json"),
      '{"note":"literal-secret-value"}\n',
    );
    await writeFile(
      join(source, "raw", "stdout.log"),
      "literal-secret-value\n",
    );
    const profile = {
      literals: [{ name: "fixture", value: "literal-secret-value" }],
    };
    const preview = await previewRedactedReportExport({
      sourceRoot: source,
      destinationRoot: destination,
      logicalPaths: ["report/shareable/report.json"],
      profile,
    });
    expect(preview.findings[0]?.count).toBe(1);
    await expect(
      executeRedactedReportExport({
        preview,
        confirmation: "not-confirmed",
        profile,
      }),
    ).rejects.toThrow(/explicit confirmation/);
    await executeRedactedReportExport({
      preview,
      confirmation: "confirmed",
      profile,
    });
    expect(
      await readFile(
        join(destination, "report", "shareable", "report.json"),
        "utf8",
      ),
    ).toContain("[REDACTED:fixture]");
    expect(await readFile(join(source, "raw", "stdout.log"), "utf8")).toBe(
      "literal-secret-value\n",
    );
  });
  it("refuses raw selection and detects source drift after preview", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchrace-report-export-"));
    const source = join(root, "source");
    await mkdir(join(source, "report", "shareable"), { recursive: true });
    await writeFile(join(source, "report", "shareable", "index.html"), "safe");
    await expect(
      previewRedactedReportExport({
        sourceRoot: source,
        destinationRoot: join(root, "shared"),
        logicalPaths: ["raw/stdout.log"],
      }),
    ).rejects.toThrow(/privacy-projected/);
    const preview = await previewRedactedReportExport({
      sourceRoot: source,
      destinationRoot: join(root, "shared"),
      logicalPaths: ["report/shareable/index.html"],
    });
    await writeFile(
      join(source, "report", "shareable", "index.html"),
      "changed",
    );
    await expect(
      executeRedactedReportExport({ preview, confirmation: "confirmed" }),
    ).rejects.toThrow(/changed after preview/);
  });
});
