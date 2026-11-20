import type {
  BrowserInputMap,
  ClipboardInput,
  InputEvent,
  InputRegion,
  InputTarget,
  KeyInput,
  MouseInput,
  PointerInput,
  TextInput,
  WheelInput,
} from "../../events/types";
import { captureTextInputData } from "../../events/text-input";
import { captureClipboardData } from "./capture-clipboard-data";
import { captureClipboardTarget } from "./capture-clipboard-target";
import { captureKeyboardTarget } from "../keyboard/capture-keyboard-target";
import type { InputRootOwnerCheck } from "./types";
import { BrowserInputRegion, rememberInputTarget } from "./input-region";
import { BrowserAutoScroll } from "../pointer/browser-auto-scroll";
import { capturePointer } from "./pointer-capture";
import { BrowserInputRoot } from "./browser-input-root";
import { inputElementIdentity } from "./input-element-identity";
import { captureTargetPointer } from "./target-pointer-capture";
import { captureBrowserTextHost } from "../text/browser-text-host";
import { captureBrowserInputHit } from "./input-hit";
import type { TextHost } from "../../text/types";

/**
 * Captures target ancestry capabilities without exposing the native element.
 *
 * @param source - Native target received by the browser adapter, or null.
 * @param root - Attached root used to resolve the target's browser realm.
 * @param isDelivering - Checks whether the originating synchronous delivery is active.
 * @returns Target capabilities, or null when the target has no element ancestry.
 */
