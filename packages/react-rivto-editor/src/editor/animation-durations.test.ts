import { ChildrenPanel } from "@chulane/rivto";
import { createTestCoreEditor } from "../test-utils";
import { ReactPanel } from "../panels/react-panel";
import { createReactEditor } from "./react-editor";

test.each([undefined, { blockSelection: 0 }, { blockSelection: 0.8 }])(
  "passes animation settings %p to the owned Page controller",
  async (animations) => {
    const core = await createTestCoreEditor();
    const editor = createReactEditor({ editor: core, animations });
    const panel = new ReactPanel(editor, new ChildrenPanel(editor));
    try {
      expect(editor.animations).toBe(animations);
      expect(panel.page.animations).toBe(animations);
    } finally {
      panel.destroy();
      editor.destroy();
      await core.destroy();
    }
  },
);
