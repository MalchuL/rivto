import { useEffect, type RefObject } from "react";
import type { EditorBlockNode } from "@chulane/rivto";

/**
 * Aligns a visible handle with the first visible text fragment in its block content.
 *
 * Measurements are deferred to a frame and limited to the hovered or focused row.
 * Blocks without visible text keep their normal handle position.
 *
 * @param button - Handle owned by the current block slot.
 * @param block - Current snapshot, used to reschedule after document updates.
 * @param alwaysVisible - Whether the host displays the handle without row interaction.
 * @returns No value; listeners and pending frames are released on cleanup.
 */
export function useHandleAlignment(
  button: RefObject<HTMLButtonElement | null>,
  block: EditorBlockNode,
  alwaysVisible: boolean,
): void {
  useEffect(() => {
    const handle = button.current;
    const row = handle?.closest<HTMLElement>(".rivto-block-row");
    if (!handle || !row) {
      return;
    }
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      // Wait for the renderer to reflect the latest content or focus state.
      frame = requestAnimationFrame(() => {
        const textRoot = row.querySelector<HTMLElement>(".rivto-block-content");
        const walker = textRoot && document.createTreeWalker(textRoot, NodeFilter.SHOW_TEXT);
        let text = walker?.nextNode();
        while (text) {
          const parent = text.parentElement;
          const color = parent && getComputedStyle(parent).color;
          // Ignore hidden or transparent text, including the idle Markdown editor.
          if (
            text.textContent?.trim() &&
            parent?.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
            !color?.endsWith(", 0)")
          ) {
            break;
          }
          text = walker?.nextNode();
        }
        if (!text) {
          // Restore the original CSS position when the block has no visible text.
          handle.style.top = "";
          return;
        }
        const range = document.createRange();
        const start = text.textContent?.search(/\S/) ?? 0;
        // A single character measures the first line even when the text wraps.
        range.setStart(text, start);
        range.setEnd(text, start + 1);
        const line = range.getBoundingClientRect();
        const box = handle.getBoundingClientRect();
        // Convert viewport coordinates back to local CSS pixels under zoom or scale.
        const scale = box.height / handle.offsetHeight || 1;
        const offset = parseFloat(handle.style.top) || 0;
        handle.style.top = `${offset + (line.top + line.height / 2 - box.top - box.height / 2) / scale}px`;
      });
    };
    row.addEventListener("mouseenter", schedule);
    row.addEventListener("focusin", schedule);
    row.addEventListener("focusout", schedule);
    if (alwaysVisible || row.matches(":hover, :focus-within")) {
      schedule();
    }
    return () => {
      row.removeEventListener("mouseenter", schedule);
      row.removeEventListener("focusin", schedule);
      row.removeEventListener("focusout", schedule);
      cancelAnimationFrame(frame);
    };
  }, [button, block, alwaysVisible]);
}