function inputTarget(
  source: EventTarget | null,
  root: HTMLElement,
  isDelivering: () => boolean = () => false,
): InputTarget | null {
  const ElementType = root.ownerDocument.defaultView?.Element;
  const NodeType = root.ownerDocument.defaultView?.Node;
  let target: Element | null = null;
  if (ElementType && source instanceof ElementType) {
    target = source;
  } else if (NodeType && source instanceof NodeType) {
    target = source.parentElement;
  }
  if (!target) {
    return null;
  }
  const result: InputTarget = {
    /**
     * Captures the identity of the nearest matching ancestor.
     *
     * @param selector - Selector identifying the ancestor.
     * @returns Opaque element identity, or undefined when no match exists.
     * @throws If the browser rejects the selector.
     */
    getNearestAncestorIdentity(selector) {
      const ancestor = target.closest(selector);
      return ancestor ? inputElementIdentity(ancestor) : undefined;
    },
    /**
     * Compares the closest matching ancestor with an attached browser occurrence.
     *
     * @param selector - Selector identifying occurrence boundaries.
     * @param candidate - Borrowed occurrence to compare.
     * @returns Whether its element is the closest match and remains attached.
     * @throws If the selector or owner check fails.
     */
    isNearestAncestorRoot(selector, candidate) {
      const ancestor = target.closest(selector);
      return Boolean(
        ancestor &&
        candidate instanceof BrowserInputRoot &&
        candidate.isAttached() &&
        candidate.isForElement(ancestor),
      );
    },
    /**
     * Distinguishes an original element target from a text target's parent.
     *
     * @returns Whether the source is an element in the occurrence's browser realm.
     */
    isElement() {
      return Boolean(ElementType && source instanceof ElementType);
    },
    /**
     * Captures the original connected element while this input is being delivered.
     *
     * @returns Opaque hit, or undefined for text, disconnected, or expired targets.
     * @throws Propagates browser target and delivery-check failures.
     */
    captureTargetHit() {
      if (
        !isDelivering() ||
        !ElementType ||
        !(source instanceof ElementType) ||
        !source.isConnected ||
        !isDelivering() ||
        !source.isConnected
      ) {
        return undefined;
      }
      return captureBrowserInputHit(source);
    },
    /**
     * Captures the original connected target when the pointer is not captured.
     *
     * @param pointerId - Pointer whose live capture state is inspected.
     * @returns Opaque hit, or undefined for a disconnected, text, or captured target.
     * @throws Propagates browser pointer-capture inspection failures.
     */
    captureUncapturedPointerHit(pointerId) {
      if (
        !isDelivering() ||
        !ElementType ||
        !(source instanceof ElementType) ||
        !source.isConnected ||
        source.hasPointerCapture?.(pointerId) ||
        !source.isConnected ||
        !isDelivering() ||
        !source.isConnected
      ) {
        return undefined;
      }
      return captureBrowserInputHit(source);
    },
    /**
     * Compares the original target with the receiving root.
     *
     * @returns True only when the target is the root itself.
     */
    isRoot() {
      return source === root;
    },
    /**
     * Checks root containment without crossing a matching nested boundary.
     *
     * @param boundarySelector - Optional selector identifying occurrence roots.
     * @returns Whether this target belongs directly to the attached occurrence.
     * @throws If the browser rejects an evaluated selector.
     */
    belongsToRoot(boundarySelector) {
      if (!root.contains(target)) {
        return false;
      }
      const boundary = boundarySelector ? target.closest(boundarySelector) : null;
      return !boundary || boundary === root;
    },
    /**
     * Checks the target's nearest matching ancestor.
     *
     * @param selector - Host-provided selector.
     * @returns Whether the target or an ancestor matches.
     * @throws If the browser rejects an invalid selector.
     */
    hasAncestor(selector) {
      return Boolean(target.closest(selector));
    },
    /**
     * Tests the closest matching ancestor without exposing the element.
     *
     * @param selector - Selector identifying the ancestor.
     * @param matchingSelector - Selector to test against that ancestor.
     * @returns Whether it matches, or undefined if no ancestor was found.
     * @throws If an evaluated selector is invalid.
     */
    closestAncestorMatches(selector, matchingSelector) {
      return target.closest(selector)?.matches(matchingSelector);
    },
    /**
     * Compares independently resolved closest ancestors by identity.
     *
     * @param firstSelector - Selector for the first ancestor.
     * @param secondSelector - Selector for the second ancestor.
     * @returns True when both selectors find the same element; false if either is missing.
     * @throws If the browser rejects an evaluated selector.
     */
    closestAncestorsAreSame(firstSelector, secondSelector) {
      const first = target.closest(firstSelector);
      return first !== null && first === target.closest(secondSelector);
    },
    /**
     * Reads inherited editability from a matching ancestor inside the occurrence.
     *
     * @param selector - Selector identifying the ancestor.
     * @returns Its editability, or undefined for non-element targets or missing matches.
     * @throws If the browser rejects the selector.
     */
    closestAncestorIsEditable(selector) {
      if (!ElementType || !(source instanceof ElementType)) {
        return undefined;
      }
      const ancestor = target.closest(selector);
      if (!ancestor || !root.contains(ancestor)) {
        return undefined;
      }
      const HTMLElementType = root.ownerDocument.defaultView?.HTMLElement;
      return Boolean(
        HTMLElementType && ancestor instanceof HTMLElementType && ancestor.isContentEditable,
      );
    },
    /**
     * Reads a matching ancestor's attribute.
     *
     * @param selector - Host-provided ancestor selector.
     * @param name - Attribute name on the matching ancestor.
     * @returns Attribute value, or undefined when absent.
     * @throws If the browser rejects an invalid selector.
     */
    ancestorAttribute(selector, name) {
      return target.closest(selector)?.getAttribute(name) ?? undefined;
    },
    /**
     * Reads a matching ancestor's attribute only while it belongs to this root.
     *
     * @param selector - Selector identifying the ancestor.
     * @param name - Attribute to read.
     * @returns Its value, or undefined when the match is absent or outside the root.
     * @throws If the selector is invalid.
     */
    ancestorAttributeWithinRoot(selector, name) {
      const ancestor = target.closest(selector);
      return ancestor && root.contains(ancestor)
        ? (ancestor.getAttribute(name) ?? undefined)
        : undefined;
    },
    /**
     * Checks whether a region and target share an owner inside the root.
     *
     * @param selector - Selector identifying the region.
     * @param ownerSelector - Selector identifying its owner.
     * @returns Whether both resolve to the same owner inside the root.
     * @throws If either selector is invalid.
     */
    hasAncestorWithinOwner(selector, ownerSelector) {
      const owner = target.closest(ownerSelector);
      const region = target.closest(selector);
      return Boolean(
        owner &&
        region &&
        root.contains(owner) &&
        root.contains(region) &&
        region.closest(ownerSelector) === owner,
      );
    },
  };
  if (source) {
    rememberInputTarget(result, source);
  }
  return result;
}

