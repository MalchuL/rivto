import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockSelectionExtensions } from "../block-selection-extensions";

it.each([
  ["<div data-block-selection-anchor><span data-target>Text</span></div>", true],
  ["<div data-block-selection-anchor><button data-target>Button</button></div>", false],
  ["<button data-block-selection-anchor data-target>Button</button>", true],
  [
    "<button data-block-selection-anchor><span data-block-selection-anchor data-target>Text</span></button>",
    false,
  ],
  [
    "<button data-block-selection-anchor data-prevent-text-editing data-target>Button</button>",
    false,
  ],
])("admits a pointer start only for eligible anchors: %s", (markup, expected) => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("block", { content: "Text" });
  adapter.setBlockIds(["block"]);
  const editor = new BlockEditorController({ adapter });
  const extensions = new BlockSelectionExtensions({
    toggle: "toggle",
    range: "range",
    exact: "exact",
  });
  editor.extensions.register("pointer", extensions.feature("pointer"));
  const acquire = jest.spyOn(editor.pointer, "acquire").mockReturnValue(undefined);
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = `<div data-block-id="block">${markup}</div>`;
  document.body.append(root);
  try {
    attachTestRoot(editor, root);
    root
      .querySelector("[data-target]")!
      .dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
    expect(acquire).toHaveBeenCalledTimes(expected ? 1 : 0);
  } finally {
    acquire.mockRestore();
    editor.destroy();
    root.remove();
  }
});
