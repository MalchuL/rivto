import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockEditorController } from "../../block-editor-controller";

it("uses current registrations when a pointer event is dispatched again", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  document.body.append(root);
  const seen: string[] = [];
  const removeFirst = editor.events.register(
    "first",
    { type: "pointermove", target: "root", capture: true, priority: 0 },
    () => {
      seen.push("first");
      return "continue";
    },
  );
  const detach = attachTestRoot(editor, root);
  try {
    const event = new MouseEvent("pointermove", { bubbles: true });
    root.dispatchEvent(event);
    removeFirst();
    editor.events.register(
      "second",
      { type: "pointermove", target: "root", capture: false, priority: 0 },
      () => {
        seen.push("second");
        return "continue";
      },
    );
    root.dispatchEvent(event);
    expect(seen).toEqual(["first", "second"]);
  } finally {
    detach();
    editor.destroy();
    root.remove();
  }
});
