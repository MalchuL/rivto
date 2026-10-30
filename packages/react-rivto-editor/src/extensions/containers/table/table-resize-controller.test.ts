/** @jest-environment ./jest-browser-environment.mjs */
import type { DocumentEditorAPI } from "@chulane/rivto";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { createTableBlockInput, tableExtension } from "./table";
import { TableResizeController } from "./table-resize-controller";
import { CELL_ITEM_ATTRIBUTE, COLUMN_WIDTH_PROPERTY } from "./table-column-width";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

/** Owns a real table and deterministic mounted cell placements for resize lifecycle checks. */
class TableResizeFixture {
  readonly root = document.createElement("div");
  readonly handle = document.createElement("div");
  readonly panel;
  readonly controller: TableResizeController;
  readonly ids: string[];
  readonly targets: HTMLElement[] = [];
  private captured = false;

  /**
   * Registers real table policy and mounts two columns without requiring React layout.
   *
   * @param core - Test-owned document destroyed with the fixture.
   * @param rows - Number of actual rows and therefore column preview targets.
   */
  constructor(
    readonly core: DocumentEditorAPI,
    rows = 2,
  ) {
    this.panel = createTestReactEditor({ editor: core, extensions: [tableExtension()] });
    const table = core.blocks.insertBlock(createTableBlockInput(rows, 2));
    this.ids = core.blocks.getBlock(table.id)!.children.map((row) => row.children[0]!.id);
    this.root.dataset.rivtoPanel = "fixture";
    for (const id of this.ids) {
      const item = document.createElement("div");
      item.setAttribute(CELL_ITEM_ATTRIBUTE, "true");
      item.style.setProperty(COLUMN_WIDTH_PROPERTY, "180px", "important");
      const cell = document.createElement("div");
      cell.dataset.blockId = id;
      item.append(cell);
      this.root.append(item);
      this.targets.push(item);
    }
    this.targets[0]!.firstElementChild!.append(this.handle);
    this.handle.setPointerCapture = this.capture;
    this.handle.hasPointerCapture = this.hasCapture;
    this.handle.releasePointerCapture = this.release;
    document.body.append(this.root);
    this.controller = new TableResizeController(this.panel, this.ids[0]!, this.root);
    core.history.clear();
  }

  /**
   * Supplies native fields absent from jsdom's pointer event implementation.
   *
   * @param x - Viewport X coordinate in CSS pixels.
   * @param pointerId - Identity of the pointer, defaulting to the owning gesture.
   * @returns A cancellable pointer-shaped event for direct controller delivery.
   */
  pointer(x: number, pointerId = 1): PointerEvent {
    const event = new MouseEvent("pointermove", { clientX: x, button: 0, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: pointerId });
    return event as PointerEvent;
  }

  /**
   * Releases gesture resources before destroying the borrowed panel and document.
   *
   * @returns No mounted fixture or owned model remains.
   */
  destroy(): void {
    this.controller.cancel();
    this.root.remove();
    this.panel.destroy();
    this.core.destroy();
  }

  /**
   * Simulates native capture acquisition for this fixture's single handle.
   *
   * @returns The fixture reports capture until release is called.
   */
  private readonly capture = (): void => {
    this.captured = true;
  };

  /**
   * Reads the simulated capture state without changing it.
   *
   * @returns Whether the handle currently owns capture.
   */
  private readonly hasCapture = (): boolean => this.captured;

  /**
   * Simulates native release without scheduling an additional DOM event.
   *
   * @returns The fixture reports no capture.
   */
  private readonly release = (): void => {
    this.captured = false;
  };
}

