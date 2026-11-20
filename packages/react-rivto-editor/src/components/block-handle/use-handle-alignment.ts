import { useEffect, type RefObject } from "react";
import { BLOCK_EDITOR_CLASSES } from "@chulane/rivto-page";
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
    const row = handle?.closest<HTMLElement>(`.${BLOCK_EDITOR_CLASSES.row}`);
    if (!handle || !row) {
      // The slot can unmount before this effect runs.
      return;
    }
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      // Wait for the renderer to reflect the latest content or focus state.
      frame = requestAnimationFrame(() => {
        const line = firstVisibleCharacterRect(row);
        if (!line) {
          // Restore the original CSS position when the block has no visible text.
          handle.style.top = "";
          return;
        }
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

/**
 * Measures the first non-whitespace character in the row's visible content.
 *
 * A single character measures the first line even when the text wraps.
 * The inactive Markdown editor and transparent text do not determine alignment.
 *
 * @param row - Mounted block row containing the handle and its content.
 * @returns Character bounds in viewport pixels, or undefined for a row without visible text.
 */
function firstVisibleCharacterRect(row: HTMLElement): DOMRect | undefined {
  const content = row.querySelector(`.${BLOCK_EDITOR_CLASSES.content}`);
  if (!content) {
    // A slot without rendered content keeps its CSS alignment.
    return;
  }
  const walker = row.ownerDocument.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const parent = text.parentElement;
    const start = text.textContent?.search(/\S/) ?? -1;
    if (
      start < 0 ||
      !parent?.checkVisibility({ opacityProperty: true, visibilityProperty: true }) ||
      getComputedStyle(parent).color.endsWith(", 0)")
    ) {
      continue;
    }
    const range = row.ownerDocument.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + 1);
    // Later fragments can wrap to a different line.
    return range.getBoundingClientRect();
  }
}