/**
 * Captures an owned ancestor as an attachment-bound presentation capability.
 *
 * @param source - Target of the pointer event, if it has element ancestry.
 * @param root - Occurrence receiving the event.
 * @param isAttached - Checks the exact originating listener attachment.
 * @param selector - Selector for the requested region.
 * @param ownerSelector - Selector for the region's nearest owning ancestor.
 * @param boundarySelector - Selector identifying nested occurrence boundaries.
 * @returns An opaque region, or undefined if the region is outside its owner or root.
 * @throws If a selector is invalid.
 */
function captureRegion(
  source: EventTarget | null,
  root: HTMLElement,
  isAttached: InputRootOwnerCheck,
  selector: string,
  ownerSelector: string,
  boundarySelector: string,
): InputRegion | undefined {
  const ElementType = root.ownerDocument.defaultView?.Element;
  const TextType = root.ownerDocument.defaultView?.Text;
  let target: Element | null = null;
  if (ElementType && source instanceof ElementType) {
    target = source;
  } else if (TextType && source instanceof TextType) {
    target = source.parentElement;
  }
  if (!target || !isAttached()) {
    return undefined;
  }
  const owner = target.closest(ownerSelector);
  const element = target.closest(selector);
  const boundary = target.closest(boundarySelector);
  if (
    !owner ||
    !element ||
    !root.contains(owner) ||
    !root.contains(element) ||
    element.closest(ownerSelector) !== owner ||
    (boundary && boundary !== root)
  ) {
    return undefined;
  }
  return new BrowserInputRegion({
    root,
    element,
    owner,
    ownerSelector,
    boundarySelector,
    isAttached,
  });
}

/**
 * Converts one browser native delivery into data and synchronous capabilities.
 *
 * The native event and target remain private to the browser adapter; all
 * registrations in a listener group receive this same normalized value.
 *
 * @param event - Original native event received by the listener group.
 * @param root - Attached occurrence root.
 * @param isAttached - Checks the exact listener attachment for retained capabilities.
 * @param isDelivering - Checks the lifetime of this synchronous listener delivery.
 * @returns Normalized input for the event's native name.
 * @throws Propagates browser selection access failures for selection changes.
 */
export function captureBrowserInput(
  event: Event,
  root: HTMLElement,
  isAttached: InputRootOwnerCheck,
  isDelivering: () => boolean = () => false,
): BrowserInputMap[keyof BrowserInputMap] {
  const base: InputEvent = {
    type: event.type,
    target: inputTarget(event.target, root, () => isDelivering() && isAttached()),
    /**
     * Prevents the native default for this delivery when cancelable.
     *
     * @returns The browser default has been requested to stop.
     */
    preventDefault() {
      event.preventDefault();
    },
    /**
     * Stops native propagation for this delivery.
     *
     * @returns The browser will not propagate to later targets.
     */
    stopPropagation() {
      event.stopPropagation();
    },
  };
  if (event.type === "keydown" || event.type === "keyup") {
    return captureKeyInput(event as KeyboardEvent, base, root);
  }
  if (event.type === "wheel") {
    return captureWheelInput(event as WheelEvent, base);
  }
  if (event.type === "beforeinput" || event.type === "input") {
    return captureTextInput(event as globalThis.InputEvent, base, event.type, root, isAttached);
  }
  if (event.type === "copy" || event.type === "cut" || event.type === "paste") {
    return captureClipboardInput(event as ClipboardEvent, base, event.type);
  }
  if (event.type === "visibilitychange") {
    return { ...base, type: "visibilitychange", hidden: root.ownerDocument.hidden };
  }
  if (event.type === "selectionchange") {
    const anchor = root.ownerDocument.getSelection()?.anchorNode ?? event.target;
    return { ...base, type: "selectionchange", selectionTarget: inputTarget(anchor, root) };
  }
  if (event.type === "focusin" || event.type === "focusout") {
    const target = event.target;
    const relatedTarget = (event as FocusEvent).relatedTarget;
    return {
      ...base,
      type: event.type,
      relatedTarget: inputTarget(relatedTarget, root),
      hasRelatedTarget: Boolean(relatedTarget),
      /**
       * Captures an ancestor once and checks the focus transition's live related target.
       *
       * @param selector - Selector identifying the target ancestor inside the root.
       * @returns Query reporting whether the current related node belongs to that ancestor.
       * @throws If the browser rejects the selector.
       */
      captureRelatedTargetWithinAncestor(selector) {
        const ElementType = root.ownerDocument.defaultView?.Element;
        const ancestor =
          ElementType && target instanceof ElementType ? target.closest(selector) : null;
        const captured = ancestor && root.contains(ancestor) ? ancestor : null;
        return () => {
          const NodeType = root.ownerDocument.defaultView?.Node;
          const related = (event as FocusEvent).relatedTarget;
          return Boolean(NodeType && related instanceof NodeType && captured?.contains(related));
        };
      },
    };
  }
  if (
    event.type.startsWith("pointer") ||
    event.type === "lostpointercapture" ||
    event.type === "mousedown" ||
    event.type === "click" ||
    event.type === "dblclick" ||
    event.type === "auxclick" ||
    event.type === "contextmenu"
  ) {
    return captureMouseInput(event as MouseEvent, base, root, isAttached);
  }
  return base;
}

