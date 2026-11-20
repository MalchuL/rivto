import type { ClipboardData } from "../../events/types";

/**
 * Captures synchronous format access for a browser clipboard delivery.
 *
 * The returned capability borrows browser clipboard data and is intended for
 * synchronous use during this event's delivery.
 *
 * @param event - Browser copy, cut, or paste event.
 * @returns Format access, or null if no clipboard data was supplied.
 */
export function captureClipboardData(event: ClipboardEvent): ClipboardData | null {
  const data = event.clipboardData;
  if (!data) {
    return null;
  }
  return {
    /**
     * Reads a format supplied by the current browser clipboard event.
     *
     * @param format - Clipboard format such as `text/plain`.
     * @returns Format text, or an empty string when unavailable.
     * @throws Propagates browser clipboard failures.
     */
    read(format) {
      return data.getData(format);
    },
    /**
     * Requests a format write during the current clipboard event.
     *
     * @param format - Clipboard format to write.
     * @param value - Text representation to store for that format.
     * @returns The browser has received the format write request.
     * @throws Propagates browser clipboard failures.
     */
    write(format, value) {
      data.setData(format, value);
    },
  };
}
