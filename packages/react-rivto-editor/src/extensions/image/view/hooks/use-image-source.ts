import { useEffect, useState } from "react";
import type { BinaryProvider } from "../../../../attachments";
import type { AttachmentApi } from "../../../../editor/types";
import type { ReactPanelApi } from "../../../../panels/types";

const IMAGE_LOADING_DELAY_MS = 200;

/** Resolved image source and loading feedback for one mounted image view. */
interface ImageSource {
  readonly source: string | undefined;
  readonly error: string | undefined;
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
 * @param panel - Receiving panel used to capture the current surface mode.
 * @param provider - Extension provider, or undefined for browser-readable URIs.
 * @param uri - Logical image reference to resolve.
 * @returns Current source, loading and error feedback, and a decoding-error setter.
 */
export function useImageSource(
  attachments: Pick<AttachmentApi, "resolveBinary">,
  panel: Pick<ReactPanelApi, "getSurfaceType">,
  provider: BinaryProvider | undefined,
  uri: string,
): ImageSource {
  const [source, setSource] = useState<string>();
  const [error, setError] = useState<string>();
  const [showLoading, setShowLoading] = useState(false);
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
        mode: panel.getSurfaceType(),
      })
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
      .catch((reason: unknown) => {
        if (!abort.signal.aborted) {
          window.clearTimeout(loadingTimer);
          setError(reason instanceof Error ? reason.message : "Unable to load image");
        }
      });
    return () => {
      abort.abort();
      window.clearTimeout(loadingTimer);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [attachments, panel, provider, uri]);
  return { source, error, showLoading, setError };
}