/**
 * Normalizes one mouse event at a host browser integration boundary.
 *
 * @param event - Native mouse event delivered to the host.
 * @param root - Mounted occurrence providing target and browser context.
 * @param isAttached - Checks the exact originating occurrence registration.
 * @returns Copied mouse data and synchronous target and delivery capabilities.
 * @throws If the event name is not a supported mouse input.
 */
export function captureMouseEvent(
  event: MouseEvent,
  root: HTMLElement,
  isAttached: InputRootOwnerCheck,
): MouseInput {
  if (!["mousedown", "click", "dblclick", "auxclick", "contextmenu"].includes(event.type)) {
    throw new Error(`Unsupported mouse event: ${event.type}`);
  }
  const input = captureBrowserInput(event, root, isAttached);
  if (!("button" in input)) {
    throw new Error(`Unsupported mouse event: ${event.type}`);
  }
  return input;
}

/**
 * Captures the browser's text edit data, including synthetic plain input events.
 *
 * @param event - Native input event selected by its event name.
 * @param base - Normalized target and delivery capabilities.
 * @param type - Before-input or completed-input event name.
 * @param root - Receiving occurrence used to bound text host capture.
 * @param isAttached - Checks the input or occurrence attachment that received the input.
 * @returns Copied editing data with empty defaults for unavailable fields.
 */
function captureTextInput(
  event: globalThis.InputEvent,
  base: InputEvent,
  type: TextInput["type"],
  root: HTMLElement,
  isAttached: InputRootOwnerCheck,
): TextInput {
  const target = event.target;
  return {
    ...base,
    type,
    ...captureTextInputData(event),
    /**
     * Captures the target's matching content host without exposing its element.
     *
     * @param selector - Selector identifying the target ancestor inside the root.
     * @param boundarySelector - Optional selector identifying nested occurrences.
     * @returns Captured host, or undefined when detached, moved, or no matching owned host exists.
     * @throws If the browser rejects the selector or attachment check fails.
     */
    captureTextHost(selector, boundarySelector) {
      return captureInputTextHost(target, root, isAttached, selector, boundarySelector);
    },
    /**
     * Captures a matching content host for live text reads.
     *
     * @param selector - Selector identifying the target ancestor inside the root.
     * @returns Reader for the captured host, or undefined when no owned host matches.
     * @throws If the browser rejects the selector.
     */
    captureTargetText(selector) {
      const ElementType = root.ownerDocument.defaultView?.Element;
      const host = ElementType && target instanceof ElementType ? target.closest(selector) : null;
      if (!host || !root.contains(host)) {
        return undefined;
      }
      return () => host.textContent ?? "";
    },
  };
}

/**
 * Captures a matching host while checking that the originating input is still attached.
 *
 * @param target - Original target of the input event.
 * @param root - Receiving occurrence that must contain the host.
 * @param isAttached - Checks the registration that received the input.
 * @param selector - Selector identifying a content host ancestor.
 * @param boundarySelector - Optional selector identifying nested occurrences.
 * @returns Captured host, or undefined when the registration or host is no longer current.
 * @throws If the browser rejects the selector or the attachment check fails.
 */
function captureInputTextHost(
  target: EventTarget | null,
  root: HTMLElement,
  isAttached: InputRootOwnerCheck,
  selector: string,
  boundarySelector?: string,
): TextHost | undefined {
  if (!isAttached()) {
    return undefined;
  }
  const ElementType = root.ownerDocument.defaultView?.Element;
  if (!ElementType || !(target instanceof ElementType)) {
    return undefined;
  }
  const host = target.closest<HTMLElement>(selector);
  if (!host || !root.contains(host)) {
    return undefined;
  }
  if (!isAttached() || !root.contains(host) || target.closest(selector) !== host) {
    return undefined;
  }
  return captureBrowserTextHost(host, root, boundarySelector);
}

