import { renderToStaticMarkup } from "react-dom/server";
import { edgelessVisualsExtension } from "../../extensions/edgeless/visuals/extension";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../test-utils";
import { useEdgelessOperations } from "../../hooks/elements/use-edgeless-operations";
import type { EdgelessOperations } from "../../managers/elements/edgeless-operations";
import { EdgelessToolsProvider } from "./edgeless-tools-context";

it("shares settings between hook consumers only within the same provider", async () => {
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor, extensions: [edgelessVisualsExtension()] });
  const consumers: EdgelessOperations[] = [];
  /**
   * Captures an operation consumer without adding an independent settings session.
   *
   * @returns No visible content; the fixture retains operations for assertions.
   */
  function Consumer() {
    consumers.push(useEdgelessOperations());
    return null;
  }
  renderToStaticMarkup(
    <TestPanel panel={panel}>
      <EdgelessToolsProvider>
        <Consumer />
        <Consumer />
      </EdgelessToolsProvider>
      <EdgelessToolsProvider>
        <Consumer />
      </EdgelessToolsProvider>
    </TestPanel>,
  );
  expect(consumers[0]).toBe(consumers[1]);
  expect(consumers[0]).not.toBe(consumers[2]);
  consumers[0]!.setCreationDefaults({ group: "shapes" }, { props: { fill: "red" } });
  expect(consumers[1]!.getDefaults({ type: "ellipse" }).props?.fill).toBe("red");
  expect(consumers[2]!.getDefaults({ type: "ellipse" }).props?.fill).not.toBe("red");
  consumers.forEach((operations) => operations.destroy());
  await panel.editor.destroy();
  await editor.destroy();
});
