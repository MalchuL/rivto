import { firstUriListEntry, isLocalFileUri } from "../../file/utils/file-input";

/**
 * Loads intrinsic dimensions and rejects undecodable image data.
 *
 * Blob inputs use a temporary object URL that is revoked after loading or failure.
 * Browser-readable URI strings are used directly.
 *
 * @param source - Image bytes or a browser-readable image URL to decode.
 * @returns A promise resolving to intrinsic pixel dimensions.
 * @throws If the browser cannot create an object URL or decode the image.
 */
export function inspectImage(source: string | Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const sourceUrl = source instanceof Blob ? URL.createObjectURL(source) : source;
    const cleanup = () => {
      if (source instanceof Blob) {
        URL.revokeObjectURL(sourceUrl);
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
    image.src = sourceUrl;
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
 * Checks whether clipboard text is a host-resolvable local image path.
 *
 * @param uri - Candidate path or file URI.
 * @returns True for a supported image extension on an absolute local path.
 */
function isLocalImageUri(uri: string): boolean {
  return /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(uri) && isLocalFileUri(uri);
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
  const uri = firstUriListEntry(text);
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
