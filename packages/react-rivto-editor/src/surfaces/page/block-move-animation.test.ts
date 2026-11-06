/** @jest-environment jsdom */
import { animateDroppedBlocks, captureBlockMove } from "./block-move-animation";

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

test("does not read regions when movement animation is disabled", () => {
  const root = document.createElement("div");
  const regions = { get: jestApi.fn() };
  expect(captureBlockMove(root, regions, ["one"], 0)).toBeUndefined();
  expect(regions.get).not.toHaveBeenCalled();
});

test("does not animate after the receiving attachment becomes stale", () => {
  const root = document.createElement("div");
  const row = document.createElement("div");
  root.append(row);
  document.body.append(root);
  const regions = { get: jestApi.fn(() => row) };
  let frame: FrameRequestCallback | undefined;
  const request = jestApi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  try {
    const finish = captureBlockMove(root, regions, ["one"], 0.3);
    finish?.(root, regions, () => false);
    expect(frame).toBeDefined();
    frame!(0);
    expect(regions.get).toHaveBeenCalledTimes(1);
  } finally {
    request.mockRestore();
    root.remove();
  }
});
