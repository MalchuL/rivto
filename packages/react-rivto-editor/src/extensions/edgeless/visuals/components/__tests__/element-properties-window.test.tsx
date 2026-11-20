/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../../../../test-utils";
import { EdgelessOperations } from "../../../../../managers/elements/edgeless-operations";
import { ElementProperties } from "../element-properties";

it("commits previews on outside presses and Root replacement but not inside the panel", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core });
  panel.editor.elementTypes.register({
    definition: { type: "test-shape", defaults: { color: "blue" } },
    render: () => null,
  });
  const operations = new EdgelessOperations(panel.editor, panel);
  operations.observeChanges();
  const element = operations.createElement({ type: "test-shape" });
  const surface = document.createElement("div");
  const outside = document.createElement("button");
  document.body.append(surface, outside);
  const view = createRoot(surface);
  try {
    panel.setRoot(surface);
    act(() =>
      view.render(
        <TestPanel panel={panel}>
          <ElementProperties
            ids={[element.id]}
            title="Shape"
            component={() => <button>Inside</button>}
            operations={operations}
          />
        </TestPanel>,
      ),
    );
    operations.previewProperties([element.id], { color: "red" });
    act(() =>
      surface
        .querySelector("button")!
        .dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })),
    );
    expect(core.elements.getElementNode(element.id)?.props.color).toBe("blue");
    act(() => outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(core.elements.getElementNode(element.id)?.props.color).toBe("red");
    operations.previewProperties([element.id], { color: "green" });
    act(() => {
      panel.setRoot(null);
      panel.setRoot(surface);
    });
    expect(core.elements.getElementNode(element.id)?.props.color).toBe("green");
  } finally {
    act(() => view.unmount());
    operations.destroy();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    outside.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