/**
 * Provides synchronous access to clipboard formats without returning DataTransfer.
 *
 * @param event - Native clipboard event selected by its event name.
 * @param base - Normalized target and delivery capabilities.
 * @param type - Clipboard operation associated with this delivery.
 * @returns Clipboard capabilities, or null when the event has no clipboard data.
 */
function captureClipboardInput(
  event: ClipboardEvent,
  base: InputEvent,
  type: ClipboardInput["type"],
): ClipboardInput {
  return {
    ...base,
    type,
    clipboard: captureClipboardData(event),
    clipboardTarget: captureClipboardTarget(event),
  };
}

/**
 * Copies keyboard labels, modifiers and composition state into one delivery.
 *
 * @param event - Native event selected by its keyboard event name.
 * @param base - Normalized target and delivery capabilities.
 * @param root - Receiving occurrence used by keyboard target queries.
 * @returns Keyboard data without retaining the native event as a public value.
 */
function captureKeyInput(event: KeyboardEvent, base: InputEvent, root: HTMLElement): KeyInput {
  return {
    ...base,
    type: event.type === "keydown" ? "keydown" : "keyup",
    defaultPrevented: event.defaultPrevented,
    keyboardTarget: captureKeyboardTarget(event, root),
    key: event.key,
    code: event.code,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    isComposing: event.isComposing,
    repeat: event.repeat,
  };
}

/**
 * Copies wheel coordinates, deltas and modifiers into one delivery.
 *
 * @param event - Native event selected by its wheel event name.
 * @param base - Normalized target and delivery capabilities.
 * @returns Wheel data retaining the browser-reported delta mode.
 */
function captureWheelInput(event: WheelEvent, base: InputEvent): WheelInput {
  return {
    ...base,
    type: "wheel",
    clientX: event.clientX,
    clientY: event.clientY,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaMode: event.deltaMode,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
  };
}

/**
 * Copies mouse or pointer coordinates and button state into one delivery.
 *
 * @param event - Native event selected by its mouse or pointer event name.
 * @param base - Normalized target and delivery capabilities.
 * @param root - Occurrence receiving this mouse input.
 * @param isAttached - Checks the exact originating listener attachment.
 * @returns Pointer data for supported pointer names, otherwise mouse data.
 */
function captureMouseInput(
  event: MouseEvent,
  base: InputEvent,
  root: HTMLElement,
  isAttached: InputRootOwnerCheck,
): MouseInput | PointerInput {
  const value: MouseInput = {
    ...base,
    // The caller selected one of the mouse or pointer names represented by this type.
    type: event.type as MouseInput["type"],
    clientX: event.clientX,
    clientY: event.clientY,
    button: event.button,
    buttons: event.buttons,
    detail: typeof event.detail === "number" ? event.detail : 0,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
  };
  if (
    event.type === "pointerenter" ||
    event.type === "pointerleave" ||
    event.type === "pointerdown" ||
    event.type === "pointermove" ||
    event.type === "pointerup" ||
    event.type === "pointercancel" ||
    event.type === "lostpointercapture" ||
    event.type === "pointerover" ||
    event.type === "pointerout"
  ) {
    return capturePointerInput(event as PointerEvent, event.type, value, root, isAttached);
  }
  return value;
}

/**
 * Adds pointer identity, transition and region capabilities to copied mouse data.
 *
 * @param pointer - Native pointer event captured by the browser adapter.
 * @param type - Pointer phase selected by the caller.
 * @param value - Copied mouse coordinates and modifiers.
 * @param root - Occurrence receiving the pointer input.
 * @param isAttached - Checks the exact originating listener attachment.
 * @returns Normalized pointer input without exposing the native event.
 */
