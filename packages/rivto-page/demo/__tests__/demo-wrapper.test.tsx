import { act } from "react";
import { createRoot } from "react-dom/client";
import { BlockEditor } from "../../src/presentation/components/block-editor/block-editor";
import { BlockEditorController } from "../../src/editor/block-editor-controller";
import { TestBlockEditorAdapter } from "../../src/test-utils/test-block-editor-adapter";
import { DemoBlockWrapper } from "../demo-wrapper";

it("marks only the nearest wrapper on every pointer delivery", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("outer", { childIds: ["inner"] });
  adapter.setNode("inner");
  adapter.setBlockIds(["outer"]);
  const editor = new BlockEditorController({ adapter });
  editor.wrappers.register({ component: DemoBlockWrapper, priority: 0 });
  const container = document.createElement("div");
  document.body.append(container);
  const view = createRoot(container);
  const scroll = jest.spyOn(window, "scrollTo").mockImplementation(() => {});
  try {
    act(() => view.render(<BlockEditor editor={editor} />));
    const outer = container.querySelector<HTMLElement>('[data-demo-wrapper="outer"]')!;
    const inner = container.querySelector<HTMLElement>('[data-demo-wrapper="inner"]')!;
    const target = inner.querySelector<HTMLElement>('[data-block-id="inner"]')!;
    act(() => target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(inner.getAttribute("data-demo-wrapper-pointer")).toBe("true");
    expect(outer.hasAttribute("data-demo-wrapper-pointer")).toBe(false);
    inner.removeAttribute("data-demo-wrapper-pointer");
    act(() => target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(inner.getAttribute("data-demo-wrapper-pointer")).toBe("true");
    expect(outer.hasAttribute("data-demo-wrapper-pointer")).toBe(false);
  } finally {
    act(() => view.unmount());
    editor.destroy();
    scroll.mockRestore();
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
