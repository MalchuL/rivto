import type { TextOwnerObserver, TextSelectionQuery } from "../../text/types";

/**
 * Observes occurrence-owned focus and native text endpoints as stable owner IDs.
 *
 * Browser ranges on structural labels can remain after whole-block selection
 * changes. Live carets and text ranges count only inside content hosts, while
 * focus may identify an owner through any focused descendant. The callback runs
 * immediately and on each event so the consumer can reconcile requested pins.
 *
 * @param root - Mounted browser occurrence owning the observed state.
 * @param query - Selectors identifying content, owners, and occurrence boundaries.
 * @param observer - Receives unique focus, anchor, and focus-endpoint owner IDs.
 * @param isAttached - Checks whether the originating Root remains current.
 * @returns Idempotent disposer releasing all installed browser listeners.
 * @throws Propagates setup, inspection, observer, and cleanup failures.
 */
export function observeBrowserTextOwners(
  root: HTMLElement,
  query: TextSelectionQuery,
  observer: TextOwnerObserver,
  isAttached: () => boolean,
): () => void {
  if (!isAttached()) {
    return () => {};
  }
  let active = true;
  const releases: Array<() => void> = [];
  /**
   * Reads the current occurrence state and delivers it only while still attached.
   *
   * @returns The observer receives current owner identities when the Root is active.
   * @throws Propagates browser inspection, selector, and observer failures.
   */
  const notify = () => {
    if (!active || !isAttached()) {
      return;
    }
    const ids = readTextOwnerIds(root, query);
    if (active && isAttached()) {
      observer(ids);
    }
  };
  /**
   * Removes every listener once, retaining all cleanup failures.
   *
   * @returns All installed listener removals have been attempted.
   * @throws AggregateError if any browser listener removal fails.
   */
  const dispose = () => {
    if (!active) {
      return;
    }
    active = false;
    releaseTextOwnerListeners(releases);
  };
  return installTextOwnerListeners(root, notify, dispose, releases);
}

/**
 * Reads focused and selected owner IDs without crossing nested occurrences.
 *
 * Browser ranges on structural labels can remain after whole-block selection
 * changes. Text endpoints count only inside content hosts; focus may identify an
 * owner through any focused descendant. Duplicate IDs retain their first order.
 *
 * @param root - Mounted occurrence owning the inspected state.
 * @param query - Selectors identifying content, owners, and boundaries.
 * @returns Unique focus, anchor, and focus-endpoint owner identities.
 * @throws Propagates browser selection access and selector failures.
 */
function readTextOwnerIds(root: HTMLElement, query: TextSelectionQuery): readonly string[] {
  const document = root.ownerDocument;
  const selection = document.getSelection();
  const focused = document.activeElement;
  const ids = new Set<string>();
  for (const node of [focused, selection?.anchorNode, selection?.focusNode]) {
    const element = node?.nodeType === 1 ? (node as Element) : node?.parentElement;
    if (element?.closest(query.boundarySelector) !== root) {
      continue;
    }
    if (node !== focused && !root.contains(element.closest(query.contentSelector))) {
      continue;
    }
    const id = element.closest(query.ownerSelector)?.getAttribute(query.ownerAttribute);
    if (id) {
      ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Removes every installed listener, retaining all cleanup failures.
 *
 * @param releases - Listener removal operations in installation order.
 * @returns Every removal has been attempted.
 * @throws AggregateError if any browser listener removal fails.
 */
function releaseTextOwnerListeners(releases: readonly (() => void)[]): void {
  const errors: unknown[] = [];
  for (const release of releases) {
    try {
      release();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, "Text owner observation cleanup failed");
  }
}

/**
 * Installs focus and document selection listeners and performs the initial read.
 *
 * Listener removal is prepared before each installation so partial setup is
 * rolled back, including when the initial observer invocation fails.
 *
 * @param root - Mounted occurrence receiving focus listeners.
 * @param notify - Current-state reader invoked by each listener.
 * @param dispose - Idempotent cleanup for all attempted installations.
 * @param releases - Cleanup operations populated as listeners are installed.
 * @returns The disposer for the completed observation.
 * @throws Propagates setup failures and aggregates failed rollback.
 */
function installTextOwnerListeners(
  root: HTMLElement,
  notify: () => void,
  dispose: () => void,
  releases: Array<() => void>,
): () => void {
  const document = root.ownerDocument;
  try {
    releases.push(() => root.removeEventListener("focusin", notify));
    root.addEventListener("focusin", notify);
    releases.push(() => root.removeEventListener("focusout", notify));
    root.addEventListener("focusout", notify);
    releases.push(() => document.removeEventListener("selectionchange", notify));
    document.addEventListener("selectionchange", notify);
    notify();
    return dispose;
  } catch (error) {
    try {
      dispose();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Text owner observation setup failed");
    }
    throw error;
  }
}