test.each([2, 200])(
  "captures %i column placements once and commits one undoable width",
  async (rows) => {
    const fixture = new TableResizeFixture(await createTestCoreEditor(), rows);
    const query = jestApi.spyOn(fixture.root, "querySelectorAll");
    const read = jestApi.spyOn(fixture.panel.blocks, "getBlockNode");
    try {
      fixture.controller.start(fixture.pointer(100), fixture.handle);
      expect(query).toHaveBeenCalledTimes(1);
      read.mockClear();
      for (let offset = 1; offset <= 20; offset++) {
        fixture.controller.move(fixture.pointer(100 + offset));
      }
      expect(query).toHaveBeenCalledTimes(1);
      expect(read).not.toHaveBeenCalled();
      expect(
        fixture.targets.every(
          (target) => target.style.getPropertyValue(COLUMN_WIDTH_PROPERTY) === "200px",
        ),
      ).toBe(true);
      const writes = jestApi.spyOn(fixture.targets[0]!.style, "setProperty");
      fixture.controller.finish(fixture.pointer(140), true);
      expect(writes.mock.calls.some(([, value]) => value === "180px")).toBe(false);
      expect(
        fixture.ids.every(
          (id) => fixture.core.blocks.getBlockNode(id)?.props.tableColumnWidth === 220,
        ),
      ).toBe(true);
      expect(fixture.handle.hasPointerCapture(1)).toBe(false);
      fixture.core.history.undo();
      expect(
        fixture.ids.every(
          (id) => fixture.core.blocks.getBlockNode(id)?.props.tableColumnWidth === 180,
        ),
      ).toBe(true);
      fixture.core.history.redo();
      expect(fixture.core.blocks.getBlockNode(fixture.ids[0]!)?.props.tableColumnWidth).toBe(220);
    } finally {
      jestApi.restoreAllMocks();
      fixture.destroy();
    }
  },
);

test.each(["Escape", "blur", "pointercancel", "detach"])(
  "cancels %s and restores exact declarations",
  async (reason) => {
    const fixture = new TableResizeFixture(await createTestCoreEditor());
    try {
      fixture.controller.start(fixture.pointer(100), fixture.handle);
      fixture.controller.move(fixture.pointer(140));
      fixture.targets[0]!.style.backgroundColor = "red";
      if (reason === "Escape") {
        const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
        window.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      } else if (reason === "blur") {
        window.dispatchEvent(new Event("blur"));
      } else if (reason === "pointercancel") {
        fixture.controller.finish(fixture.pointer(140), false);
      } else {
        fixture.root.remove();
        fixture.controller.cancel();
      }
      fixture.controller.finish(fixture.pointer(140), true);
      expect(fixture.core.blocks.getBlockNode(fixture.ids[0]!)?.props.tableColumnWidth).toBe(180);
      expect(fixture.handle.hasPointerCapture(1)).toBe(false);
      expect(fixture.handle.hasAttribute("data-resizing")).toBe(false);
      expect(fixture.targets[0]!.style.getPropertyValue(COLUMN_WIDTH_PROPERTY)).toBe("180px");
      expect(fixture.targets[0]!.style.getPropertyPriority(COLUMN_WIDTH_PROPERTY)).toBe(
        "important",
      );
      expect(fixture.targets[0]!.style.backgroundColor).toBe("red");
      const idleEscape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
      window.dispatchEvent(idleEscape);
      expect(idleEscape.defaultPrevented).toBe(false);
    } finally {
      fixture.destroy();
    }
  },
);

test("preserves a live model width and rejects a column whose membership changed", async () => {
  const fixture = new TableResizeFixture(await createTestCoreEditor());
  try {
    fixture.controller.start(fixture.pointer(100), fixture.handle);
    fixture.controller.move(fixture.pointer(140));
    fixture.core.blocks.updateBlock(fixture.ids[0]!, { props: { tableColumnWidth: 260 } });
    fixture.controller.cancel();
    expect(fixture.targets[0]!.style.getPropertyValue(COLUMN_WIDTH_PROPERTY)).toBe("260px");
    fixture.controller.start(fixture.pointer(100), fixture.handle);
    fixture.core.blocks.removeBlocks([fixture.ids[1]!]);
    fixture.controller.finish(fixture.pointer(140), true);
    expect(fixture.core.blocks.getBlockNode(fixture.ids[0]!)?.props.tableColumnWidth).toBe(260);
  } finally {
    fixture.destroy();
  }
});

