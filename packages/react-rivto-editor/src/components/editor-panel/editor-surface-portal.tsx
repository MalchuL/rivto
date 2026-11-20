import { createPortal } from "react-dom";
import { useContext } from "react";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { useEditorRootContext } from "../../hooks/editor/use-editor-root-context";
import { EditorPortalHostContext } from "./editor-root-context";
import type { EditorSurfacePortalProps } from "./types";

/**
 * Renders surface-owned React content into the mounted surface element.
 *
 * The surface mounting boundary retains the native portal host; content does
 * not render before mount or after the surface is withdrawn.
 *
 * @param props - Content owned by the mounted surface.
 * @param props.children - React content to render into the surface.
 * @returns A portal into the current surface, or null when it is unmounted.
 * @throws If used outside an editor subtree or React rejects the portal host.
 */
export function EditorSurfacePortal({ children }: EditorSurfacePortalProps) {
  const { identity } = useEditorRootContext();
  const element = useContext(EditorPortalHostContext);
  return element && identity === getBrowserElementIdentity(element)
    ? createPortal(children, element)
    : null;
}
