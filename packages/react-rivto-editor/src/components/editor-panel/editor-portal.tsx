import { createPortal } from "react-dom";
import { useContext } from "react";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { useEditorRootContext } from "../../hooks/editor/use-editor-root-context";
import { EditorPortalHostContext } from "./editor-root-context";
import { useReactPanel } from "../../hooks/editor/use-react-panel";
import type { EditorPortalProps } from "./types";

/**
 * Renders occurrence-owned content into the matching surface's document body.
 *
 * The mounting boundary resolves the native portal host. A stale registration
 * or a surface being replaced cannot render into a later occurrence's document.
 *
 * @param props - Portal content and the input registration that owns it.
 * @param props.children - Content to render into the occurrence's document body.
 * @param props.inputRoot - Mounted Root captured by the content.
 * @param props.inputRegistration - Routing lifetime captured with that Root.
 * @returns A portal when the registration and mounted surface match, otherwise null.
 * @throws If used outside an editor subtree, an attachment check fails, or React rejects the portal host.
 */
export function EditorPortal({ children, inputRoot, inputRegistration }: EditorPortalProps) {
  const { identity: surfaceIdentity } = useEditorRootContext();
  const element = useContext(EditorPortalHostContext);
  const panel = useReactPanel();
  if (!element || panel.inputRoot !== inputRoot || !inputRegistration.isCurrent(inputRoot)) {
    return null;
  }
  const identity = inputRoot.getElementIdentity?.();
  if (
    !identity ||
    identity !== surfaceIdentity ||
    identity !== getBrowserElementIdentity(element) ||
    !inputRegistration.isCurrent(inputRoot) ||
    panel.inputRoot !== inputRoot
  ) {
    return null;
  }
  return createPortal(children, element.ownerDocument.body);
}
