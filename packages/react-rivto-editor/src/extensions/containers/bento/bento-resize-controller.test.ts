/** @jest-environment ./jest-browser-environment.mjs */
import type { DocumentEditorAPI } from "@chulane/rivto";
import { createTestCoreEditor } from "../../../test-utils";
import { BlockResizeController } from "../block-resize/block-resize-controller";
import { BENTO_TILE_ITEM_CLASS } from "./bento-constants";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

/** Owns a real block command boundary and deterministic DOM measurements for one resize. */
class BentoResizeFixture {
  readonly lane = document.createElement("div");
  readonly handle = document.createElement("div");
  readonly tile = document.createElement("div");
  readonly measuredWidths: string[] = [];
  readonly controller: BlockResizeController;
  readonly id: string;
  private captured = false;

  /**
   * Creates ordinary Page placement elements with observable measurement ordering.
   *
   * @param core - Real command owner destroyed with this fixture.
   * @param count - Number of sibling placements, including the active tile.
   */
  constructor(
    readonly core: DocumentEditorAPI,
    count = 2,
  ) {
    this.id = core.blocks.insertBlock({
      type: "paragraph",
      listProps: { style: { size: { width: "280px" } } },
    }).id;
    this.controller = new BlockResizeController(core.blocks, this.id, this.tile);
    this.tile.append(this.handle);
    for (let index = 0; index < count; index++) {
      const tile = index === 0 ? this.tile : document.createElement("div");
      tile.className = BENTO_TILE_ITEM_CLASS;
      tile.setAttribute("data-block-item-id", String(index));
      this.lane.append(tile);
      Object.defineProperty(tile, "offsetWidth", {
        /**
         * Records whether freezing began before the remaining measurements.
         *
         * @returns The deterministic 280-pixel layout width.
         */
        get: () => {
          this.measuredWidths.push(this.tile.style.width);
          return 280;
        },
      });
    }
    this.handle.setPointerCapture = this.capturePointer;
    this.handle.hasPointerCapture = this.hasCapture;
    this.handle.releasePointerCapture = this.releasePointer;
    document.body.append(this.lane);
  }

  /**
   * Supplies the pointer fields missing from this jsdom version's MouseEvent.
   *
   * @param x - Viewport coordinate in CSS pixels.
   * @param id - Pointer identity, defaulting to the active pointer.
   * @returns A cancellable event with the native fields used by the resize owner.
   */
  pointer(x: number, id = 1): PointerEvent {
    const event = new MouseEvent("pointermove", { clientX: x, button: 0, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: id });
    return event as PointerEvent;
  }

  /**
   * Cancels any retained gesture before removing DOM and document resources.
   *
   * @returns The fixture owns no listeners, capture or document state.
   */
  destroy(): void {
    this.controller.cancel();
    this.lane.remove();
    this.core.destroy();
  }
  /**
   * Records native pointer capture without depending on jsdom's missing implementation.
   *
   * @returns Subsequent capture reads report an acquired pointer.
   */
  private readonly capturePointer = (): void => {
    this.captured = true;
  };

  /**
   * Reads this fixture's simulated native capture state.
   *
   * @returns Whether a capture has not yet been released.
   */
  private readonly hasCapture = (): boolean => this.captured;

  /**
   * Releases the fixture's simulated capture during gesture cleanup.
   *
   * @returns Subsequent capture reads report no pointer.
   */
  private readonly releasePointer = (): void => {
    this.captured = false;
  };
}

test.each([2, 200])(
  "measures all %i siblings before writing and never measures pointer moves",
  async (count) => {
    const fixture = new BentoResizeFixture(await createTestCoreEditor(), count);
    try {
      const { controller, handle, tile } = fixture;
      tile.style.setProperty("width", "240px", "important");
      tile.style.marginLeft = "3px";
      controller.start("right", fixture.pointer(100), handle);
      expect(fixture.measuredWidths).toEqual(Array(count).fill("240px"));
      for (let index = 1; index <= 20; index++) {
        controller.move(fixture.pointer(100 + index));
      }
      expect(fixture.measuredWidths).toHaveLength(count);
      expect(tile.style.width).toBe("300px");
      expect(fixture.core.blocks.getBlockNode(fixture.id)?.listProps.style).toEqual({
        size: { width: "280px" },
      });
      tile.style.backgroundColor = "red";
      controller.finish(fixture.pointer(140), "commit");
      expect(fixture.core.blocks.getBlockNode(fixture.id)?.listProps.style).toEqual({
        size: { width: "320px" },
      });
      expect(tile.style.width).toBe("240px");
      expect(tile.style.getPropertyPriority("width")).toBe("important");
      expect(tile.style.marginLeft).toBe("3px");
      expect(tile.style.backgroundColor).toBe("red");
      expect(handle.hasPointerCapture(1)).toBe(false);
    } finally {
      fixture.destroy();
    }
  },
);

