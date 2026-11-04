import { useEffect, useState } from "react";
import type { BinaryProvider } from "../../../../attachments";
import type { AttachmentApi } from "../../../../editor/types";

const IMAGE_LOADING_DELAY_MS = 200;

/** Resolved image source and loading feedback for one mounted image view. */
interface ImageSource {
  /** Browser-readable source, or undefined until resolution completes. */
  readonly source: string | undefined;
  /** Resolution or decoding failure text, when present. */
  readonly error: string | undefined;
  /** Whether the delayed loading indicator should be shown. */
  readonly showLoading: boolean;
  /**
   * Reports an image decoding failure from the rendered image element.
   *
   * @param error - Human-readable failure shown by the image view.
   * @returns Publishes the image error.
   */
  readonly setError: (error: string) => void;
}

/**
 * Resolves one image reference and owns object URLs created for its bytes.
 *
 * Changing the provider or URI cancels the previous request and revokes only
 * the object URL created by this hook. A short delay suppresses loading text
 * for sources that resolve promptly.
 *
 * @param attachments - Borrowed binary reference resolution operation.
 * @param provider - Extension provider, or undefined for browser-readable URIs.
 * @param uri - Logical image reference to resolve.
 * @returns Current source, loading and error feedback, and a decoding-error setter.
 */
export function useImageSource(
  attachments: Pick<AttachmentApi, "resolveBinary">,
  provider: BinaryProvider | undefined,
  uri: string,
): ImageSource {
  const [source, setSource] = useState<string>();
  const [error, setError] = useState<string>();
  const [showLoading, setShowLoading] = useState(false);
  // Resolve each reference independently and release its timer, request, and object URL.
  useEffect(() => {
    const abort = new AbortController();
    let objectUrl: string | undefined;
    setSource(undefined);
    setError(undefined);
    setShowLoading(false);
    // Fast local images resolve before a loading label is useful.
    const loadingTimer = window.setTimeout(() => setShowLoading(true), IMAGE_LOADING_DELAY_MS);
    attachments
      .resolveBinary(provider, uri, {
        signal: abort.signal,
      })
      // Publish only the active result and create an object URL for provider bytes.
      .then((resolved) => {
        if (abort.signal.aborted) {
          return;
        }
        window.clearTimeout(loadingTimer);
        if (resolved instanceof Blob) {
          objectUrl = URL.createObjectURL(resolved);
          setSource(objectUrl);
        } else {
          setSource(resolved);
        }
      })
      // Suppress failures from a request cancelled by replacement or unmounting.
      .catch((reason: unknown) => {
        if (!abort.signal.aborted) {
          window.clearTimeout(loadingTimer);
          setError(reason instanceof Error ? reason.message : "Unable to load image");
        }
      });
    // Revoke only the object URL created by this effect.
    return () => {
      abort.abort();
      window.clearTimeout(loadingTimer);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [attachments, provider, uri]);
  return { source, error, showLoading, setError };
}
