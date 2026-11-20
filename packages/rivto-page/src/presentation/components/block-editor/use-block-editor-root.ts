import { useEffect, useState } from "react";
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { BlockEditorRootState, BlockEditorViewApi } from "./types";

/**
 * Borrows a matching host Root or owns a Root for a standalone Page view.
 *
 * The host keeps its attachment. A Root created by this hook is detached after
 * the Page controller releases it, including when either cleanup fails.
 *
 * @param editor - Controller attached to the view without being destroyed by it.
 * @param element - Mounted view element, or null before mount and after removal.
 * @returns The matching occurrence capability once attachment has completed.
 * @throws Propagates attachment and cleanup failures.
 */
export function useBlockEditorRoot(
  editor: BlockEditorViewApi,
  element: HTMLElement | null,
): BlockEditorViewApi["inputRoot"] {
  const [state, setState] = useState<BlockEditorRootState>();
  useEffect(() => {
    if (!element) {
      return;
    }
    const existing = editor.inputRoot;
    if (existing?.getElementIdentity?.() === getBrowserElementIdentity(element)) {
      setState({ editor, inputRoot: existing });
      return;
    }
    const inputRoot = new BrowserInputRoot(element);
    let detach: () => void;
    try {
      detach = editor.attach(inputRoot);
    } catch (error) {
      try {
        inputRoot.detach();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Block editor attachment rollback failed");
      }
      throw error;
    }
    setState({ editor, inputRoot });
    return () => releaseOwnedRoot(detach, inputRoot);
  }, [editor, element]);
  if (!element || state?.editor !== editor) {
    return undefined;
  }
  return state.inputRoot?.getElementIdentity?.() === getBrowserElementIdentity(element)
    ? state.inputRoot
    : undefined;
}

/**
 * Releases the Page attachment and its view-owned Root even if cleanup fails.
 *
 * @param detach - Disposer for the controller's borrowed attachment.
 * @param inputRoot - Root created by the standalone view.
 * @returns Both resources have been offered cleanup.
 * @throws Propagates one cleanup failure or aggregates multiple failures.
 */
function releaseOwnedRoot(detach: () => void, inputRoot: BrowserInputRoot): void {
  const errors: unknown[] = [];
  try {
    detach();
  } catch (error) {
    errors.push(error);
  }
  try {
    inputRoot.detach();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Block editor attachment cleanup failed");
  }
}
