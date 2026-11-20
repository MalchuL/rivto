import { createPortal } from "react-dom";
import { useContext } from "react";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { PAGE_END_SLOT_SELECTOR } from "../../../constants";
import { EditorPortalHostContext } from "../../../components/editor-panel/editor-root-context";
import { useEditorRootContext } from "../../../hooks/editor/use-editor-root-context";
import type { PageEndPortalProps } from "../types";

/**
 * Renders page-end content into the current Page occurrence's insertion slot.
 *
 * The portal mounts only while the surface and its own end slot exist. A slot
 * belonging to a nested editor is excluded; later remounts use their own slot.
 *
 * @param props - Page-end content owned by the host extension.
 * @param props.children - Controls displayed inside the Page-owned end slot.
 * @returns The mounted portal, or null when the occurrence has no end slot.
 * @throws If rendered outside an EditorPanel or EditorEmbed subtree.
 */
export function PageEndPortal({ children }: PageEndPortalProps) {
  const { identity, mountedRoot } = useEditorRootContext();
  const element = useContext(EditorPortalHostContext);
  if (
    !element ||
    !identity ||
    !mountedRoot?.isAttached() ||
    identity !== getBrowserElementIdentity(element) ||
    mountedRoot.getElementIdentity?.() !== identity
  ) {
    return null;
  }
  const slot = [...element.querySelectorAll<HTMLElement>(PAGE_END_SLOT_SELECTOR)].find(
    (candidate) => {
      const owner = candidate.closest("[data-rivto-block-editor]");
      if (owner && owner !== element) {
        return false;
      }
      const slotIdentity = getBrowserElementIdentity(candidate);
      const region = mountedRoot.captureRegionByIdentity(slotIdentity);
      return (
        region?.getIdentity() === slotIdentity &&
        mountedRoot.isAttached() &&
        mountedRoot.getElementIdentity?.() === identity &&
        (candidate.closest("[data-rivto-block-editor]") ?? element) === element
      );
    },
  );
  return slot ? createPortal(children, slot) : null;
}
