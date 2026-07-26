import { resolveCodeFenceInfo } from "../blocks/markdown-code";

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
