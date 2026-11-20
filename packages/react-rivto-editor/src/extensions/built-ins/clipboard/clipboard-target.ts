/**
 * Detects clipboard events that belong to a marked text input or non-block contenteditable host.
 *
 * Edgeless visual labels (text, stickers, shapes, connectors) are plain-text
 * `contentEditable` hosts without `data-block-content`. Structured copy/paste
 * must not claim those events: paste would follow the previous block selection,
 * and copy would serialize the selected visual as a new element.
 * Marked text inputs also retain their native clipboard behavior. Toolbar buttons
 * remain eligible for canvas clipboard commands when they hold focus.
 */
import type { ClipboardTarget } from "@chulane/rivto-root";
import { BLOCK_CONTENT_SELECTOR, EDITOR_CONTROL_SELECTOR } from "../../../constants";

/**
 * Checks a normalized clipboard target against the editor's text-host markers.
 *
 * The browser capability checks both the event target and document focus because
 * Firefox can dispatch copy or paste to the body while a label or control holds focus.
 *
 * @param target - Live browser capability, or undefined for a non-clipboard event.
 * @returns True when an independent text control or visual label owns the input.
 * @throws If browser selector evaluation fails.
 */
export function isIndependentClipboardTarget(target: ClipboardTarget | undefined): boolean {
  return target?.isIndependentTextEditing(EDITOR_CONTROL_SELECTOR, BLOCK_CONTENT_SELECTOR) ?? false;
}
