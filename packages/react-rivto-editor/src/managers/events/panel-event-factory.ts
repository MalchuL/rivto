import { BLOCK_CONTENT_SELECTOR, BLOCK_ID_ATTRIBUTE, BLOCK_ID_SELECTOR } from "../../constants";
import type { PanelRegistry } from "../../panels/panel-registry";
import type { DOMEventTarget } from "./dom-types";
import { EditorEvent } from "./editor-event";
import type { AnyEditorEvent } from "./types";

/** Resolves host panel routing and captures selection and DOM context for native delivery. */
export class PanelEventFactory {
  /**
   * Borrows panel routing and lookup without owning roots or panel lifecycles.
   *
   * @param panels - Registry operations needed to resolve the receiving occurrence.
   */
  constructor(
    private readonly panels: Pick<PanelRegistry, "resolveEventRoot" | "getApi" | "getSurfaceType">,
  ) {}

  /**
   * Builds an editor event using the receiving panel's mode, selection, root, and block markers.
   *
   * Routing may activate a panel or update pointer ownership in the registry.
   * Context is captured once for this native listener group and shared by its
   * predicates and handlers. This factory owns no listeners or cleanup resources.
   *
   * @param eventTarget - Native listener target category used to build the editor event.
   * @param raw - Original browser event being dispatched.
   * @param attachedRoot - Surface listener root; omitted for document/window delivery.
   * @returns Editor event, or undefined if routing finds no root with a registered panel API.
   * @throws Propagates panel routing and selection-read failures.
   */
  create(
    eventTarget: DOMEventTarget,
    raw: Event,
    attachedRoot?: HTMLElement,
  ): AnyEditorEvent | undefined {
    const root = this.panels.resolveEventRoot(raw, attachedRoot);
    const reactPanel = root ? this.panels.getApi(root) : undefined;
    if (!root || !reactPanel) {
      return;
    }
    const nativeTarget = raw.target;
    const ElementConstructor = root.ownerDocument.defaultView?.Element;
    const element =
      ElementConstructor && nativeTarget instanceof ElementConstructor ? nativeTarget : null;
    const insideRoot = Boolean(element && (element === root || root.contains(element)));
    const closestBlock = insideRoot
      ? (element?.closest<HTMLElement>(BLOCK_ID_SELECTOR) ?? null)
      : null;
    const closestContent = insideRoot
      ? (element?.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR) ?? null)
      : null;
    const blockElement = closestBlock && root.contains(closestBlock) ? closestBlock : null;
    const contentElement = closestContent && root.contains(closestContent) ? closestContent : null;
    return new EditorEvent({
      raw: raw as never,
      reactPanel,
      root,
      // Route handlers by the receiving surface: core mode may be edgeless
      // while this event belongs to a page embedding of the same document.
      mode: this.panels.getSurfaceType(root),
      selection: reactPanel.selection.get(),
      eventTarget,
      insideRoot,
      blockElement,
      blockId: blockElement?.getAttribute(BLOCK_ID_ATTRIBUTE) ?? undefined,
      contentElement,
    });
  }
}
