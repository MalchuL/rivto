import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("borrows the current Root region for virtualization and releases it on detach", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const capture = jest.spyOn(root, "captureRegionByIdentity");
  try {
    const detach = editor.attach(root);
    expect(capture).toHaveBeenCalledWith(root.getElementIdentity());
    detach();
    expect(root.isAttached()).toBe(true);
    expect(editor.inputRoot).toBeUndefined();
  } finally {
    root.detach();
    editor.destroy();
  }
});

it("rolls back attachment when the Root ends during region capture", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  jest.spyOn(root, "captureRegionByIdentity").mockImplementationOnce(() => {
    root.detach();
    return undefined;
  });
  try {
    expect(() => editor.attach(root)).toThrow(
      "attachment ended during virtualization setup",
    );
    expect(editor.inputRoot).toBeUndefined();
  } finally {
    root.detach();
    editor.destroy();
  }
});
