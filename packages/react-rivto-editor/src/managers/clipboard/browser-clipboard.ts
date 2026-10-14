import { RIVTO_CLIPBOARD_MIME, type ClipboardBundle } from "@chulane/rivto";
import type { ReactEditorApi } from "../../editor/types";

/**
 * Formats a bundle for browser clipboard writes without changing the document.
 *
 * The registered formatters supply plain text and HTML. The HTML is wrapped in a
 * `data-rivto-clipboard` attribute containing URI-encoded bundle JSON, allowing
 * Rivto paste to recover structure when custom MIME data is unavailable.
 *
 * @param editor - Runtime whose clipboard formatters serialize the bundle.
 * @param bundle - Clipboard snapshot to serialize; it is not modified.
 * @returns Plain text, wrapped HTML, and the unencoded structured JSON string.
 * @throws If a registered formatter or JSON serialization fails.
 */
export function browserClipboardFormats(editor: ReactEditorApi, bundle: ClipboardBundle) {
  const portable = editor.clipboardFormats.formatBundle(bundle);
  const structured = JSON.stringify(bundle);
  return {
    ...portable,
    structured,
    html: `<div data-rivto-clipboard="${encodeURIComponent(structured)}">${portable.html}</div>`,
  };
}

/**
 * Extracts the first Rivto clipboard envelope from browser-supplied HTML.
 *
 * Only the attribute's URI encoding is decoded here. The result is not parsed
 * or validated as a clipboard bundle; the paste pipeline owns that validation.
 * Missing, empty, or invalidly encoded attributes allow ordinary paste fallback.
 *
 * @param html - Clipboard HTML parsed into a detached DOM document.
 * @returns Decoded structured text, or undefined when no decodable envelope exists.
 */
export function readClipboardEnvelope(html: string): string | undefined {
  const value = new DOMParser()
    .parseFromString(html, "text/html")
    .querySelector("[data-rivto-clipboard]")
    ?.getAttribute("data-rivto-clipboard");
  try {
    return value ? decodeURIComponent(value) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Writes a detached clipboard bundle using browser clipboard capabilities.
 *
 * Uses `navigator.clipboard.write` with plain text and envelope-bearing HTML when
 * available. Otherwise, a temporary copy-event listener writes those formats and
 * the custom Rivto MIME through `execCommand("copy")`; the listener is always
 * removed. A rejected asynchronous write propagates without retrying the fallback.
 * This helper never deletes or otherwise mutates source document content.
 *
 * @param editor - Runtime providing clipboard formatters for the bundle.
 * @param bundle - Detached block or element data to place on the system clipboard.
 * @returns A promise resolving after the browser write succeeds.
 * @throws If formatting fails, the browser rejects the write, or the fallback
 * cannot obtain a copy event with writable clipboard data.
 */
export async function writeClipboardBundle(
  editor: ReactEditorApi,
  bundle: ClipboardBundle,
): Promise<void> {
  const formats = browserClipboardFormats(editor, bundle);
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([formats.plain], { type: "text/plain" }),
        "text/html": new Blob([formats.html], { type: "text/html" }),
      }),
    ]);
    return;
  }
  let copied = false;
  /**
   * Supplies all clipboard formats during the fallback's synthetic copy command.
   *
   * @param event - Copy event whose default and other listeners are suppressed.
   * @returns No value after writing available clipboard data and recording success.
   */
  const listener = (event: ClipboardEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.clipboardData?.setData(RIVTO_CLIPBOARD_MIME, formats.structured);
    event.clipboardData?.setData("text/html", formats.html);
    event.clipboardData?.setData("text/plain", formats.plain);
    copied = Boolean(event.clipboardData);
  };
  document.addEventListener("copy", listener, true);
  try {
    if (!document.execCommand("copy") || !copied) {
      throw new Error("Unable to write blocks to the clipboard");
    }
  } finally {
    document.removeEventListener("copy", listener, true);
  }
}
