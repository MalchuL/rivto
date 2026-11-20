/** @jest-environment ./jest-browser-environment.mjs */
import { attachTestBrowserEvents } from "../../../../../test-utils/attach-test-browser-events";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BrowserEvents } from "@chulane/rivto-root/browser";
import { presetPointerStart } from "../preset-pointer-input";
import { createPresetPreview } from "../../hooks/browser/preset-preview";
import type { PresetPointerStart, PresetPreview } from "../../hooks/types";

test("copies Root pointer input and keeps capture and preview hosts behind capabilities", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const events = new BrowserEvents();
  const detach = attachTestBrowserEvents(events, container);
  const renderer = createRoot(container);
  let input: PresetPointerStart | undefined;
  let release: (() => void) | undefined;
  let preview: PresetPreview | undefined;
  let captured = 0;
  let released = 0;
  const stop = events.observe({ id: "fixture.start", type: "pointerdown" }, (sample) => {
    input = presetPointerStart(sample, () =>
      createPresetPreview(container.ownerDocument, "fixture"),
    );
    release = input.capture();
    preview = input.createPreview();
  });
  try {
    act(() =>
      renderer.render(
        <div data-edgeless-toolbar="">
          <button data-canvas-tool="fixture" />
        </div>,
      ),
    );
    const button = container.querySelector("button")!;
    button.setPointerCapture = () => {
      captured += 1;
    };
    button.hasPointerCapture = () => true;
    button.releasePointerCapture = () => {
      released += 1;
    };
    const event = new MouseEvent("pointerdown", { bubbles: true, clientX: 12, clientY: 20 });
    Object.defineProperty(event, "pointerId", { value: 7 });
    act(() => button.dispatchEvent(event));
    expect(input).toMatchObject({ clientX: 12, clientY: 20, pointerId: 7 });
    expect(input).not.toHaveProperty("nativeEvent");
    expect(input).not.toHaveProperty("currentTarget");
    expect(preview).not.toHaveProperty("host");
    expect(document.querySelector('[data-kind="fixture"].edgeless-preset-ghost')).not.toBeNull();
    release?.();
    release?.();
    preview?.remove();
    expect(captured).toBe(1);
    expect(released).toBe(1);
    expect(document.querySelector('[data-kind="fixture"].edgeless-preset-ghost')).toBeNull();
  } finally {
    stop();
    act(() => renderer.unmount());
    detach();
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