function capturePointerInput(
  pointer: PointerEvent,
  type: PointerInput["type"],
  value: MouseInput,
  root: HTMLElement,
  isAttached: InputRootOwnerCheck,
): PointerInput {
  return {
    ...value,
    type,
    pointerId: pointer.pointerId,
    pointerType: pointer.pointerType,
    isPrimary: pointer.isPrimary,
    relatedTarget: inputTarget(pointer.relatedTarget, root),
    /**
     * Captures the pointer on this listener's mounted root.
     *
     * @returns Idempotent release for this capture, or undefined after detachment.
     * @throws If the browser rejects pointer capture.
     */
    captureRootPointer() {
      return capturePointer(root, pointer.pointerId, isAttached);
    },
    /**
     * Captures the nearest matching pointer target within the attached root.
     *
     * @param selector - Selector identifying the target or an owned ancestor.
     * @returns Capture release, or undefined if the target is unavailable.
     * @throws If selector evaluation or browser capture fails.
     */
    captureTargetPointer(selector) {
      return captureTargetPointer(pointer, root, selector, isAttached);
    },
    /**
     * Checks whether this event targets an element in the current JavaScript realm.
     *
     * @returns False for text nodes and elements in another realm.
     */
    isCurrentRealmElement() {
      return pointer.target instanceof Element;
    },
    /**
     * Focuses the nearest matching HTML ancestor while this input remains attached.
     *
     * @param selector - Selector identifying the target ancestor.
     * @returns Focus is requested without scrolling when an ancestor is available.
     * @throws If selector evaluation or browser focus fails.
     */
    focusTargetAncestor(selector) {
      if (!isAttached()) {
        return;
      }
      const target = pointer.target;
      const ElementType = root.ownerDocument.defaultView?.Element;
      const HTMLElementType = root.ownerDocument.defaultView?.HTMLElement;
      const SVGElementType = root.ownerDocument.defaultView?.SVGElement;
      if (ElementType && target instanceof ElementType) {
        const ancestor = target.closest(selector);
        if (
          ancestor &&
          root.contains(ancestor) &&
          isAttached() &&
          ((HTMLElementType && ancestor instanceof HTMLElementType) ||
            (SVGElementType && ancestor instanceof SVGElementType))
        ) {
          ancestor.focus({ preventScroll: true });
        }
      }
    },
    /**
     * Creates a scroll session bounded by this listener and the borrowed occurrence.
     *
     * @param afterScroll - Refreshes gesture geometry after scrolling.
     * @param isActive - Checks the borrowed occurrence's current lifetime.
     * @returns Independent session that stops acting when either owner is inactive.
     */
    createAutoScroll(afterScroll, isActive) {
      return new BrowserAutoScroll(root, afterScroll, () => isAttached() && isActive());
    },
    /**
     * Schedules work while this pointer's listener attachment remains active.
     *
     * @param callback - Work to run in the originating browser realm.
     * @returns Idempotent cancellation, or a no-op when scheduling is unavailable.
     * @throws Propagates browser scheduling failures.
     */
    scheduleTask(callback) {
      return scheduleInputTask(root, isAttached, callback);
    },
    /**
     * Captures an owned region for the current pointer target.
     *
     * @param selector - Region selector.
     * @param ownerSelector - Selector for its nearest owner.
     * @param boundarySelector - Selector for occurrence boundaries.
     * @returns Attachment-bound region, or undefined when ownership cannot be established.
     * @throws If the browser rejects a selector.
     */
    captureRegion(selector, ownerSelector, boundarySelector) {
      return captureRegion(
        pointer.target,
        root,
        isAttached,
        selector,
        ownerSelector,
        boundarySelector,
      );
    },
    /**
     * Reads live propagation state while this browser event is being delivered.
     *
     * @returns Whether an earlier listener has stopped propagation.
     */
    isPropagationStopped() {
      return pointer.cancelBubble;
    },
  };
}

/**
 * Schedules a task bounded by one native input attachment.
 *
 * @param root - Mounted occurrence supplying the browser realm.
 * @param isAttached - Checks that the originating listener is still attached.
 * @param callback - Work to run only while the listener is attached.
 * @returns Idempotent cancellation, or a no-op without a window or attachment.
 * @throws Propagates browser scheduling failures.
 */
function scheduleInputTask(
  root: HTMLElement,
  isAttached: InputRootOwnerCheck,
  callback: () => void,
): () => void {
  const view = root.ownerDocument.defaultView;
  if (!view || !isAttached()) {
    return () => {};
  }
  let timer: number | undefined = view.setTimeout(() => {
    timer = undefined;
    if (isAttached()) {
      callback();
    }
  }, 0);
  return () => {
    if (timer !== undefined) {
      view.clearTimeout(timer);
      timer = undefined;
    }
  };
}
