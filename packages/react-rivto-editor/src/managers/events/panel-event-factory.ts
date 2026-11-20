import {
  BLOCK_CONTENT_ATTRIBUTE,
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "../../constants";
import type { PanelRegistry } from "../../panels/panel-registry";
import { EditorEvent } from "./editor-event";
import type { AnyEditorEvent, DOMEventTarget, EditorEventInputFields } from "./types";
import { captureKeyboardInput, captureTextInputData } from "@chulane/rivto-root";
import type { BrowserInputMap } from "@chulane/rivto-root";
import type { BrowserListenerCapture } from "@chulane/rivto-root";
import type { PanelPointerOwnership } from "../../panels/types";
import {
  getSurfaceTypeFromAttribute,
  PANEL_SELECTOR,
  PANEL_SURFACE_ATTRIBUTE,
} from "../../panels/panel-dom";

const NORMALIZED_POINTER_EVENTS = new Set([
  "pointerenter",
  "pointerleave",
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
  "lostpointercapture",
  "pointerover",
  "pointerout",
]);
const NORMALIZED_MOUSE_EVENTS = new Set([
  "mousedown",
  "click",
  "dblclick",
  "auxclick",
  "contextmenu",
]);

/** Resolves host panel routing and captures selection and DOM context for native delivery. */
export class PanelEventFactory {
  /**
   * Borrows panel routing and lookup without owning roots or panel lifecycles.
   *
   * @param panels - Registry operations needed to resolve the receiving occurrence.
   */
  constructor(private readonly panels: Pick<PanelRegistry, "resolveEventPanel">) {}

  /**
   * Builds an editor event using the receiving panel's mode, selection, root, and block markers.
   *
   * Routing may activate a panel or update pointer ownership in the registry.
   * Context is captured once for this native listener group and shared by its
   * predicates and handlers. This factory owns no listeners or cleanup resources.
   *
   * @param eventTarget - Native listener target category used to build the editor event.
   * @param type - Browser input name supplied by the listener group.
   * @param rootIdentity - Opaque surface identity; omitted for document/window delivery.
   * @param capture - Root-owned normalizer for the receiving occurrence.
   * @param identity - Root-owned identity of this native dispatch.
   * @param control - Root-owned pointer ownership for this delivery.
   * @returns Editor event, or undefined if routing finds no root with a registered panel API.
   * @throws Propagates panel routing and selection-read failures.
   */
  create(
    eventTarget: DOMEventTarget,
    type: string,
    rootIdentity: object | undefined,
    capture: BrowserListenerCapture,
    identity: object,
    control: PanelPointerOwnership,
  ): AnyEditorEvent | undefined {
    const route = this.panels.resolveEventPanel(type, rootIdentity, capture, identity, control);
    if (!route?.api) {
      return;
    }
    const { api: reactPanel, inputRoot } = route;
    const input = capture(inputRoot);
    if (!input) {
      return;
    }
    const target = input.target;
    const insideRoot = Boolean(target?.isElement?.() && target.belongsToRoot());
    const blockId = insideRoot
      ? target?.ancestorAttributeWithinRoot(BLOCK_ID_SELECTOR, BLOCK_ID_ATTRIBUTE)
      : undefined;
    const contentMarker = insideRoot
      ? target?.ancestorAttributeWithinRoot(BLOCK_CONTENT_SELECTOR, BLOCK_CONTENT_ATTRIBUTE)
      : undefined;
    const contentInput =
      input.type === "input" && contentMarker !== undefined && "captureTextHost" in input
        ? input.captureTextHost?.(BLOCK_CONTENT_SELECTOR, PANEL_SELECTOR)
        : undefined;
    const surface = getSurfaceTypeFromAttribute(inputRoot.readAttribute(PANEL_SURFACE_ATTRIBUTE));
    const mode = surface ?? reactPanel.mode.get();
    if (!route.inputRegistration.isCurrent(inputRoot)) {
      return;
    }
    return new EditorEvent({
      ...this.captureInputFields(input),
      reactPanel,
      inputRoot,
      inputRegistration: route.inputRegistration,
      // Route handlers by the receiving surface: core mode may be edgeless
      // while this event belongs to a page embedding of the same document.
      mode,
      selection: reactPanel.selection.get(),
      eventTarget,
      insideRoot,
      insideBlock: blockId !== undefined,
      blockId,
      insideContent: contentMarker !== undefined,
      contentInput,
    });
  }

  /**
   * Copies the normalized fields supported by this browser input delivery.
   *
   * @param input - Root input captured for the receiving occurrence.
   * @returns Keyboard, clipboard, pointer, mouse, text, and focus fields when applicable.
   * @throws If a browser selector or normalized input query fails.
   */
  private captureInputFields(
    input: BrowserInputMap[keyof BrowserInputMap],
  ): EditorEventInputFields {
    const keyboard = "keyboardTarget" in input ? input : undefined;
    const clipboard = "clipboardTarget" in input ? input : undefined;
    return {
      keyboardInput: keyboard ? captureKeyboardInput(keyboard) : undefined,
      keyboardTarget: keyboard?.keyboardTarget,
      clipboard: clipboard?.clipboard ?? null,
      clipboardTarget: clipboard?.clipboardTarget,
      pointerInput:
        NORMALIZED_POINTER_EVENTS.has(input.type) && "pointerId" in input ? input : undefined,
      mouseInput: NORMALIZED_MOUSE_EVENTS.has(input.type) && "button" in input ? input : undefined,
      textInput:
        (input.type === "input" || input.type === "beforeinput") && "inputType" in input
          ? captureTextInputData(input)
          : undefined,
      readContentText:
        input.type === "beforeinput" && "captureTargetText" in input
          ? input.captureTargetText(BLOCK_CONTENT_SELECTOR)
          : undefined,
      isFocusWithinBlock:
        input.type === "focusout" && "captureRelatedTargetWithinAncestor" in input
          ? input.captureRelatedTargetWithinAncestor(BLOCK_ID_SELECTOR)
          : undefined,
    };
  }
}
