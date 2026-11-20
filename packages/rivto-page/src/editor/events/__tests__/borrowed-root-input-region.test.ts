import type { InputRegion } from "@chulane/rivto-root";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("invalidates a normalized input region when the borrowed occurrence detaches", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const element = document.createElement("div");
  const block = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  block.dataset.blockId = "first";
  element.append(block);
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  let region: InputRegion | undefined;
  editor.events.observe("capture-region", { type: "pointerdown", priority: 0 }, ({ input }) => {
    region = input.captureRegion("[data-block-id]", "[data-block-id]", "[data-rivto-block-editor]");
  });
  const detach = editor.attach(root);
  try {
    block.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(region?.readAttribute("data-block-id")).toBe("first");
    root.detach();
    expect(region?.readAttribute("data-block-id")).toBeUndefined();
  } finally {
    detach();
    root.detach();
    editor.destroy();
    element.remove();
  }
});
