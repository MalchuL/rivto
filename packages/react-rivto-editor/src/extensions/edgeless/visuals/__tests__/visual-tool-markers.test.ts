/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { markVisualTool } from "../visual-tool-markers";

it("restores previous markers without disturbing a replacement occurrence", () => {
  const element = document.createElement("div");
  element.dataset.edgelessTool = "original";
  const first = new BrowserInputRoot(element);
  const releaseFirst = markVisualTool(first, {
    id: "marker",
    pansViewport: false,
    capturesPointer: true,
  });
  expect(element.dataset.edgelessTool).toBe("marker");
  expect(element.dataset.edgelessCaptureTool).toBe("true");
  first.detach();
  const second = new BrowserInputRoot(element);
  const releaseSecond = markVisualTool(second, {
    id: "pan",
    pansViewport: true,
    capturesPointer: false,
  });
  releaseFirst();
  expect(element.dataset.edgelessTool).toBe("pan");
  expect(element.dataset.edgelessPanTool).toBe("true");
  releaseSecond();
  expect(element.dataset.edgelessTool).toBe("original");
  expect(element.dataset.edgelessPanTool).toBeUndefined();
  second.detach();
});

it("restores already installed markers if a later marker fails", () => {
  const element = document.createElement("div");
  const occurrence = new BrowserInputRoot(element);
  let count = 0;
  const root = {
    isAttached: () => occurrence.isAttached(),
    setTemporaryAttribute: (name: string, value: string) => {
      count += 1;
      if (count === 2) {
        throw new Error("marker failed");
      }
      return occurrence.setTemporaryAttribute(name, value);
    },
  };
  expect(() =>
    markVisualTool(root, { id: "marker", pansViewport: false, capturesPointer: true }),
  ).toThrow("marker failed");
  expect(element.hasAttribute("data-edgeless-tool")).toBe(false);
  occurrence.detach();
});

it("removes partially installed markers if the occurrence detaches during setup", () => {
  const element = document.createElement("div");
  const occurrence = new BrowserInputRoot(element);
  const root = {
    isAttached: () => occurrence.isAttached(),
    setTemporaryAttribute: (name: string, value: string) => {
      const release = occurrence.setTemporaryAttribute(name, value);
      occurrence.detach();
      return release;
    },
  };
  const release = markVisualTool(root, {
    id: "marker",
    pansViewport: false,
    capturesPointer: true,
  });
  expect(element.hasAttribute("data-edgeless-tool")).toBe(false);
  expect(element.hasAttribute("data-edgeless-pan-tool")).toBe(false);
  release();
});
