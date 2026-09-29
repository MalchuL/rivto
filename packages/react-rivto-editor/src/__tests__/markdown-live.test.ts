import {
  isLiveCodeLabel,
  liveCodeUsesRender,
} from "../blocks/markdown/markdown-live";

describe("isLiveCodeLabel", () => {
  it("selects jsx, tsx, and live fences", () => {
    expect(isLiveCodeLabel("jsx")).toBe(true);
    expect(isLiveCodeLabel("TSX")).toBe(true);
    expect(isLiveCodeLabel(" live ")).toBe(true);
  });

  it("leaves source fences and file paths highlighted", () => {
    expect(isLiveCodeLabel("javascript")).toBe(false);
    expect(isLiveCodeLabel("src/example.jsx")).toBe(false);
    expect(isLiveCodeLabel(undefined)).toBe(false);
  });
});

describe("liveCodeUsesRender", () => {
  it("detects an imperative render call", () => {
    expect(liveCodeUsesRender("render(<Card />)")).toBe(true);
    expect(liveCodeUsesRender("<div className=\"p-4\" />")).toBe(false);
  });
});