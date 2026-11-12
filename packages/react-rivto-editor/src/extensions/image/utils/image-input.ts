import { firstUriListEntry, isLocalFileUri } from "../../file/utils/file-input";

/** Image filename extensions accepted for local references and browser files. */
const IMAGE_FILE_EXTENSION = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;

/**
 * Loads intrinsic dimensions and rejects undecodable image data.
 *
 * Blob inputs use a temporary object URL that is revoked after loading, failure, or cancellation.
 * Browser-readable URI strings are used directly.
 *
 * @param source - Image bytes or a browser-readable image URL to decode.
 * @param signal - Cancels pending decoding and releases its temporary resources.
 * @returns A promise resolving to intrinsic pixel dimensions.
 * @throws If cancelled or the browser cannot create an object URL or decode the image.
 */
export function inspectImage(
  source: string | Blob,
  signal: AbortSignal,
): Promise<{
  /** Decoded image width in pixels. */
  width: number;
  /** Decoded image height in pixels. */
  height: number;
}> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const image = new Image();
    const sourceUrl = source instanceof Blob ? URL.createObjectURL(source) : source;
    // Revoke Blob URLs created here; string sources remain borrowed.
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      image.onload = null;
      image.onerror = null;
      if (source instanceof Blob) {
        URL.revokeObjectURL(sourceUrl);
      }
    };
    const abort = () => {
      cleanup();
      image.removeAttribute("src");
      reject(signal.reason);
    };
    // Release the temporary URL after the browser decodes the image dimensions.
    image.onload = () => {
      cleanup();
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    // Release the same resource when decoding fails.
    image.onerror = () => {
      cleanup();
      reject(new TypeError("File or URI is not a decodable image"));
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      image.src = sourceUrl;
    } catch (error) {
      cleanup();
      reject(error);
    }
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
    (/^(?:application\/octet-stream)?$/i.test(file.type) && IMAGE_FILE_EXTENSION.test(file.name))
  );
}

/**
 * Checks whether clipboard text is a host-resolvable local image path.
 *
 * @param uri - Candidate path or file URI.
 * @returns True for a supported image extension on an absolute local path.
 */
function isLocalImageUri(uri: string): boolean {
  return IMAGE_FILE_EXTENSION.test(uri) && isLocalFileUri(uri);
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
 * Selects image URIs from transferable HTML or plain data.
 *
 * HTML must contain images and no other text, or one link whose text and
 * target are the same image URL. Plain text and URI lists must contain only
 * supported image references. Files take precedence over URIs.
 *
 * @param data - Browser clipboard or drag data, if available.
 * @returns Image URIs and alternative text in source order, or an empty array
 * when the payload is not image-only.
 */
export function findTransferredImageUris(data: DataTransfer | null): {
  /** Image URI extracted from the transfer. */
  uri: string;
  /** Alternative text supplied by the transfer, or an empty string. */
  alt: string;
}[] {
  if (!data || data.files.length) {
    return [];
  }
  const html = data.getData("text/html").trim();
  if (html) {
    const document = new DOMParser().parseFromString(html, "text/html");
    const images = [...document.body.querySelectorAll("img")];
    const remaining = document.body.cloneNode(true) as HTMLElement;
    // Remove images from the clone to detect any remaining text.
    remaining.querySelectorAll("img").forEach((image) => image.remove());
    if (images.length > 0 && !remaining.textContent?.trim()) {
      return images.map((image) => ({ uri: image.src, alt: image.alt }));
    }
    const links = [...document.body.querySelectorAll("a")];
    const uri =
      findImageUri(data.getData("text/uri-list")) ?? findImageUri(data.getData("text/plain"));
    if (
      uri &&
      images.length === 0 &&
      links.length === 1 &&
      links[0]!.href === uri &&
      document.body.textContent?.trim() === uri &&
      IMAGE_FILE_EXTENSION.test(links[0]!.pathname)
    ) {
      return [{ uri, alt: "" }];
    }
    return [];
  }
  const text = data.getData("text/uri-list") || data.getData("text/plain");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const uris = lines.map(findImageUri);
  return uris.every((uri) => uri !== undefined) ? uris.map((uri) => ({ uri, alt: "" })) : [];
}
