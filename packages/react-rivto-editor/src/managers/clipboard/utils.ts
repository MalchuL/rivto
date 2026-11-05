/**
 * Returns the exact or generic binary MIME type accepted by a browser clipboard.
 *
 * Browsers predating `ClipboardItem.supports` are allowed to attempt the exact
 * type; the eventual write remains the authoritative capability check.
 *
 * @param view - Window owning the editor surface.
 * @param mimeType - Exact binary MIME type requested by the extension.
 * @returns Accepted browser MIME type, or undefined when binary writing is unavailable.
 */
export function browserClipboardType(
  view: (Window & typeof globalThis) | null | undefined,
  mimeType: string,
): string | undefined {
  const ClipboardItemConstructor = view?.ClipboardItem;
  const clipboard = view?.navigator.clipboard;
  if (!ClipboardItemConstructor || !clipboard?.write) {
    return undefined;
  }
  if (!ClipboardItemConstructor.supports) {
    return mimeType;
  }
  if (ClipboardItemConstructor.supports(mimeType)) {
    return mimeType;
  }
  return ClipboardItemConstructor.supports("application/octet-stream")
    ? "application/octet-stream"
    : undefined;
}
