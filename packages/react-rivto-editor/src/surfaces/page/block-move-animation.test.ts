/** @jest-environment jsdom */
import { animateDroppedBlocks } from "./block-move-animation";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

test("does not schedule a drop animation when reduced motion is requested", () => {
  const root = document.createElement("div");
  const regions = { get: jestApi.fn() };
  const request = jestApi.spyOn(window, "requestAnimationFrame");
  const matchMedia = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: true }),
  });
  try {
    animateDroppedBlocks(root, regions, ["one"], () => true);
    expect(request).not.toHaveBeenCalled();
    expect(regions.get).not.toHaveBeenCalled();
  } finally {
    request.mockRestore();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });
  }
});
