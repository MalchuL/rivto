import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("exposes portable selection operations on the controller", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const checkType = () => {
    // @ts-expect-error Native endpoint reads are internal to the browser implementation.
    const read = editor.browserSelection.readDOMSelectionPoint;
    // @ts-expect-error Native endpoint writes are internal to the browser implementation.
    const write = editor.browserSelection.setNativeSelection;
    return [read, write];
  };
  void checkType;
  expect(editor.browserSelection.readEditorDOMSelection()).toBeUndefined();
  editor.destroy();
});
