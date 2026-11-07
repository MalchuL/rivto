import type { FileReference, PreparedFile } from "../../../attachments";
import type { FileDestination } from "../../../attachments/ingestion/file-destination";
import { serializeImageMacro } from "../macro/image-macro";
import { MIN_IMAGE_SIZE } from "../image-constants";

/** Persisted native type used by standalone image blocks. */
export const IMAGE_BLOCK_TYPE = "image";
/** Maximum initial canvas image width, in pixels. */
const MAX_INITIAL_IMAGE_WIDTH = 640;
/** Maximum initial canvas image height, in pixels. */
const MAX_INITIAL_IMAGE_HEIGHT = 480;

/** Stored image reference and dimensions read from the image data. */
export interface ImageAsset extends FileReference {
  /** Alternative text used when presenting the image. */
  readonly alt: string;
  /** Decoded image width in pixels. */
  readonly intrinsicWidth: number;
  /** Decoded image height in pixels. */
  readonly intrinsicHeight: number;
}

/**
 * Builds the requested representation of an inspected image.
 *
 * @param asset - Stored reference and decoded intrinsic dimensions.
 * @param destination - Requested placement of the image.
 * @returns The representation for that placement using the shared initial canvas size.
 */
export function prepareImageAsset(
  asset: ImageAsset,
  destination: FileDestination["kind"],
): PreparedFile {
  if (destination === "inline") {
    return { kind: "inline", content: serializeImageMacro({ uri: asset.uri, alt: asset.alt }) };
  }
  if (destination === "block") {
    return { kind: "block", type: IMAGE_BLOCK_TYPE, props: { ...asset } };
  }
  const scale = Math.min(
    1,
    MAX_INITIAL_IMAGE_WIDTH / asset.intrinsicWidth,
    MAX_INITIAL_IMAGE_HEIGHT / asset.intrinsicHeight,
  );
  return {
    kind: "element",
    type: "image",
    props: { ...asset, rotation: 0 },
    width: Math.max(MIN_IMAGE_SIZE, Math.round(asset.intrinsicWidth * scale)),
    height: Math.max(MIN_IMAGE_SIZE, Math.round(asset.intrinsicHeight * scale)),
  };
}
