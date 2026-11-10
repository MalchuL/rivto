/** @jest-environment jsdom */
import { animateDroppedBlocks } from "./block-move-animation";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

test("does not schedule a drop animation when disabled", () => {
  const root = document.createElement("div");
  const regions = { get: jestApi.fn() };
  const request = jestApi.spyOn(window, "requestAnimationFrame");
  try {
    animateDroppedBlocks(root, regions, ["one"], 0, () => true);
    animateDroppedBlocks(root, regions, ["one"], undefined, () => true);
    expect(request).not.toHaveBeenCalled();
    expect(regions.get).not.toHaveBeenCalled();
  } finally {
    request.mockRestore();
  }
});
