import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("resolves text-node events to their block in the occurrence's document", () => {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const doc = frame.contentDocument!;
  const root = doc.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="block"><span data-block-content>Text</span></div>';
  doc.body.append(root);
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const received = jest.fn();
  editor.events.register("click", { type: "click", priority: 0, scope: "content" }, (event) => {
    received(event.blockId, event.input.target?.hasAncestor("[data-block-content]"));
    return "continue";
  });
  const detach = attachTestRoot(editor, root);
  root
    .querySelector("span")!
    .firstChild!.dispatchEvent(new doc.defaultView!.MouseEvent("click", { bubbles: true }));
  expect(received).toHaveBeenCalledWith("block", true);
  detach();
  editor.destroy();
  frame.remove();
});
