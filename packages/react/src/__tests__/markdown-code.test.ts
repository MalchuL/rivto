import {
  replaceMarkdownCode,
  resolveCodeFenceInfo,
} from "../blocks/markdown-code";

describe("resolveCodeFenceInfo", () => {
  it("preserves direct language labels", () => {
    expect(resolveCodeFenceInfo("bash")).toEqual({
      label: "bash",
      language: "bash",
      filename: false,
    });
  });

  it("infers languages while preserving file paths", () => {
    expect(resolveCodeFenceInfo("src/components/example.tsx")).toEqual({
      label: "src/components/example.tsx",
      language: "typescript",
      filename: true,
    });
  });

  it("keeps unknown paths renderable without inventing a language", () => {
    expect(resolveCodeFenceInfo("config/example.unknown")).toEqual({
      label: "config/example.unknown",
      language: undefined,
      filename: true,
    });
  });
});

describe("replaceMarkdownCode", () => {
  it("updates fenced code while preserving its fence and language", () => {
    const source = "Before\n\n```ts\nconst old = true;\n```\n\nAfter";
    const start = source.indexOf("```ts");
    const end = source.indexOf("```", start + 3) + 3;

    expect(replaceMarkdownCode(source, {
      position: { start: { offset: start }, end: { offset: end } },
    }, "const next = false;")).toBe(
      "Before\n\n```ts\nconst next = false;\n```\n\nAfter",
    );
  });

  it("retains indentation for indented Markdown code", () => {
    const source = "Before\n\n    old()\n    value\n\nAfter";
    const start = source.indexOf("    old()");
    const end = source.indexOf("\n\nAfter");

    expect(replaceMarkdownCode(source, {
      position: { start: { offset: start }, end: { offset: end } },
    }, "next()\nvalue")).toBe(
      "Before\n\n    next()\n    value\n\nAfter",
    );
  });
});
