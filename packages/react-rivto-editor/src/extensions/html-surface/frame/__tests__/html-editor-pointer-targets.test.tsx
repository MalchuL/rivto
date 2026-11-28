/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { HtmlEditorPointerTargets } from "../html-editor-pointer-targets";

test("editor pointer targets expose Page anchors and the grab cursor per surface", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const regions = [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }];
  try {
    act(() => root.render(<HtmlEditorPointerTargets regions={regions} />));
    const target = container.querySelector<HTMLElement>("[data-html-editor-pointer]");
    expect(target?.style.left).toBe("10%");
    expect(target?.style.width).toBe("30%");
    expect(target?.hasAttribute("data-editor-control")).toBe(false);
    expect(target?.style.cursor).toBe("grab");
    act(() => root.render(<HtmlEditorPointerTargets regions={regions} blockSelectionAnchor />));
    expect(target?.hasAttribute("data-editor-control")).toBe(true);
    expect(target?.hasAttribute("data-block-selection-anchor")).toBe(true);
    expect(target?.style.cursor).toBe("");
    act(() => root.render(<HtmlEditorPointerTargets regions={[]} />));
    expect(container.querySelector("[data-html-editor-pointer]")).toBeNull();
  } finally {
    act(() => root.unmount());
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