test("rolls back capture failure and attempts all cleanup after a style failure", async () => {
  const fixture = new TableResizeFixture(await createTestCoreEditor());
  try {
    const capture = jestApi.spyOn(fixture.handle, "setPointerCapture").mockImplementation(() => {
      throw new Error("capture failed");
    });
    expect(() => fixture.controller.start(fixture.pointer(100), fixture.handle)).toThrow(
      "capture failed",
    );
    capture.mockRestore();
    fixture.controller.start(fixture.pointer(100), fixture.handle);
    fixture.controller.move(fixture.pointer(140));
    jestApi.spyOn(fixture.targets[0]!.style, "setProperty").mockImplementation(() => {
      throw new Error("style failed");
    });
    expect(() => fixture.controller.cancel()).toThrow(AggregateError);
    expect(fixture.targets[1]!.style.getPropertyValue(COLUMN_WIDTH_PROPERTY)).toBe("180px");
    expect(fixture.handle.hasPointerCapture(1)).toBe(false);
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  } finally {
    jestApi.restoreAllMocks();
    fixture.destroy();
  }
});

test("ignores foreign occurrences and unrelated pointers", async () => {
  const fixture = new TableResizeFixture(await createTestCoreEditor());
  try {
    const nested = document.createElement("div");
    nested.dataset.rivtoPanel = "embedded";
    const duplicate = document.createElement("div");
    duplicate.dataset.blockId = fixture.ids[0];
    nested.append(duplicate);
    fixture.root.prepend(nested);
    fixture.controller.start(fixture.pointer(100), fixture.handle);
    fixture.controller.move(fixture.pointer(150, 2));
    fixture.controller.finish(fixture.pointer(150, 2), true);
    expect(fixture.handle.hasPointerCapture(1)).toBe(true);
    expect(fixture.targets[0]!.style.getPropertyValue(COLUMN_WIDTH_PROPERTY)).toBe("180px");
    fixture.controller.move(fixture.pointer(140));
    expect(duplicate.style.getPropertyValue(COLUMN_WIDTH_PROPERTY)).toBe("");
    expect(fixture.targets[0]!.style.getPropertyValue(COLUMN_WIDTH_PROPERTY)).toBe("220px");
    fixture.root.remove();
    fixture.controller.finish(fixture.pointer(140), true);
    expect(fixture.core.blocks.getBlockNode(fixture.ids[0]!)?.props.tableColumnWidth).toBe(180);
  } finally {
    fixture.destroy();
  }
});

test("does not retain listeners if focusing the handle cancels its owner", async () => {
  const fixture = new TableResizeFixture(await createTestCoreEditor());
  try {
    fixture.handle.tabIndex = 0;
    fixture.handle.addEventListener("focus", () => fixture.controller.cancel(), { once: true });
    fixture.controller.start(fixture.pointer(100), fixture.handle);
    expect(fixture.handle.hasPointerCapture(1)).toBe(false);
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  } finally {
    fixture.destroy();
  }
});

test("restores every preview and releases capture when the grouped write fails", async () => {
  const fixture = new TableResizeFixture(await createTestCoreEditor());
  try {
    fixture.controller.start(fixture.pointer(100), fixture.handle);
    fixture.controller.move(fixture.pointer(140));
    const error = new Error("width write failed");
    jestApi.spyOn(fixture.panel.blocks, "updateBlocks").mockImplementation(() => {
      throw error;
    });
    expect(() => fixture.controller.finish(fixture.pointer(140), true)).toThrow(error);
    expect(
      fixture.targets.every(
        (target) => target.style.getPropertyValue(COLUMN_WIDTH_PROPERTY) === "180px",
      ),
    ).toBe(true);
    expect(fixture.handle.hasPointerCapture(1)).toBe(false);
  } finally {
    jestApi.restoreAllMocks();
    fixture.destroy();
  }
});