test.each(["Escape", "blur", "pointercancel", "detach"])(
  "cancels on %s without committing or retaining capture",
  async (reason) => {
    const fixture = new BentoResizeFixture(await createTestCoreEditor());
    try {
      const { controller, handle, tile } = fixture;
      controller.start("left", fixture.pointer(100), handle);
      controller.move(fixture.pointer(50));
      expect(tile.style.marginLeft).toBe("-50px");
      if (reason === "Escape") {
        const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
        window.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      } else if (reason === "blur") {
        window.dispatchEvent(new Event("blur"));
      } else if (reason === "pointercancel") {
        controller.finish(fixture.pointer(50), "cancel");
      } else {
        controller.cancel();
      }
      controller.finish(fixture.pointer(10), "commit");
      expect(fixture.core.blocks.getBlockNode(fixture.id)?.listProps.style).toEqual({
        size: { width: "280px" },
      });
      expect(tile.style.width).toBe("");
      expect(tile.style.marginLeft).toBe("");
      expect(handle.hasPointerCapture(1)).toBe(false);
      expect(handle.hasAttribute("data-resizing")).toBe(false);
      const nextEscape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
      window.dispatchEvent(nextEscape);
      expect(nextEscape.defaultPrevented).toBe(false);
    } finally {
      fixture.destroy();
    }
  },
);

test("rolls back failed pointer capture and uses live width for repeated keyboard input", async () => {
  const fixture = new BentoResizeFixture(await createTestCoreEditor());
  try {
    const capture = jestApi.spyOn(fixture.handle, "setPointerCapture").mockImplementation(() => {
      throw new Error("capture failed");
    });
    expect(() => fixture.controller.start("right", fixture.pointer(100), fixture.handle)).toThrow(
      "capture failed",
    );
    expect(fixture.tile.style.width).toBe("");
    capture.mockRestore();
    for (let index = 0; index < 3; index++) {
      fixture.controller.resizeWithKeyboard(
        "right",
        new KeyboardEvent("keydown", { key: "ArrowRight" }),
      );
    }
    expect(fixture.core.blocks.getBlockNode(fixture.id)?.listProps.style).toEqual({
      size: { width: "310px" },
    });
  } finally {
    fixture.destroy();
  }
});

test("resizing preserves other style fields and uses the measured width for percentages", async () => {
  const fixture = new BentoResizeFixture(await createTestCoreEditor());
  try {
    fixture.core.blocks.updateBlock(fixture.id, {
      listProps: {
        style: {
          background: { color: "#123456" },
          size: { width: "50%", widthPolicy: "scroll", height: "120px", heightPolicy: "scroll" },
        },
      },
    });
    fixture.controller.resizeWithKeyboard(
      "right",
      new KeyboardEvent("keydown", { key: "ArrowRight" }),
    );
    expect(fixture.core.blocks.getBlockNode(fixture.id)?.listProps.style).toEqual({
      background: { color: "#123456" },
      size: { width: "290px", widthPolicy: "scroll", height: "120px", heightPolicy: "scroll" },
    });
  } finally {
    fixture.destroy();
  }
});

test("freezes direct block shells without freezing non-block footer controls", async () => {
  const fixture = new BentoResizeFixture(await createTestCoreEditor());
  try {
    for (const [index, child] of Array.from(fixture.lane.children).entries()) {
      child.removeAttribute("data-block-item-id");
      child.setAttribute("data-block-id", `column-${index}`);
    }
    const footer = document.createElement("button");
    fixture.lane.append(footer);
    fixture.controller.start("right", fixture.pointer(100), fixture.handle);
    expect(fixture.measuredWidths).toHaveLength(2);
    expect(footer.style.width).toBe("");
    fixture.controller.cancel();
  } finally {
    fixture.destroy();
  }
});

