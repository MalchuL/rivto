import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { captureTestInputHit } from "../../../test-utils/capture-test-input-hit";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("does not expose the receiving outline element in a resolved target", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("parent");
  const editor = new BlockEditorController({ adapter });
  const root = document.createElement("div");
  const shell = document.createElement("section");
  const host = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.append(shell, host);
  document.body.append(root);
  jest.spyOn(host, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    toJSON: () => ({}),
  });
  editor.regions.register("parent", "shell", getBrowserElementIdentity(shell));
  editor.dropTargets.register({
    identity: getBrowserElementIdentity(host),
    getRegions: () => [{ kind: "inside", destination: { kind: "inside", parentId: "parent" } }],
  });
  const detach = attachTestRoot(editor, root);
  try {
    const target = editor.dropTargets.resolve(50, 50, undefined, captureTestInputHit(host));
    expect(target?.destination).toEqual({ kind: "inside", parentId: "parent" });
    expect(target).not.toHaveProperty("outlineElement");
    expect(target).not.toHaveProperty("element");
    const outline = target?.outline;
    expect(outline).toBeDefined();
    const restore = outline!.setTemporaryAttribute("data-block-drop-active", "true");
    expect(shell.getAttribute("data-block-drop-active")).toBe("true");
    detach();
    attachTestRoot(editor, root);
    restore();
    outline!.setTemporaryAttribute("data-block-drop-active", "stale");
    expect(shell.hasAttribute("data-block-drop-active")).toBe(false);
    target!.anchor.setTemporaryAttribute("data-block-drop-active", "stale");
    expect(host.hasAttribute("data-block-drop-active")).toBe(false);
  } finally {
    editor.destroy();
    root.remove();
    jest.restoreAllMocks();
  }
});
