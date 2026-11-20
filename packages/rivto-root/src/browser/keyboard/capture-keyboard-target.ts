import type { KeyboardTarget, KeyboardTargetState } from "../../keyboard/types";

/**
 * Provides live keyboard target queries without exposing browser nodes.
 *
 * Queries read the captured target's current properties and ancestry on each call.
 * The target identity is fixed for this delivery, even if the native event is
 * dispatched again. The target and surface remain private to this browser adapter.
 *
 * @param event - Keyboard event whose current target is captured for live queries.
 * @param root - Receiving occurrence surface used for direct-target checks.
 * @returns Target queries for synchronous keyboard delivery.
 */
export function captureKeyboardTarget(event: KeyboardEvent, root: HTMLElement): KeyboardTarget {
  return new BrowserKeyboardTarget(event.target, root);
}

/** Browser-owned live target queries for a keyboard delivery. */
class BrowserKeyboardTarget implements KeyboardTarget {
  /**
   * Borrows the captured target and occurrence for synchronous target checks.
   *
   * @param target - Original target whose properties and ancestry are queried live.
   * @param root - Receiving surface for direct-target checks.
   */
  constructor(
    private readonly target: EventTarget | null,
    private readonly root: HTMLElement,
  ) {}
  /**
   * Checks direct targeting of the receiving surface.
   *
   * @returns True only when the current native target is the surface itself.
   */
  isRoot(): boolean {
    return this.target === this.root;
  }
  /**
   * Checks the target against the current realm's element constructor.
   *
   * @returns Whether the current target is an element in this JavaScript realm.
   */
  isCurrentRealmElement(): boolean {
    return this.target instanceof Element;
  }
  /**
   * Reads an attribute from the matching ancestor of a target's matching ancestor.
   *
   * @param selector - Selector for the nearest starting ancestor.
   * @param ancestorSelector - Selector for the ancestor of that starting element.
   * @param attribute - Attribute to read from the resulting ancestor.
   * @returns Attribute value, or undefined when a match or attribute is missing.
   * @throws If an evaluated selector is invalid.
   */
  closestAncestorAttribute(
    selector: string,
    ancestorSelector: string,
    attribute: string,
  ): string | undefined {
    const target = this.target;
    if (!isElementNode(target)) {
      return undefined;
    }
    return (
      target.closest(selector)?.closest(ancestorSelector)?.getAttribute(attribute) ?? undefined
    );
  }
  /**
   * Copies current target properties while accepting elements from other documents.
   *
   * @returns Current element properties, or undefined for a non-element target.
   */
  read(): KeyboardTargetState | undefined {
    const target = this.target;
    if (!isHTMLElementNode(target)) {
      return undefined;
    }
    return {
      isCurrentRealmHTMLElement: target instanceof HTMLElement,
      isEditable: Boolean(target.isContentEditable),
      isFormControl: /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName),
      isLink: target.tagName === "A",
    };
  }
  /**
   * Checks the target's current element ancestry, including a text target's parent.
   *
   * @param selector - Selector identifying the target or an ancestor.
   * @returns Whether an element in the current ancestry matches.
   * @throws If the browser rejects the selector.
   */
  hasAncestor(selector: string): boolean {
    const target = this.target;
    let element: Element | null = null;
    if (isHTMLElementNode(target)) {
      element = target;
    } else if (isNodeLike(target)) {
      element = target.parentElement;
    }
    return element && typeof element.closest === "function"
      ? Boolean(element.closest(selector))
      : false;
  }
}

/**
 * Identifies a DOM node without depending on its document's realm.
 *
 * @param value - Event target or other candidate.
 * @returns Whether the value has a numeric node type.
 */
function isNodeLike(value: unknown): value is Node {
  return (
    typeof value === "object" && value !== null && typeof (value as Node).nodeType === "number"
  );
}

/**
 * Identifies an element node across browser realms.
 *
 * @param value - Event target or other candidate.
 * @returns Whether the candidate is an element node.
 */
function isElementNode(value: unknown): value is Element {
  return isNodeLike(value) && value.nodeType === 1;
}

/**
 * Identifies an element with a tag name across browser realms.
 *
 * @param value - Event target or other candidate.
 * @returns Whether the candidate is an element with a string tag name.
 */
function isHTMLElementNode(value: unknown): value is HTMLElement {
  return isElementNode(value) && typeof (value as HTMLElement).tagName === "string";
}
