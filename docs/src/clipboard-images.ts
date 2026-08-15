/**
 * Extracts browser-provided image blobs from clipboard and drag data.
 * Files may appear only in `items` or only in `files` depending on the browser,
 * operating system, and whether pixels or a filesystem entry was copied.
 */

interface ClipboardFileItem {
  readonly kind: string;
  getAsFile(): File | null;
}

export interface ClipboardImageData {
  readonly files: ArrayLike<File>;
  readonly items: ArrayLike<ClipboardFileItem>;
}

/**
 * Collects unique supported image files from both DataTransfer representations.
 *
 * @param data Clipboard or drop data supplied by the browser.
 * @returns Image files in browser-provided order.
 */
export function extractClipboardImages(data: ClipboardImageData | null): File[] {
  if (!data) {
    return [];
  }
  const images: File[] = [];
  const seen = new Set<File>();
  for (const item of Array.from(data.items)) {
    const file = item.kind === "file" ? item.getAsFile() : null;
    appendImage(file, images, seen);
  }
  for (const file of Array.from(data.files)) {
    appendImage(file, images, seen);
  }
  return images;
}

/**
 * Appends one previously unseen browser image file.
 *
 * @param file Candidate file or null item conversion.
 * @param images Ordered image result.
 * @param seen File identities already included.
 * @returns Nothing.
 */
function appendImage(file: File | null, images: File[], seen: Set<File>): void {
  if (file?.type.startsWith("image/") && !seen.has(file)) {
    seen.add(file);
    images.push(file);
  }
}
