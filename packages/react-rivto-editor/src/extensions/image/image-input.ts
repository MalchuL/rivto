/**
 * Loads intrinsic dimensions and rejects undecodable image data.
 *
 * When requested, the source object URL is revoked after loading or failure.
 *
 * @param source - Browser-readable image URL to decode.
 * @param revoke - Whether to revoke the source object URL after the attempt; defaults to false.
 * @returns A promise resolving to intrinsic pixel dimensions.
 * @throws If the browser cannot decode the image.
 */
export function inspectImage(
  source: string,
  revoke = false,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      if (revoke) {
        URL.revokeObjectURL(source);
      }
    };
    image.onload = () => {
      cleanup();
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      cleanup();
      reject(new TypeError("File or URI is not a decodable image"));
    };
    image.src = source;
  });
}

/**
 * Checks whether a transferable file is plausibly an image before decode validation.
 *
 * Recognized extensions are accepted for empty or generic binary MIME types.
 *
 * @param file - Browser-provided file and metadata.
 * @returns True when the MIME type or filename indicates an image.
 */
export function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    (/^(?:application\/octet-stream)?$/i.test(file.type) &&
      /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(file.name))
  );
}

/**
 * Reads image files from either clipboard/drag file lists or item-only browser payloads.
 *
 * The item list is consulted only when the file list contains no matching images.
 *
 * @param data - Browser clipboard or drag data, if available.
 * @returns Matching image files in browser-provided order.
 */
export function getTransferredImageFiles(data: DataTransfer | null): File[] {
  if (!data) {
    return [];
  }
  const files = [...data.files].filter(isImageFile);
  if (files.length) {
    return files;
  }
  return [...data.items]
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file && isImageFile(file)));
}

/**
 * Checks whether clipboard text is a host-resolvable local image path.
 *
 * @param uri - Candidate path or file URI.
 * @returns True for a supported image extension on an absolute local path.
 */
function isLocalImageUri(uri: string): boolean {
  return (
    /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(uri) &&
    (/^file:\/\//i.test(uri) || /^\//.test(uri) || /^[a-z]:[\\/]/i.test(uri))
  );
}

/**
 * Extracts one supported remote or local image URI from clipboard text.
 *
 * URI lists may contain comments; only the first non-comment line is considered.
 *
 * @param text - URI-list or plain clipboard text.
 * @returns The supported URI, or undefined when no supported URI is present.
 */
export function findImageUri(text: string): string | undefined {
  const uri = text
    .trim()
    .split(/\r?\n/)
    .find((line) => line && !line.startsWith("#"));
  return uri && (/^https?:\/\//i.test(uri) || isLocalImageUri(uri)) ? uri : undefined;
}

/**
 * Selects an image URI from transferable HTML or plain data.
 *
 * HTML must contain one image and no other text; files take precedence over URIs.
 *
 * @param data - Browser clipboard or drag data, if available.
 * @returns Image URI and alternative text, or undefined when the payload is not image-only.
 */
export function findTransferredImageUri(
  data: DataTransfer | null,
): { uri: string; alt: string } | undefined {
  if (!data || data.files.length) {
    return undefined;
  }
  const html = data.getData("text/html").trim();
  if (html) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const images = [...document.body.querySelectorAll("img")];
    const remaining = document.body.cloneNode(true) as HTMLElement;
    remaining.querySelectorAll("img").forEach((image) => image.remove());
    if (images.length === 1 && !remaining.textContent?.trim()) {
      return { uri: images[0]!.src, alt: images[0]!.alt };
    }
    return undefined;
  }
  const uri =
    findImageUri(data.getData("text/uri-list")) ?? findImageUri(data.getData("text/plain"));
  return uri ? { uri, alt: "" } : undefined;
}
