/** @jest-environment ./jest-browser-environment.mjs */
import type { EditorElementNode } from "@chulane/rivto";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../../test-utils";
import { useEdgelessElementStyle } from "../use-edgeless-element-style";

/**
 * Renders the mounted host using the current element snapshot.
 *
 * @param props - Element geometry supplied by the fixture.
 * @param props.element - Current snapshot used for the style calculation.
 * @returns A positioned host with its mounting ref.
 */
function Element({ element }: { readonly element: EditorElementNode }) {
  const { ref, style } = useEdgelessElementStyle<HTMLDivElement>(element);
  return <div ref={ref} style={style} />;
}

test("preserves locked geometry through Root and returns to the model after detach", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const element = panel.elements.insertElement({
    type: "rectangle",
    frame: { x: 10, y: 20, width: 100, height: 120 },
    zIndex: 0,
  });
  const node = panel.elements.getElementNode(element.id)!;
  const surface = document.createElement("div");
  document.body.append(surface);
  const view = createRoot(surface);
  try {
    panel.setRoot(surface);
    act(() =>
      view.render(
        <TestPanel panel={panel}>
          <Element element={node} />
        </TestPanel>,
      ),
    );
    const host = surface.firstElementChild as HTMLElement;
    host.dataset.edgelessGeometryLock = "true";
    host.style.transform = "translate(40px, 50px) rotate(20deg)";
    host.style.width = "240px";
    act(() =>
      view.render(
        <TestPanel panel={panel}>
          <Element element={{ ...node, zIndex: 1 }} />
        </TestPanel>,
      ),
    );
    expect(host.style.transform).toBe("translate(40px, 50px) rotate(20deg)");
    expect(host.style.width).toBe("240px");
    panel.setRoot(null);
    act(() =>
      view.render(
        <TestPanel panel={panel}>
          <Element element={{ ...node, zIndex: 2 }} />
        </TestPanel>,
      ),
    );
    expect(host.style.transform).toBe("translate(10px, 20px) rotate(0deg)");
    expect(host.style.width).toBe("100px");
  } finally {
    act(() => view.unmount());
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
