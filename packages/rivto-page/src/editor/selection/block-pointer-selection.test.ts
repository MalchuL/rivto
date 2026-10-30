import { BlockEditorController } from "../block-editor-controller";
import { TestBlockEditorAdapter } from "../../test-utils/test-block-editor-adapter";
import { BlockSelectionExtensions } from "./block-selection-extensions";

it("clears coverage on page whitespace before bubbling, while preserving controls and nested editors", () => {
  const adapter = new TestBlockEditorAdapter();
  const clear = jest.spyOn(adapter.selection, "clear");
  const editor = new BlockEditorController({ adapter });
  const features = new BlockSelectionExtensions({
    toggle: "toggle",
    range: "range",
    exact: "exact",
  });
  editor.extensions.register("click", features.feature("click"));
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    "<button>Menu</button><div data-prevent-text-editing>Handle</div><div data-rivto-block-editor><span>Nested</span></div>";
  editor.attach(root);
  for (const target of [
    root.querySelector("button")!,
    root.children[1],
    root.querySelector("span")!,
  ]) {
    target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  }
  expect(clear).not.toHaveBeenCalled();
  const bubble = jest.fn(() => expect(clear).toHaveBeenCalledTimes(1));
  root.addEventListener("pointerdown", bubble);
  root.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  expect(bubble).toHaveBeenCalledTimes(1);
  editor.destroy();
});

it.each([
  ["<button data-editor-control data-block-selection-anchor><span>Count</span></button>", true],
  ["<button data-editor-control><span>Count</span></button>", false],
  [
    "<div data-block-selection-anchor><button data-editor-control><span>Count</span></button></div>",
    false,
  ],
  [
    "<div data-prevent-text-editing><button data-editor-control data-block-selection-anchor><span>Count</span></button></div>",
    false,
  ],
])("toggles only directly opted-in controls: %s", (markup, allowed) => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("counter");
  adapter.setBlockIds(["counter"]);
  const editor = new BlockEditorController({ adapter });
  const features = new BlockSelectionExtensions({
    toggle: "toggle",
    range: "range",
    exact: "exact",
  });
  editor.extensions.register("toggle", features.feature("toggle"));
  jest.spyOn(editor.keyboard, "isHeld").mockReturnValue(true);
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.tabIndex = -1;
  root.innerHTML = `<div data-block-id="counter">${markup}</div>`;
  document.body.append(root);
  editor.attach(root);
  try {
    const event = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    root.querySelector("span")!.dispatchEvent(event);
    expect(adapter.selection.get()?.blocks.map(({ id }) => id) ?? []).toEqual(
      allowed ? ["counter"] : [],
    );
    expect(event.defaultPrevented).toBe(allowed);
    if (allowed) {
      root.querySelector("span")!.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          ctrlKey: true,
        }),
      );
      expect(adapter.selection.get()).toBeUndefined();
    }
  } finally {
    editor.destroy();
    root.remove();
  }
});

it("retains selection published by an earlier native capture owner", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("owned");
  const editor = new BlockEditorController({ adapter });
  const features = new BlockSelectionExtensions({
    toggle: "toggle",
    range: "range",
    exact: "exact",
  });
  editor.extensions.register("click", features.feature("click"));
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.addEventListener(
    "pointerdown",
    (event) => {
      adapter.selection.set({
        type: "selection",
        blocks: [{ id: "owned", start: 0, end: -1 }],
        anchorBlockId: "owned",
        focusBlockId: "owned",
      });
      event.stopPropagation();
    },
    { capture: true },
  );
  editor.attach(root);
  try {
    root.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    expect(adapter.selection.get()?.blocks.map(({ id }) => id)).toEqual(["owned"]);
  } finally {
    editor.destroy();
  }
});
