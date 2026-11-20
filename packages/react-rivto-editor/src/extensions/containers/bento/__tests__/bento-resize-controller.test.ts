/** @jest-environment ./jest-browser-environment.mjs */
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { PointerInput } from "@chulane/rivto-root";
import { createTestCoreEditor } from "../../../../test-utils";
import { BentoResizeController } from "../bento-resize-controller";
import { BENTO_TILE_ITEM_CLASS } from "../bento-constants";
import { createResizeTestInput } from "../test-utils/resize-test-input";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

/** Owns a real block command boundary and deterministic DOM measurements for one resize. */
class BentoResizeFixture {
  readonly lane = document.createElement("div");
  readonly handle = document.createElement("div");
  readonly tile = document.createElement("div");
  readonly measuredWidths: string[] = [];
  readonly controller: BentoResizeController;
  readonly id: string;
  readonly input = createResizeTestInput(this.handle);
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
    this.id = core.blocks.insertBlock({ type: "paragraph", props: { bentoWidth: 280 } }).id;
    this.controller = new BentoResizeController(core.blocks, this.id);
    const content = document.createElement("div");
    content.append(this.handle);
    this.tile.append(content);
    this.handle.dataset.bentoResizeEdge = "right";
    for (let index = 0; index < count; index++) {
      const tile = index === 0 ? this.tile : document.createElement("div");
      tile.className = BENTO_TILE_ITEM_CLASS;
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
   * @returns Normalized pointer data and capture bound to the fixture's handle.
   */
  pointer(x: number, id = 1): PointerInput {
    const event = new MouseEvent("pointermove", { clientX: x, button: 0, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: id });
    return this.input.capturePointer(event);
  }

  /**
   * Cancels any retained gesture before removing DOM and document resources.
   *
   * @returns The fixture owns no listeners, capture or document state.
   */
  destroy(): void {
    this.controller.cancel();
    this.input.detach();
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

it("restores captured tile styles after the owning Root detaches", async () => {
  const fixture = new BentoResizeFixture(await createTestCoreEditor());
  try {
    fixture.controller.start("right", fixture.pointer(100), fixture.input.start);
    fixture.controller.move(fixture.pointer(150));
    expect(fixture.tile.style.width).not.toBe("");
    fixture.input.detach();
    fixture.controller.cancel();
    expect(fixture.tile.style.width).toBe("");
    expect(fixture.tile.style.marginRight).toBe("");
  } finally {
    fixture.destroy();
  }
});

test.each([2, 200])(
  "measures all %i siblings before writing and never measures pointer moves",
  async (count) => {
    const fixture = new BentoResizeFixture(await createTestCoreEditor(), count);
    try {
      const { controller, handle, tile } = fixture;
      tile.style.setProperty("width", "240px", "important");
      tile.style.marginLeft = "3px";
      controller.start("right", fixture.pointer(100), fixture.input.start);
      expect(fixture.measuredWidths).toEqual(Array(count).fill("240px"));
      for (let index = 1; index <= 20; index++) {
        controller.move(fixture.pointer(100 + index));
      }
      expect(fixture.measuredWidths).toHaveLength(count);
      expect(tile.style.width).toBe("300px");
      expect(fixture.core.blocks.getBlockNode(fixture.id)?.props.bentoWidth).toBe(280);
      tile.style.backgroundColor = "red";
      controller.finish(fixture.pointer(140), true);
      expect(fixture.core.blocks.getBlockNode(fixture.id)?.props.bentoWidth).toBe(320);
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

it("releases a tile marker acquired after synchronous cancellation", async () => {
  const fixture = new BentoResizeFixture(await createTestCoreEditor());
  const original = fixture.tile.setAttribute.bind(fixture.tile);
  const spy = jestApi.spyOn(fixture.tile, "setAttribute").mockImplementation((name, value) => {
    if (name === "data-bento-resizing") {
      fixture.controller.cancel();
    }
    original(name, value);
  });
  try {
    fixture.controller.start("right", fixture.pointer(100), fixture.input.start);
    expect(fixture.tile.hasAttribute("data-bento-resizing")).toBe(false);
    expect(fixture.tile.style.width).toBe("");
    expect(fixture.handle.hasPointerCapture(1)).toBe(false);
  } finally {
    spy.mockRestore();
    fixture.destroy();
  }
});

it("releases captured styles if tile identity lookup fails", async () => {
  const fixture = new BentoResizeFixture(await createTestCoreEditor());
  const input = fixture.input.start;
  const placement = input.placement!;
  fixture.tile.style.setProperty("width", "240px", "important");
  const spy = jestApi
    .spyOn(Object.getPrototypeOf(placement.tile), "isSame")
    .mockImplementation(() => {
      throw new Error("identity lookup failed");
    });
  try {
    expect(() =>
      fixture.controller.start("right", fixture.pointer(100), { ...input, placement }),
    ).toThrow("identity lookup failed");
    expect(fixture.tile.style.width).toBe("240px");
    expect(fixture.tile.style.getPropertyPriority("width")).toBe("important");
    expect(fixture.handle.hasPointerCapture(1)).toBe(false);
  } finally {
    spy.mockRestore();
    fixture.destroy();
  }
});

test.each(["Escape", "blur", "pointercancel", "detach"])(
  "cancels on %s without committing or retaining capture",
  async (reason) => {
    const fixture = new BentoResizeFixture(await createTestCoreEditor());
    try {
      const { controller, handle, tile } = fixture;
      controller.start("left", fixture.pointer(100), fixture.input.start);
      controller.move(fixture.pointer(50));
      expect(tile.style.marginLeft).toBe("-50px");
      if (reason === "Escape") {
        const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
        window.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      } else if (reason === "blur") {
        window.dispatchEvent(new Event("blur"));
      } else if (reason === "pointercancel") {
        controller.finish(fixture.pointer(50), false);
      } else {
        controller.cancel();
      }
      controller.finish(fixture.pointer(10), true);
      expect(fixture.core.blocks.getBlockNode(fixture.id)?.props.bentoWidth).toBe(280);
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
    expect(() =>
      fixture.controller.start("right", fixture.pointer(100), fixture.input.start),
    ).toThrow("capture failed");
    expect(fixture.tile.style.width).toBe("");
    capture.mockRestore();
    for (let index = 0; index < 3; index++) {
      fixture.controller.resizeWithKeyboard(
        "right",
        new KeyboardEvent("keydown", { key: "ArrowRight" }),
      );
    }
    expect(fixture.core.blocks.getBlockNode(fixture.id)?.props.bentoWidth).toBe(310);
  } finally {
    fixture.destroy();
  }
});
