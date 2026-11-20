/** @jest-environment ./jest-browser-environment.mjs */
import type { DocumentEditorAPI } from "@chulane/rivto";
import type { PointerInput } from "@chulane/rivto-root";
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { createTestCoreEditor, createTestReactEditor } from "../../../../test-utils";
import { createTableBlockInput, tableExtension } from "../table";
import { TableResizeController } from "../table-resize-controller";
import type { TableResizeHost, TableResizeRoot, TableResizeStart } from "../types";
import {
  CELL_ITEM_ATTRIBUTE,
  COLUMN_WIDTH_PROPERTY,
  TABLE_RESIZE_HANDLE_ATTRIBUTE,
} from "../table-column-width";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

/** Owns a real table and deterministic mounted cell placements for resize lifecycle checks. */
class TableResizeFixture {
  readonly root = document.createElement("div");
  readonly handle = document.createElement("div");
  readonly inputRoot = new BrowserInputRoot(this.root);
  readonly startInput: TableResizeStart;
  readonly panel;
  readonly controller: TableResizeController;
  readonly host: TableResizeHost;
  readonly ids: string[];
  readonly targets: HTMLElement[] = [];
  private captured = false;
  private pointerInput: PointerInput | undefined;
  private readonly css = Object.getOwnPropertyDescriptor(globalThis, "CSS");
  private readonly availability = new Set<() => void>();
  private readonly releaseInput: () => void;

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
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: { escape: (value: string) => value },
    });
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
    this.handle.setAttribute(TABLE_RESIZE_HANDLE_ATTRIBUTE, "");
    this.handle.setPointerCapture = this.capture;
    this.handle.hasPointerCapture = this.hasCapture;
    this.handle.releasePointerCapture = this.release;
    document.body.append(this.root);
    const feedback = this.inputRoot.captureRegionByIdentity(getBrowserElementIdentity(this.handle));
    if (!feedback) {
      throw new Error("Resize fixture cannot capture its separator");
    }
    this.startInput = { feedback };
    this.releaseInput = this.observePointer();
    this.host = {
      blocks: this.panel.blocks,
      inputRoot: this.inputRoot,
      subscribeAvailability: (listener) => {
        this.availability.add(listener);
        return () => this.availability.delete(listener);
      },
    };
    this.controller = new TableResizeController(this.host, this.ids[0]!);
    core.history.clear();
  }

  /**
   * Supplies native fields absent from jsdom's pointer event implementation.
   *
   * @param x - Viewport X coordinate in CSS pixels.
   * @param pointerId - Identity of the pointer, defaulting to the owning gesture.
   * @returns Normalized pointer input for direct controller delivery.
   */
  pointer(x: number, pointerId = 1): PointerInput {
    const event = new MouseEvent("pointermove", {
      clientX: x,
      button: 0,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "pointerId", { value: pointerId });
    this.pointerInput = undefined;
    this.handle.dispatchEvent(event);
    const result = this.pointerInput;
    if (!result) {
      throw new Error("Pointer input was not delivered");
    }
    return result;
  }

  /**
   * Replaces the borrowed occurrence and notifies active gesture observers.
   *
   * @param root - New occurrence, or undefined when the panel becomes unavailable.
   * @returns Active listeners have observed the new occurrence.
   */
  setInputRoot(root: TableResizeRoot | undefined): void {
    Object.assign(this.host, { inputRoot: root });
    for (const listener of [...this.availability]) {
      listener();
    }
  }

  /**
   * Releases gesture resources before destroying the borrowed panel and document.
   *
   * @returns No mounted fixture or owned model remains.
   */
  destroy(): void {
    this.controller.cancel();
    this.releaseInput();
    this.inputRoot.detach();
    if (this.css) {
      Object.defineProperty(globalThis, "CSS", this.css);
    } else {
      Reflect.deleteProperty(globalThis, "CSS");
    }
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

  /**
   * Retains pointer delivery until the fixture releases its Root.
   *
   * @returns Disposer for the fixture's pointer observer.
   * @throws If the Root cannot observe the separator.
   */
  private observePointer(): () => void {
    const release = this.inputRoot.observeInput("pointermove", (input) => {
      this.pointerInput = input;
    });
    if (!release) {
      throw new Error("Resize fixture cannot observe pointer input");
    }
    return release;
  }
}

test.each([2, 200])(
  "captures %i column placements once and commits one undoable width",
  async (rows) => {
    const fixture = new TableResizeFixture(await createTestCoreEditor(), rows);
    const query = jestApi.spyOn(fixture.root, "querySelectorAll");
    const read = jestApi.spyOn(fixture.panel.blocks, "getBlockNode");
    try {
      fixture.controller.start(fixture.pointer(100), fixture.startInput);
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
      fixture.controller.start(fixture.pointer(100), fixture.startInput);
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
    fixture.controller.start(fixture.pointer(100), fixture.startInput);
    fixture.controller.move(fixture.pointer(140));
    fixture.core.blocks.updateBlock(fixture.ids[0]!, { props: { tableColumnWidth: 260 } });
    fixture.controller.cancel();
    expect(fixture.targets[0]!.style.getPropertyValue(COLUMN_WIDTH_PROPERTY)).toBe("260px");
    fixture.controller.start(fixture.pointer(100), fixture.startInput);
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
    expect(() => fixture.controller.start(fixture.pointer(100), fixture.startInput)).toThrow(
      "capture failed",
    );
    capture.mockRestore();
    fixture.controller.start(fixture.pointer(100), fixture.startInput);
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
    fixture.controller.start(fixture.pointer(100), fixture.startInput);
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
    fixture.controller.start(fixture.pointer(100), fixture.startInput);
    expect(fixture.handle.hasPointerCapture(1)).toBe(false);
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  } finally {
    fixture.destroy();
  }
});

test("releases pointer capture when capture synchronously cancels the gesture", async () => {
  const fixture = new TableResizeFixture(await createTestCoreEditor());
  const capture = fixture.handle.setPointerCapture.bind(fixture.handle);
  const spy = jestApi.spyOn(fixture.handle, "setPointerCapture").mockImplementation((pointerId) => {
    capture(pointerId);
    fixture.controller.cancel();
  });
  try {
    fixture.controller.start(fixture.pointer(100), fixture.startInput);
    expect(fixture.handle.hasPointerCapture(1)).toBe(false);
    expect(fixture.handle.hasAttribute("data-resizing")).toBe(false);
    const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    window.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
  } finally {
    spy.mockRestore();
    fixture.destroy();
  }
});

test("does not start a gesture when the Root detaches during target lookup", async () => {
  const fixture = new TableResizeFixture(await createTestCoreEditor());
  const query = fixture.root.querySelectorAll.bind(fixture.root);
  const spy = jestApi.spyOn(fixture.root, "querySelectorAll").mockImplementationOnce((selector) => {
    const nodes = query(selector);
    fixture.inputRoot.detach();
    return nodes;
  });
  try {
    fixture.controller.start(fixture.pointer(100), fixture.startInput);
    expect(fixture.handle.hasPointerCapture(1)).toBe(false);
    expect(fixture.handle.hasAttribute("data-resizing")).toBe(false);
  } finally {
    spy.mockRestore();
    fixture.destroy();
  }
});

test("cancels an active preview when the panel replaces its Root on the same element", async () => {
  const fixture = new TableResizeFixture(await createTestCoreEditor());
  const replacement = new BrowserInputRoot(fixture.root);
  try {
    fixture.controller.start(fixture.pointer(100), fixture.startInput);
    fixture.controller.move(fixture.pointer(140));
    fixture.setInputRoot(replacement);
    expect(fixture.handle.hasPointerCapture(1)).toBe(false);
    expect(fixture.handle.hasAttribute("data-resizing")).toBe(false);
    expect(fixture.targets[0]!.style.getPropertyValue(COLUMN_WIDTH_PROPERTY)).toBe("180px");
    expect(fixture.core.blocks.getBlockNode(fixture.ids[0]!)?.props.tableColumnWidth).toBe(180);
  } finally {
    replacement.detach();
    fixture.destroy();
  }
});

test("restores every preview and releases capture when the grouped write fails", async () => {
  const fixture = new TableResizeFixture(await createTestCoreEditor());
  try {
    fixture.controller.start(fixture.pointer(100), fixture.startInput);
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
