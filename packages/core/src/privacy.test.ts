import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  executeRedactedReportExport,
  previewRedactedReportExport,
} from "./report-export.js";

interface PrivacyFixture {
  readonly schemaVersion: "1.0.0";
  readonly prompt: string;
  readonly projectPath: string;
  readonly credentialRecipes: readonly {
    readonly separator: string;
    readonly parts: readonly string[];
  }[];
  readonly sourceCode: string;
  readonly personalData: readonly string[];
  readonly unknownSecret: string;
  readonly falsePositiveControls: readonly string[];
}

const roots: string[] = [];
afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);

function html(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

describe("QA-07 public export privacy fixture", () => {
  it("redacts configured prompts, paths, credentials, code, and personal data while preserving raw evidence and honest residuals", async () => {
    const fixture = JSON.parse(
      await readFile(
        resolve(
          import.meta.dirname,
          "../../../fixtures/privacy/public-export.json",
        ),
        "utf8",
      ),
    ) as PrivacyFixture;
    const credentials = fixture.credentialRecipes.map(({ separator, parts }) =>
      parts.join(separator),
    );
    const root = await mkdtemp(join(tmpdir(), "patchrace-privacy-"));
    roots.push(root);
    const source = join(root, "source");
    const destination = join(root, "public-export");
    await mkdir(join(source, "report", "shareable"), { recursive: true });
    await mkdir(join(source, "raw"), { recursive: true });

    const reportValue = {
      prompt: fixture.prompt,
      projectPath: fixture.projectPath,
      credentials,
      sourceCode: fixture.sourceCode,
      personalData: fixture.personalData,
      unknownSecret: fixture.unknownSecret,
      falsePositiveControls: fixture.falsePositiveControls,
    };
    const reportJson = `${JSON.stringify(reportValue)}\n`;
    const reportHtml = `<!doctype html><p>${html(fixture.prompt)}</p><pre>${html(
      fixture.sourceCode,
    )}</pre><p>${html(fixture.projectPath)}</p><p>${credentials
      .map(html)
      .join(" ")}</p><p>${fixture.personalData
      .map(html)
      .join(
        " ",
      )}</p><p>${html(fixture.unknownSecret)}</p><p>${fixture.falsePositiveControls
      .map(html)
      .join(" ")}</p>`;
    const rawPrompt = `${fixture.prompt}\n${fixture.sourceCode}\n`;
    await writeFile(
      join(source, "report", "shareable", "report.json"),
      reportJson,
    );
    await writeFile(
      join(source, "report", "shareable", "index.html"),
      reportHtml,
    );
    await writeFile(join(source, "raw", "prompt.txt"), rawPrompt);

    const profile = {
      paths: [fixture.projectPath],
      literals: [
        { name: "prompt", value: fixture.prompt },
        { name: "source-code", value: fixture.sourceCode },
        ...fixture.personalData.map((value, index) => ({
          name: `personal-${index + 1}`,
          value,
        })),
      ],
    };
    const preview = await previewRedactedReportExport({
      sourceRoot: source,
      destinationRoot: destination,
      logicalPaths: [
        "report/shareable/report.json",
        "report/shareable/index.html",
      ],
      profile,
    });
    expect(preview.findings.length).toBeGreaterThanOrEqual(10);
    expect(preview.excludedByDefault).toContain("prompts");
    expect(preview.residualWarning).toContain(
      "absence of unknown secrets is not guaranteed",
    );
    const serializedPreview = JSON.stringify(preview);
    for (const sensitive of [
      fixture.prompt,
      fixture.projectPath,
      ...credentials,
      fixture.sourceCode,
      ...fixture.personalData,
    ])
      expect(serializedPreview).not.toContain(sensitive);
    await expect(access(destination)).rejects.toBeDefined();

    await executeRedactedReportExport({
      preview,
      confirmation: "confirmed",
      profile,
    });
    const exported = [
      await readFile(
        join(destination, "report", "shareable", "report.json"),
        "utf8",
      ),
      await readFile(
        join(destination, "report", "shareable", "index.html"),
        "utf8",
      ),
    ];
    for (const output of exported) {
      for (const sensitive of [
        fixture.prompt,
        fixture.projectPath,
        ...credentials,
        fixture.sourceCode,
        ...fixture.personalData,
      ])
        expect(output).not.toContain(sensitive);
      expect(output).toContain(fixture.unknownSecret);
    }
    for (const control of fixture.falsePositiveControls)
      expect(exported[0]).toContain(control);

    expect(await readFile(join(source, "raw", "prompt.txt"), "utf8")).toBe(
      rawPrompt,
    );
    expect(
      await readFile(
        join(source, "report", "shareable", "report.json"),
        "utf8",
      ),
    ).toBe(reportJson);
    const manifest = await readFile(
      join(destination, "export-manifest.json"),
      "utf8",
    );
    expect(manifest).toContain("absence of unknown secrets is not guaranteed");
    expect(manifest).not.toContain(source);
    expect(manifest).not.toContain(destination);
    expect(manifest).not.toContain(fixture.prompt);
  });
});
