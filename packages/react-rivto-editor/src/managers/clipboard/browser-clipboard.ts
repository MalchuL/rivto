import { RIVTO_CLIPBOARD_MIME, type ClipboardBundle } from "@chulane/rivto";
import type { ReactEditorApi } from "../../editor/types";

/** Produces browser flavors, including a portable HTML envelope for browsers dropping custom MIME. */
export function browserClipboardFormats(editor: ReactEditorApi, bundle: ClipboardBundle) {
  const portable = editor.clipboardFormats.formatBundle(bundle);
  const structured = JSON.stringify(bundle);
  return {
    ...portable,
    structured,
    html: `<div data-rivto-clipboard="${encodeURIComponent(structured)}">${portable.html}</div>`,
  };
}

/** Reads a structured envelope; malformed data is ignored and ordinary paste handles the HTML. */
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

/** Writes detached blocks to the system clipboard; rejection never mutates the document. */
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
