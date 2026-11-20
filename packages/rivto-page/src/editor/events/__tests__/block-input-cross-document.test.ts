import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockSelectionExtensions } from "../../selection/block-selection-extensions";

it("resolves target ancestry in the attached occurrence's document realm", () => {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const frameDocument = frame.contentDocument!;
  const root = frameDocument.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="block"><button>Inside</button></div>';
  frameDocument.body.append(root);
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const ancestry = jest.fn();
  editor.events.register("click", { type: "click", scope: "block", priority: 0 }, (event) => {
    ancestry(event.input.target?.hasAncestor("[data-block-id]"));
    return "continue";
  });
  const detach = attachTestRoot(editor, root);
  root
    .querySelector("button")!
    .dispatchEvent(new frameDocument.defaultView!.MouseEvent("click", { bubbles: true }));
  expect(ancestry).toHaveBeenCalledWith(true);
  detach();
  editor.destroy();
  frame.remove();
});

it("passes block ancestry to selection policy for an iframe occurrence", () => {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const frameDocument = frame.contentDocument!;
  const root = frameDocument.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="block"><span>Inside</span></div>';
  frameDocument.body.append(root);
  const adapter = new TestBlockEditorAdapter();
  const canStartSelection = jest.fn(() => true);
  Object.assign(adapter.selection, { canStartSelection });
  const editor = new BlockEditorController({ adapter });
  const features = new BlockSelectionExtensions({
    toggle: "toggle",
    range: "range",
    exact: "exact",
  });
  editor.extensions.register("click", features.feature("click"));
  const detach = attachTestRoot(editor, root);
  root
    .querySelector("span")!
    .dispatchEvent(
      new frameDocument.defaultView!.MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
  expect(canStartSelection).toHaveBeenCalledWith(true);
  detach();
  editor.destroy();
  frame.remove();
});
