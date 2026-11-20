/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor } from "../../../../test-utils";
import { BENTO_TILE_ITEM_CLASS } from "../bento-constants";
import { BentoResizeController } from "../bento-resize-controller";
import { createResizeTestInput } from "../test-utils/resize-test-input";

it("does not release a replacement capture or start after input detachment", async () => {
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
  const attachment = createResizeTestInput(handle);
  /**
   * Creates a fresh primary-pointer event for one attempted gesture.
   *
   * @returns A cancelable event with the fixture's pointer identity.
   */
  const pointer = () => {
    const event = new MouseEvent("pointerdown", { button: 0, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: 1 });
    return event;
  };
  try {
    const interrupted = attachment.capturePointer(pointer());
    let released = false;
    interrupted.captureTargetPointer = () => {
      controller.cancel();
      return () => {
        released = true;
      };
    };
    controller.start("right", interrupted, attachment.start);
    expect(released).toBe(true);
    expect(tile.style.width).toBe("");
    expect(handle.hasAttribute("data-resizing")).toBe(false);
    let listenersReleased = false;
    controller.start("right", attachment.capturePointer(pointer()), {
      ...attachment.start,
      /**
       * Cancels synchronously before returning a late listener cleanup.
       *
       * @param cancel - Gesture cleanup requested during listener setup.
       * @returns Disposer recording release of the late registration.
       */
      subscribeCancellation(cancel) {
        cancel();
        return () => {
          listenersReleased = true;
        };
      },
    });
    expect(listenersReleased).toBe(true);
    expect(captured).toBe(false);
    expect(handle.hasAttribute("data-resizing")).toBe(false);
    handle.setAttribute("data-resizing", "previous");
    const input = attachment.capturePointer(pointer());
    controller.start("right", input, attachment.start);
    expect(handle.getAttribute("data-resizing")).toBe("true");
    const releaseReplacement = input.captureTargetPointer("[data-bento-resize-edge]");
    controller.cancel();
    expect(handle.getAttribute("data-resizing")).toBe("previous");
    expect(captured).toBe(true);
    releaseReplacement?.();
    expect(captured).toBe(false);
    const detachedInput = attachment.capturePointer(pointer());
    attachment.detach();
    controller.start("right", detachedInput, attachment.start);
    expect(captured).toBe(false);
    expect(tile.style.width).toBe("");
  } finally {
    controller.cancel();
    attachment.detach();
    lane.remove();
    await core.destroy();
  }
});
