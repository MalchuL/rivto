import type { ClipboardWriteFormats } from "../../events/types";

/**
 * Writes formats through the captured document's browser clipboard.
 *
 * The asynchronous path uses only the requested subset. The copy-command
 * fallback supplies every format and always releases its temporary listener.
 * Rejected asynchronous writes are propagated without retrying the fallback.
 *
 * @param document - Document owning the occurrence that initiated the write.
 * @param input - String values and asynchronous format selection.
 * @returns A promise resolving after the browser accepts the clipboard data.
 * @throws If the browser rejects the write or the fallback cannot copy data.
 */
export async function writeClipboard(
  document: Document,
  input: ClipboardWriteFormats,
): Promise<void> {
  const view = document.defaultView;
  if (view?.navigator.clipboard?.write && typeof view.ClipboardItem !== "undefined") {
    const data: Record<string, Blob> = {};
    for (const format of input.asynchronousFormats) {
      data[format] = new view.Blob([input.formats[format]], { type: format });
    }
    await view.navigator.clipboard.write([new view.ClipboardItem(data)]);
    return;
  }
  let copied = false;
  /**
   * Supplies clipboard values during the fallback's synthetic copy event.
   *
   * @param event - Copy event whose default action and other listeners are suppressed.
   * @returns Available clipboard data is filled and successful access is recorded.
   */
  const listener = (event: ClipboardEvent): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
    for (const [format, value] of Object.entries(input.formats)) {
      event.clipboardData?.setData(format, value);
    }
    copied = Boolean(event.clipboardData);
  };
  document.addEventListener("copy", listener, true);
  try {
    if (!document.execCommand("copy") || !copied) {
      throw new Error("Unable to write to the clipboard");
    }
  } finally {
    document.removeEventListener("copy", listener, true);
  }
}