test("stores a Bento placement width in plugin data and block style", async () => {
  const fixture = new BentoResizeFixture(await createTestCoreEditor());
  try {
    fixture.core.blocks.updateBlock(fixture.id, {
      pluginData: { bentoWidth: 300, other: { retained: true } },
      listProps: { style: { size: { width: "150px" } } },
    });
    const controller = new BlockResizeController(fixture.core.blocks, fixture.id, fixture.tile, {
      pluginId: "bentoWidth",
    });
    controller.resizeWithKeyboard("right", new KeyboardEvent("keydown", { key: "ArrowRight" }));
    const block = fixture.core.blocks.getBlockNode(fixture.id)!;
    expect(block.pluginData).toEqual({ bentoWidth: 310, other: { retained: true } });
    expect(block.listProps.style).toEqual({ size: { width: "310px" } });
  } finally {
    fixture.destroy();
  }
});

test("corner resize previews both axes and commits one undoable change", async () => {
  const fixture = new BentoResizeFixture(await createTestCoreEditor());
  try {
    Object.defineProperty(fixture.tile, "offsetHeight", { value: 140 });
    Object.defineProperty(fixture.tile, "scrollHeight", { value: 300 });
    const pointer = (x: number, y: number) => {
      const event = new MouseEvent("pointermove", {
        clientX: x,
        clientY: y,
        button: 0,
        cancelable: true,
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      return event as PointerEvent;
    };
    fixture.core.history.clear();
    fixture.controller.start("bottom-right", pointer(100, 100), fixture.handle);
    fixture.controller.move(pointer(140, 120));
    expect(fixture.tile.style.width).toBe("320px");
    expect(fixture.tile.style.height).toBe("160px");
    expect(fixture.core.blocks.getBlockNode(fixture.id)?.listProps.style).toEqual({
      size: { width: "280px" },
    });
    fixture.controller.finish(pointer(140, 120), "commit");
    expect(fixture.core.blocks.getBlockNode(fixture.id)?.listProps.style).toEqual({
      size: { width: "320px", height: "160px", heightPolicy: "scroll" },
    });
    fixture.core.history.undo();
    expect(fixture.core.blocks.getBlockNode(fixture.id)?.listProps.style).toEqual({
      size: { width: "280px" },
    });
  } finally {
    fixture.destroy();
  }
});

test("keyboard height shrink keeps grow while content still fits", async () => {
  const fixture = new BentoResizeFixture(await createTestCoreEditor());
  try {
    Object.defineProperty(fixture.tile, "offsetHeight", { value: 300 });
    Object.defineProperty(fixture.tile, "scrollHeight", {
      get: () => (fixture.tile.style.height === "0px" ? 100 : 300),
    });
    fixture.controller.resizeWithKeyboard(
      "bottom",
      new KeyboardEvent("keydown", { key: "ArrowUp" }),
    );
    expect(fixture.core.blocks.getBlockNode(fixture.id)?.listProps.style).toEqual({
      size: { width: "280px", height: "290px" },
    });
    expect(fixture.tile.style.height).toBe("");
  } finally {
    fixture.destroy();
  }
});

test("top-left preview moves both edges and restores its temporary styles on cancel", async () => {
  const fixture = new BentoResizeFixture(await createTestCoreEditor());
  try {
    Object.defineProperty(fixture.tile, "offsetHeight", { value: 140 });
    const pointer = (x: number, y: number) => {
      const event = new MouseEvent("pointermove", {
        clientX: x,
        clientY: y,
        button: 0,
        cancelable: true,
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      return event as PointerEvent;
    };
    fixture.controller.start("top-left", pointer(100, 100), fixture.handle);
    fixture.controller.move(pointer(80, 70));
    expect(fixture.tile.style.width).toBe("300px");
    expect(fixture.tile.style.height).toBe("170px");
    expect(fixture.tile.style.marginTop).toBe("-30px");
    fixture.controller.cancel();
    expect(fixture.tile.style.width).toBe("");
    expect(fixture.tile.style.height).toBe("");
    expect(fixture.tile.style.marginTop).toBe("");
    expect(fixture.core.blocks.getBlockNode(fixture.id)?.listProps.style).toEqual({
      size: { width: "280px" },
    });
  } finally {
    fixture.destroy();
  }
});

test.each([2, 200])("vertical resize does not measure any of %i sibling widths", async (count) => {
  const fixture = new BentoResizeFixture(await createTestCoreEditor(), count);
  try {
    Object.defineProperty(fixture.tile, "offsetHeight", { value: 140 });
    fixture.controller.start("bottom", fixture.pointer(100), fixture.handle);
    fixture.controller.move(fixture.pointer(120));
    expect(fixture.measuredWidths).toEqual([]);
    fixture.controller.cancel();
  } finally {
    fixture.destroy();
  }
});
