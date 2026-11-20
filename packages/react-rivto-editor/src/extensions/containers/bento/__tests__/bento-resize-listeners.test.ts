/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor } from "../../../../test-utils";
import { BENTO_TILE_ITEM_CLASS } from "../bento-constants";
import { BentoResizeController } from "../bento-resize-controller";
import { createResizeTestInput } from "../test-utils/resize-test-input";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("releases capture and frozen styles when Root cancellation listener setup fails", async () => {
  const core = await createTestCoreEditor();
  const id = core.blocks.insertBlock({ type: "paragraph", props: { bentoWidth: 280 } }).id;
  const lane = document.createElement("div");
  const tile = document.createElement("div");
  const handle = document.createElement("div");
  handle.dataset.bentoResizeEdge = "right";
  tile.className = BENTO_TILE_ITEM_CLASS;
  tile.append(handle);
  lane.append(tile);
  document.body.append(lane);
  Object.defineProperty(tile, "offsetWidth", { value: 280 });
  let captured = false;
  handle.setPointerCapture = () => {
    captured = true;
  };
  handle.hasPointerCapture = () => captured;
  handle.releasePointerCapture = () => {
    captured = false;
  };
  const controller = new BentoResizeController(core.blocks, id);
  const input = createResizeTestInput(handle);
  const event = new MouseEvent("pointerdown", { button: 0, cancelable: true });
  Object.defineProperty(event, "pointerId", { value: 1 });
  const add = window.addEventListener.bind(window);
  const spy = jestApi
    .spyOn(window, "addEventListener")
    .mockImplementation((type, listener, options) => {
      if (type === "keydown") {
        throw new Error("listener failed");
      }
      return add(type, listener, options);
    });
  try {
    expect(() => controller.start("right", input.capturePointer(event), input.start)).toThrow(
      "listener failed",
    );
    expect(captured).toBe(false);
    expect(tile.style.width).toBe("");
    expect(handle.hasAttribute("data-resizing")).toBe(false);
    expect(core.blocks.getBlockNode(id)?.props.bentoWidth).toBe(280);
  } finally {
    spy.mockRestore();
    controller.cancel();
    input.detach();
    lane.remove();
    await core.destroy();
  }
});

it("releases Root listeners and capture when handle feedback cleanup fails", async () => {
  const core = await createTestCoreEditor();
  const id = core.blocks.insertBlock({ type: "paragraph", props: { bentoWidth: 280 } }).id;
  const lane = document.createElement("div");
  const tile = document.createElement("div");
  const handle = document.createElement("div");
  handle.dataset.bentoResizeEdge = "right";
  tile.className = BENTO_TILE_ITEM_CLASS;
  tile.append(handle);
  lane.append(tile);
  document.body.append(lane);
  Object.defineProperty(tile, "offsetWidth", { value: 280 });
  let captured = false;
  handle.setPointerCapture = () => {
    captured = true;
  };
  handle.hasPointerCapture = () => captured;
  handle.releasePointerCapture = () => {
    captured = false;
  };
  const controller = new BentoResizeController(core.blocks, id);
  const input = createResizeTestInput(handle);
  const event = new MouseEvent("pointerdown", { button: 0, cancelable: true });
  Object.defineProperty(event, "pointerId", { value: 1 });
  controller.start("right", input.capturePointer(event), input.start);
  const remove = jestApi.spyOn(handle, "removeAttribute").mockImplementation(() => {
    throw new Error("marker cleanup failed");
  });
  try {
    expect(() => controller.cancel()).toThrow(AggregateError);
    expect(captured).toBe(false);
    expect(tile.style.width).toBe("");
    const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    window.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
  } finally {
    remove.mockRestore();
    controller.cancel();
    input.detach();
    lane.remove();
    await core.destroy();
  }
});
