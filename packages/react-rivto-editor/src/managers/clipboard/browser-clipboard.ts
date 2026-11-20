import { RIVTO_CLIPBOARD_MIME, type ClipboardBundle } from "@chulane/rivto";
import type { ClipboardFormattingEditor } from "./types";
import type { InputRoot } from "@chulane/rivto-root";
import { readHtmlAttribute } from "@chulane/rivto-root/browser";

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
export function browserClipboardFormats(
  editor: ClipboardFormattingEditor,
  bundle: ClipboardBundle,
) {
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
  const value = readHtmlAttribute(html, "[data-rivto-clipboard]", "data-rivto-clipboard");
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
 * @param inputRoot - Current occurrence responsible for browser clipboard access.
 * @returns A promise resolving after the browser write succeeds.
 * @throws If formatting fails, the browser rejects the write, or the fallback
 * cannot obtain a copy event with writable clipboard data.
 */
export async function writeClipboardBundle(
  editor: ClipboardFormattingEditor,
  bundle: ClipboardBundle,
  inputRoot: Pick<InputRoot, "writeClipboard">,
): Promise<void> {
  const formats = browserClipboardFormats(editor, bundle);
  await inputRoot.writeClipboard({
    formats: {
      [RIVTO_CLIPBOARD_MIME]: formats.structured,
      "text/html": formats.html,
      "text/plain": formats.plain,
    },
    asynchronousFormats: ["text/plain", "text/html"],
  });
}
