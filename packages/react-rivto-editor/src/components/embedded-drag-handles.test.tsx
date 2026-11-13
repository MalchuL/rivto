/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { EmbeddedDragHandles } from "./embedded-drag-handles";

test("embedded drag targets expose Page anchors only when requested", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const regions = [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }];
  try {
    act(() => root.render(<EmbeddedDragHandles regions={regions} className="custom" />));
    const target = container.querySelector<HTMLElement>("[data-rivto-embedded-drag-handle]");
    expect(target?.className).toBe("custom");
    expect(target?.style.left).toBe("10%");
    expect(target?.style.width).toBe("30%");
    expect(target?.hasAttribute("data-editor-control")).toBe(false);
    act(() => root.render(<EmbeddedDragHandles regions={regions} blockSelectionAnchor />));
    expect(target?.hasAttribute("data-editor-control")).toBe(true);
    expect(target?.hasAttribute("data-block-selection-anchor")).toBe(true);
    act(() => root.render(<EmbeddedDragHandles regions={[]} />));
    expect(container.querySelector("[data-rivto-embedded-drag-handle]")).toBeNull();
  } finally {
    act(() => root.unmount());
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
