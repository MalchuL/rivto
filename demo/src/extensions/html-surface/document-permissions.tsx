import { useCallback, useState, useSyncExternalStore } from "react";
import {
  createLocalHtmlPermissions,
  type HtmlPermissionDocument,
  type HtmlPermissions,
} from "@chulane/rivto-react";

/**
 * Names the host's document-wide override independently of individual grants.
 *
 * @param id - Stable document identity.
 * @returns Browser storage key for the current override format.
 */
function documentKey(id: string): string {
  return "rivto-demo:unsafe-html:v1:" + encodeURIComponent(id);
}

/**
 * Reads the demo's override directly so queued requests see revocations immediately.
 *
 * @param id - Document being checked.
 * @returns True only for an explicitly enabled override.
 */
function allowsAll(id: string): boolean {
  try {
    return localStorage.getItem(documentKey(id)) === "true";
  } catch {
    return false;
  }
}

/**
 * Observes same-window and cross-tab changes to the document toggle.
 *
 * @param id - Document to observe.
 * @param notify - Requests a fresh read of the policy.
 * @returns Disposer for the window subscription.
 */
function subscribeDocument(id: string, notify: () => void): () => void {
  const changed = (event: StorageEvent) => {
    if (event.key === documentKey(id) || event.key === null) {
      notify();
    }
  };
  window.addEventListener("storage", changed);
  return () => window.removeEventListener("storage", changed);
}

/**
 * Adds the demo's document override to the package's individual permissions.
 *
 * @param document - Document used for both policy levels.
 * @returns An installation-owned provider that restores block decisions when the override is off.
 */
export function createDemoHtmlPermissions(document: HtmlPermissionDocument): HtmlPermissions {
  const blocks = createLocalHtmlPermissions(document);
  return {
    write: (request, allow) => blocks.write(request, allow),
    dispose: () => blocks.dispose(),
    /** @inheritdoc */
    read: (request) =>
      request.permission === "editorAccess" && allowsAll(document.id)
        ? "document"
        : blocks.read(request),
    /** @inheritdoc */
    subscribe: (notify) => {
      const releaseBlock = blocks.subscribe(notify);
      const releaseDocument = subscribeDocument(document.id, notify);
      return () => {
        releaseBlock();
        releaseDocument();
      };
    },
  };
}

/**
 * Toggles editor API access for all unsafe HTML in the active demo document.
 *
 * @param props - Active document identity.
 * @param props.documentId - Stable key shared with the extension installation.
 * @returns The checkbox reflecting the live document policy.
 */
export function DocumentHtmlPermissionToggle({ documentId }: { documentId: string }) {
  const subscribe = useCallback(
    (notify: () => void) => subscribeDocument(documentId, notify),
    [documentId],
  );
  const [error, setError] = useState(false);
  const checked = useSyncExternalStore(
    subscribe,
    () => allowsAll(documentId),
    () => false,
  );
  return (
    <label>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          try {
            const key = documentKey(documentId);
            if (event.currentTarget.checked) {
              localStorage.setItem(key, "true");
            } else {
              localStorage.removeItem(key);
            }
            window.dispatchEvent(new StorageEvent("storage", { key, storageArea: localStorage }));
            setError(false);
          } catch {
            setError(true);
          }
        }}
      />
      Allow editor access for all unsafe HTML
      {error && (
        <span role="alert">Could not save the document permission in browser storage.</span>
      )}
    </label>
  );
}
