/** @jest-environment jsdom */
const jest = (import.meta as ImportMeta & { jest: typeof globalThis.jest }).jest;
import { EdgelessGridSpotlight } from "./edgeless-grid-spotlight";

test("refreshes the viewport origin on ancestor scroll and resize and releases listeners on unmount", () => {
  const root = document.createElement("main");
  const spotlight = new EdgelessGridSpotlight();
  spotlight.viewport = root;
  const measure = jest.spyOn(root, "getBoundingClientRect");
  const release = spotlight.observeViewport();
  measure.mockClear();
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("resize"));
  expect(measure).toHaveBeenCalledTimes(2);
  release();
  measure.mockClear();
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("resize"));
  expect(measure).not.toHaveBeenCalled();
});
