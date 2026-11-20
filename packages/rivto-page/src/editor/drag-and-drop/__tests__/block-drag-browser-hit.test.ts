import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockEditorController } from "../../block-editor-controller";
import { BlockDragBrowser } from "../browser/block-drag-browser";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

afterEach(() => document.body.replaceChildren());

it("uses a connected movement target only while it does not capture the pointer", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const target = document.createElement("div");
  document.body.append(root);
  root.append(target);
  const browser = new BlockDragBrowser(new BrowserInputRoot(root));
  let captured = false;
  let disconnect = false;
  Object.defineProperty(target, "hasPointerCapture", { value: () => captured });
  const hits: unknown[] = [];
  editor.events.observe(
    "drag-hit",
    { type: "pointermove", target: "window", priority: 0 },
    (event) => {
      if (disconnect) {
        target.remove();
      }
      hits.push(browser.uncapturedHit(event));
    },
  );
  const detach = attachTestRoot(editor, root);
  try {
    target.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    captured = true;
    target.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    captured = false;
    disconnect = true;
    target.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
    expect(hits[0]).toBeDefined();
    expect(hits[0]).not.toBe(target);
    expect(hits[0]).not.toBeInstanceOf(Element);
    expect(hits.slice(1)).toEqual([undefined, undefined]);
  } finally {
    detach();
    editor.destroy();
  }
});
