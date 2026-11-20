import type {
  EditableTextSelectionEnd,
  EditableTextSelectionPointer,
  BrowserInputMap,
  FocusableInputRegion,
  InputRegion,
  InputRegionChildren,
  InputRegionAncestorWithParent,
  InputInlineStyleSession,
  InputRegionStyleSession,
  InputRegionStyles,
  InputRegionSizeObservationOptions,
  InputTarget,
  RegionPredicate,
  RegionIdentity,
  PointerPosition,
} from "../../events/types";
import type { InputRegionState, InputRootOwnerCheck, TemporaryAttributeState } from "./types";
import type {
  RegionBounds,
  RegionPoint,
  RegionBoundsObserver,
  RegionLayout,
  RegionSize,
} from "../../geometry/types";
import { inputElementIdentity } from "./input-element-identity";
import { placeCaretAtPoint } from "../text/place-caret-at-point";
import { observeRegionBounds } from "../geometry/observe-region-bounds";
import { observeDocumentOffsetAndFollowEnd } from "../geometry/observe-document-offset";
import { beginEditableTextSelection } from "../text/drag-text-selection";
import { createInlineStyleSession } from "./inline-style-session";
import { observeRegionInput } from "./region-input-observer";

const inputTargets = new WeakMap<InputTarget, EventTarget>();
const styleOwners = new WeakMap<Element, Map<string, object>>();
const attributeOwners = new WeakMap<Element, Map<string, TemporaryAttributeState>>();

/**
 * Retains the browser identity behind a normalized target for region containment.
 *
 * @param target - Normalized target delivered to consumers.
 * @param source - Browser target represented by the capability.
 * @returns The association is available while the normalized target is retained.
 */
export function rememberInputTarget(target: InputTarget, source: EventTarget): void {
  inputTargets.set(target, source);
}

/**
 * Resolves a normalized target within the browser implementation.
 *
 * @param target - Target captured by this browser adapter.
 * @returns Its native identity, or undefined for another provider.
 */
export function readInputTarget(target: InputTarget): EventTarget | undefined {
  return inputTargets.get(target);
}

/**
 * Binds an existing mounted element as an opaque input region.
 *
 * The browser mounting owner supplies both elements and invalidates the region
 * with its exact attachment; callers receive no native target through the result.
 *
 * @param root - Mounted occurrence containing the region.
 * @param element - Existing region element inside the occurrence.
 * @param isAttached - Checks whether the originating attachment is still current.
 * @returns Region capabilities bounded by the attachment and element ownership.
 * @throws If the region is outside the supplied root.
 */
export function createBrowserInputRegion(
  root: HTMLElement,
  element: Element,
  isAttached: InputRootOwnerCheck,
): FocusableInputRegion {
  if (!root.contains(element)) {
    throw new Error("Input region must belong to its root");
  }
  return new BrowserInputRegion({ root, element, owner: element, ownerSelector: "*", isAttached });
}

/** Opaque, attachment-bound access to a region used by input feedback. */
export class BrowserInputRegion implements FocusableInputRegion {
  readonly #state: InputRegionState;

  /**
   * Retains the region's browser identity and its occurrence ownership checks.
   *
   * @param state - Private identity and attachment state.
   */
  constructor(state: InputRegionState) {
    this.#state = state;
  }

  /**
   * Converts a viewport point through the inverse transform of this SVG region.
   *
   * The result is discarded if browser geometry access invalidates the region.
   *
   * @param point - Viewport position in CSS pixels.
   * @returns Local SVG coordinates, or undefined when the region or matrix is unavailable.
   * @throws Propagates matrix inversion and ownership failures.
   */
  clientToSvgPoint(point: PointerPosition): RegionPoint | undefined {
    if (!this.isActive()) {
      return undefined;
    }
    const element = this.#state.element;
    const view = element.ownerDocument.defaultView;
    if (!view?.SVGGraphicsElement || !(element instanceof view.SVGGraphicsElement)) {
      return undefined;
    }
    const matrix = element.getScreenCTM()?.inverse();
    if (!matrix || !this.isActive()) {
      return undefined;
    }
    return {
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    };
  }

  /**
   * Captures a matching ancestor and its parent without exposing browser elements.
   *
   * The returned regions share the original target's attachment and become stale
   * when the target disconnects or its closest match changes parent.
   *
   * @param selector - CSS selector identifying the nearest ancestor.
   * @returns Captured ancestor and parent, or undefined when unavailable or outside the occurrence.
   * @throws If the selector is invalid or an ownership check fails.
   */
  captureAncestorWithParent(selector: string): InputRegionAncestorWithParent | undefined {
    if (!this.isActive()) {
      return undefined;
    }
    const { root, element } = this.#state;
    const ancestor = element.closest(selector);
    const parent = ancestor?.parentElement;
    if (!ancestor || !parent) {
      return undefined;
    }
    /**
     * Checks the captured ancestry after any reentrant occurrence callback.
     *
     * @returns True while the target, nearest match, and parent retain their captured path.
     * @throws If the browser rejects the selector.
     */
    const isPathCurrent = () =>
      element.isConnected &&
      root.contains(parent) &&
      element.closest(selector) === ancestor &&
      ancestor.parentElement === parent;
    const isCurrent = () =>
      this.isActive() && isPathCurrent() && this.isActive() && isPathCurrent();
    if (!isCurrent()) {
      return undefined;
    }
    return {
      ancestor: new BrowserInputRegion({
        root,
        element: ancestor,
        owner: ancestor,
        ownerSelector: "*",
        isAttached: isCurrent,
      }),
      parent: new BrowserInputRegion({
        root,
        element: parent,
        owner: parent,
        ownerSelector: "*",
        isAttached: isCurrent,
      }),
    };
  }

  /**
   * Observes normalized input on this region in its browser propagation phase.
   *
   * @param type - Browser input name to observe.
   * @param phase - Capture or bubble phase on the region.
   * @param observer - Receives normalized input while delivery is current.
   * @returns Idempotent disposer, or undefined if the region is not owned.
   * @throws Propagates listener setup, ownership, and cleanup failures.
   */
  observeInput<K extends keyof BrowserInputMap>(
    type: K,
    phase: "capture" | "bubble",
    observer: (input: BrowserInputMap[K]) => void,
  ): (() => void) | undefined {
    return observeRegionInput(
      this.#state.root,
      this.#state.element,
      () => this.isActive(),
      type,
      phase,
      observer,
    );
  }

  /**
   * Captures live indexed access to this region's immediate element children.
   *
   * The collection reads current order without copying children. Each captured
   * child stops working if it leaves this parent or the attachment ends.
   *
   * @returns Child access, or undefined when this region is inactive.
   * @throws Propagates attachment-check failures.
   */
  captureChildren(): InputRegionChildren | undefined {
    if (!this.isActive()) {
      return undefined;
    }
    const parent = this.#state.element;
    return {
      /**
       * Reads the live number of immediate element children.
       *
       * @returns Current count, or undefined when the parent is inactive.
       * @throws Propagates attachment-check failures.
       */
      getLength: () => {
        if (!this.isActive()) {
          return undefined;
        }
        const count = parent.children.length;
        return this.isActive() ? count : undefined;
      },
      /**
       * Captures one current immediate child without copying the collection.
       *
       * @param index - Zero-based integer position in the live collection.
       * @returns Captured child, or undefined for an absent index or stale parent.
       * @throws Propagates attachment-check failures.
       */
      get: (index) => {
        if (!Number.isInteger(index) || index < 0 || !this.isActive()) {
          return undefined;
        }
        const child = parent.children.item(index);
        if (!child || child.parentElement !== parent || !this.isActive()) {
          return undefined;
        }
        return new BrowserInputRegion({
          root: this.#state.root,
          element: child,
          owner: child,
          ownerSelector: "*",
          isAttached: () => this.isActive() && child.parentElement === parent,
        });
      },
    };
  }

  /**
   * Tests this region against a selector while preserving its ownership boundary.
   *
   * @param selector - CSS selector evaluated against the captured element.
   * @returns Whether it matches, or undefined if ownership changes.
   * @throws If the selector is invalid or an ownership check fails.
   */
  matches(selector: string): boolean | undefined {
    if (!this.isActive()) {
      return undefined;
    }
    const matches = this.#state.element.matches(selector);
    return this.isActive() ? matches : undefined;
  }

  /**
   * Visits this region and its ancestors through the supplied boundary.
   *
   * Regions passed to the predicate remain bound to both the original hit and
   * boundary. A moved hit or replaced attachment invalidates the walk. Boundaries
   * captured within another surface are not traversed.
   *
   * @param boundary - Active containing region visited last when reached.
   * @param predicate - Synchronous test for each region from inner to outer.
   * @returns Whether a region matched, false outside the boundary or in another
   * surface, or undefined if either region becomes inactive or the hit moves.
   * @throws Propagates predicate and ownership-check failures.
   */
  someAncestorWithin(boundary: InputRegion, predicate: RegionPredicate): boolean | undefined {
    if (!(boundary instanceof BrowserInputRegion) || !this.isActive() || !boundary.isActive()) {
      return undefined;
    }
    const hit = this.#state.element;
    const limit = boundary.#state.element;
    if (boundary.#state.root !== this.#state.root || !limit.contains(hit)) {
      return false;
    }
    const visited: Element[] = [];
    for (let element: Element | null = hit; element; element = element.parentElement) {
      const ancestor = element;
      const next = ancestor.parentElement;
      visited.push(ancestor);
      const region = new BrowserInputRegion({
        root: this.#state.root,
        element: ancestor,
        owner: ancestor,
        ownerSelector: "*",
        isAttached: () =>
          this.isActive() && boundary.isActive() && limit.contains(hit) && ancestor.contains(hit),
      });
      const matches = predicate(region);
      if (
        !region.isActive() ||
        !this.isActive() ||
        !boundary.isActive() ||
        !limit.contains(hit) ||
        visited.some((element, index) => element.parentElement !== (visited[index + 1] ?? next))
      ) {
        return undefined;
      }
      if (matches) {
        return true;
      }
      if (ancestor === limit) {
        return false;
      }
    }
    return undefined;
  }

  /**
   * Identifies this captured region while its original attachment owns it.
   *
   * @returns Opaque element identity, or undefined when no longer owned.
   * @throws Propagates ownership-check failures.
   */
  getIdentity(): RegionIdentity | undefined {
    return this.isActive() ? inputElementIdentity(this.#state.element) : undefined;
  }

  /**
   * Finds the first descendant matching a selector without crossing nested boundaries.
   *
   * @param selector - Desired descendant selector.
   * @param boundarySelector - Descendant boundaries excluded from the search.
   * @returns The first captured region, or undefined when absent or inactive.
   * @throws Propagates selector and ownership-check failures.
   */
  findOwnedRegion(selector: string, boundarySelector: string): InputRegion | undefined {
    if (!this.isActive()) {
      return undefined;
    }
    const pending = Array.from(this.#state.element.children);
    while (pending.length) {
      const element = pending.shift()!;
      if (element.matches(boundarySelector)) {
        continue;
      }
      if (element.matches(selector)) {
        return this.isActive() ? this.captureDescendant(element, selector) : undefined;
      }
      pending.unshift(...element.children);
    }
    return undefined;
  }

  /**
   * Captures matching descendants owned by this region's occurrence.
   *
   * @param selector - Selector for descendants to capture.
   * @param boundarySelector - Selector identifying nested occurrence boundaries.
   * @returns Captured regions in document order, or an empty list when inactive.
   * @throws Propagates selector and ownership-check failures.
   */
  findRegions(selector: string, boundarySelector: string): readonly InputRegion[] {
    if (!this.isActive()) {
      return [];
    }
    const { root, element } = this.#state;
    const regions = Array.from(element.querySelectorAll(selector))
      .filter((candidate) => candidate.closest(boundarySelector) === root)
      .map((candidate) => this.captureDescendant(candidate, selector, boundarySelector));
    return this.isActive() ? regions : [];
  }

  /**
   * Measures the captured region while it belongs to its original occurrence.
   *
   * @returns Viewport coordinates and size, or undefined if ownership changes.
   * @throws Propagates browser geometry and ownership-check failures.
   */
  readBounds(): RegionBounds | undefined {
    if (!this.isActive()) {
      return undefined;
    }
    const { left, top, width, height } = this.#state.element.getBoundingClientRect();
    return this.isActive() ? { left, top, width, height } : undefined;
  }

  /**
   * Observes viewport bounds while this captured region remains current.
   *
   * @param observer - Receives the initial and subsequent current bounds snapshots.
   * @returns Idempotent disposer for the observation.
   * @throws Propagates observation, measurement, and cleanup failures.
   */
  observeBounds(observer: RegionBoundsObserver): () => void {
    return observeRegionBounds(this.#state.element, () => this.isActive(), observer);
  }

  /**
   * Measures the region's document offset and preserves end scrolling after resize.
   *
   * The caller owns the observation; a stale region stops notifications and scrolling.
   *
   * @param observer - Receives the document top offset in CSS pixels.
   * @returns Idempotent disposer for the captured browser observation.
   * @throws Propagates setup, measurement, callback, and cleanup failures.
   */
  observeDocumentOffsetAndFollowEnd(observer: (offset: number) => void): () => void {
    if (!this.isActive()) {
      return () => {};
    }
    return observeDocumentOffsetAndFollowEnd(
      this.#state.element,
      this.#state.root,
      observer,
      () => this.isActive() && this.#state.root.isConnected && this.#state.element.isConnected,
    );
  }

  /**
   * Observes size changes without exposing the region's browser element.
   *
   * @param observer - Called for reported size changes while the region is active.
   * @param options - Optional immediate-child observation and missing-browser fallback.
   * @returns Disposer releasing the browser observer, or a no-op for an inactive region.
   * @throws If size observation is unavailable without the fallback option, or browser setup or cleanup fails.
   */
  observeSize(observer: () => void, options?: InputRegionSizeObservationOptions): () => void {
    if (!this.isActive()) {
      return () => {};
    }
    const element = this.#state.element;
    const Observer = element.ownerDocument.defaultView?.ResizeObserver;
    if (!Observer) {
      if (options?.allowUnavailable) {
        return () => {};
      }
      throw new Error("ResizeObserver is not available for this region");
    }
    let active = true;
    const resize = new Observer(() => {
      if (active && this.isActive()) {
        observer();
      }
    });
    try {
      resize.observe(element);
      if (options?.includeChildren) {
        for (const child of element.children) {
          resize.observe(child);
        }
      }
      if (!this.isActive()) {
        active = false;
        resize.disconnect();
      }
    } catch (error) {
      try {
        resize.disconnect();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Region size observation rollback failed");
      }
      throw error;
    }
    return () => {
      if (active) {
        active = false;
        resize.disconnect();
      }
    };
  }

  /**
   * Measures this region's scroll height with an enclosing region temporarily unconstrained.
   *
   * The original inline height declaration is restored even if the read fails.
   * Both regions must remain in the same active occurrence, and the container
   * must contain this region. SVG regions cannot provide this measurement.
   *
   * @param container - Enclosing region whose height is temporarily set to auto.
   * @returns Scroll height in CSS pixels, or undefined for stale or incompatible regions.
   * @throws Propagates browser style, layout, and ownership failures.
   */
  readUnconstrainedScrollHeight(container: InputRegion): number | undefined {
    if (!(container instanceof BrowserInputRegion) || !this.isActive() || !container.isActive()) {
      return undefined;
    }
    const element = this.#state.element;
    const parent = container.#state.element;
    const view = element.ownerDocument.defaultView;
    if (
      !view ||
      !(element instanceof view.HTMLElement) ||
      !(parent instanceof view.HTMLElement) ||
      this.#state.root !== container.#state.root ||
      !parent.contains(element)
    ) {
      return undefined;
    }
    const height = parent.style.getPropertyValue("height");
    const priority = parent.style.getPropertyPriority("height");
    try {
      parent.style.setProperty("height", "auto");
      const measured = element.scrollHeight;
      return this.isActive() && container.isActive() ? measured : undefined;
    } finally {
      parent.style.setProperty("height", height, priority);
    }
  }

  /**
   * Observes child insertion and removal within this region's subtree.
   *
   * @param observer - Called for structural changes while the region is active.
   * @returns Disposer releasing the browser observer, or a no-op for an inactive region.
   * @throws If structural observation is unavailable or setup or cleanup fails.
   */
  observeStructure(observer: () => void): () => void {
    if (!this.isActive()) {
      return () => {};
    }
    const element = this.#state.element;
    const Observer = element.ownerDocument.defaultView?.window.MutationObserver;
    if (!Observer) {
      throw new Error("MutationObserver is not available for this region");
    }
    let active = true;
    const mutations = new Observer(() => {
      if (active && this.isActive()) {
        observer();
      }
    });
    try {
      mutations.observe(element, { childList: true, subtree: true });
      if (!this.isActive()) {
        active = false;
        mutations.disconnect();
      }
    } catch (error) {
      try {
        mutations.disconnect();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Region structure observation rollback failed",
        );
      }
      throw error;
    }
    return () => {
      if (active) {
        active = false;
        mutations.disconnect();
      }
    };
  }

  /**
   * Reads the untransformed layout width of the captured HTML region.
   *
   * @returns The width in CSS pixels, or undefined for inactive or non-HTML regions.
   * @throws Propagates browser measurement and ownership-check failures.
   */
  readLayoutWidth(): number | undefined {
    if (!this.isActive()) {
      return undefined;
    }
    const element = this.#state.element;
    const view = element.ownerDocument.defaultView;
    if (!view || !(element instanceof view.HTMLElement)) {
      return undefined;
    }
    const width = element.offsetWidth;
    return this.isActive() ? width : undefined;
  }

  /**
   * Reads the HTML region's inner dimensions without applying transforms.
   *
   * @returns Width and height including padding but excluding borders and scrollbars,
   * or undefined when the region is inactive or not HTML.
   * @throws Propagates browser measurement and ownership-check failures.
   */
  readClientSize(): RegionSize | undefined {
    if (!this.isActive()) {
      return undefined;
    }
    const element = this.#state.element;
    const view = element.ownerDocument.defaultView;
    if (!view || !(element instanceof view.HTMLElement)) {
      return undefined;
    }
    const size = { width: element.clientWidth, height: element.clientHeight };
    return this.isActive() ? size : undefined;
  }

  /**
   * Reads one computed CSS property without measuring region geometry.
   *
   * @param property - CSS property name to read.
   * @returns Computed value, or undefined when ownership or the window is unavailable.
   * @throws Propagates browser style and ownership-check failures.
   */
  readComputedProperty(property: string): string | undefined {
    if (!this.isActive()) {
      return undefined;
    }
    const element = this.#state.element;
    const view = element.ownerDocument.defaultView;
    if (!view) {
      return undefined;
    }
    const value = view.getComputedStyle(element).getPropertyValue(property);
    return this.isActive() ? value : undefined;
  }

  /**
   * Reads detached viewport geometry and requested computed CSS values.
   *
   * Zero local dimensions use unit scale. The result is discarded if the
   * occurrence or region ownership changes during the browser reads.
   *
   * @param properties - CSS property names to copy into the result.
   * @returns Layout data, or undefined for inactive or non-HTML regions.
   * @throws Propagates browser measurement and ownership-check failures.
   */
  readLayout(properties: readonly string[]): RegionLayout | undefined {
    if (!this.isActive()) {
      return undefined;
    }
    const element = this.#state.element;
    const view = element.ownerDocument.defaultView;
    if (!view || !(element instanceof view.HTMLElement)) {
      return undefined;
    }
    const { left, top, width, height } = element.getBoundingClientRect();
    const style = view.getComputedStyle(element);
    const values = Object.fromEntries(
      properties.map((property) => [property, style.getPropertyValue(property)]),
    );
    const scaleX = element.offsetWidth ? width / element.offsetWidth : 1;
    const scaleY = element.offsetHeight ? height / element.offsetHeight : 1;
    const direction = style.direction;
    return this.isActive()
      ? { bounds: { left, top, width, height }, scaleX, scaleY, direction, properties: values }
      : undefined;
  }

  /**
   * Captures style writes for this region without exposing its browser element.
   *
   * @param properties - CSS properties reserved for this session.
   * @returns A session whose final styles can be applied after detachment, or undefined when unavailable.
   * @throws Propagates region ownership checks.
   */
  captureStyles(properties: readonly string[]): InputRegionStyleSession | undefined {
    if (!this.isActive()) {
      return undefined;
    }
    const element = this.#state.element;
    const view = element.ownerDocument.defaultView;
    if (
      !view ||
      (!(element instanceof view.HTMLElement) && !(element instanceof view.SVGElement))
    ) {
      return undefined;
    }
    let owners = styleOwners.get(element);
    if (!owners) {
      owners = new Map();
      styleOwners.set(element, owners);
    }
    const capturedOwners = owners;
    const owner = {};
    const capturedProperties = new Set(properties);
    capturedProperties.forEach((property) => capturedOwners.set(property, owner));
    let active = true;
    /**
     * Applies explicit CSS property changes to the captured element.
     *
     * @param styles - Property names and values, or null to remove a property.
     * @returns The supplied changes have been applied.
     * @throws Propagates browser style mutation failures.
     */
    const apply = (styles: InputRegionStyles) => {
      for (const [name, value] of Object.entries(styles)) {
        if (!capturedProperties.has(name) || capturedOwners.get(name) !== owner) {
          continue;
        }
        if (value === null) {
          element.style.removeProperty(name);
        } else {
          element.style.setProperty(name, value);
        }
      }
    };
    return {
      set: (styles) => {
        if (active && this.isActive()) {
          apply(styles);
        }
      },
      finish: (styles) => {
        if (active) {
          active = false;
          try {
            apply(styles);
          } finally {
            capturedProperties.forEach((property) => {
              if (capturedOwners.get(property) === owner) {
                capturedOwners.delete(property);
              }
            });
          }
        }
      },
    };
  }

  /**
   * Captures one inline declaration for preview and priority-preserving restoration.
   *
   * @param property - CSS property to borrow from this mounted region.
   * @returns A session bounded to this region, or undefined when styling is unavailable.
   * @throws Propagates browser style reads and region ownership failures.
   */
  captureInlineStyle(property: string): InputInlineStyleSession | undefined {
    if (!this.isActive()) {
      return;
    }
    const element = this.#state.element;
    const view = element.ownerDocument.defaultView;
    if (
      !view ||
      (!(element instanceof view.HTMLElement) && !(element instanceof view.SVGElement))
    ) {
      return;
    }
    const original = element.style.getPropertyValue(property);
    const priority = element.style.getPropertyPriority(property);
    if (!this.isActive()) {
      return;
    }
    let owners = styleOwners.get(element);
    if (!owners) {
      owners = new Map();
      styleOwners.set(element, owners);
    }
    const owner = {};
    owners.set(property, owner);
    return createInlineStyleSession({
      element,
      property,
      original,
      priority,
      owners,
      owner,
      isCurrent: () => this.isActive(),
    });
  }

  /**
   * Reads an inline declaration while the captured region remains active.
   *
   * @param property - CSS property name to read from the region.
   * @returns The current inline value, an empty string when unset, or undefined for an inactive or unstyled region.
   * @throws Propagates browser style and ownership-check failures.
   */
  readInlineStyle(property: string): string | undefined {
    if (!this.isActive()) {
      return undefined;
    }
    const element = this.#state.element;
    const view = element.ownerDocument.defaultView;
    if (
      !view ||
      (!(element instanceof view.HTMLElement) && !(element instanceof view.SVGElement))
    ) {
      return undefined;
    }
    const value = element.style.getPropertyValue(property);
    return this.isActive() ? value : undefined;
  }

  /**
   * Requests focus on an active HTML region without scrolling.
   *
   * @returns Focus is requested only while the captured region remains owned.
   * @throws Propagates ownership checks and browser focus failures.
   */
  focus(): void {
    if (!this.isActive()) {
      return;
    }
    const { element } = this.#state;
    const HTMLElementType = element.ownerDocument.defaultView?.HTMLElement;
    if (HTMLElementType && element instanceof HTMLElementType) {
      element.focus({ preventScroll: true });
    }
  }

  /**
   * Focuses the active HTML region and places a caret near viewport coordinates.
   *
   * @param clientX - Horizontal viewport coordinate in CSS pixels.
   * @param clientY - Vertical viewport coordinate in CSS pixels.
   * @returns True when the requested caret was placed; false for stale, non-HTML, unavailable, or fallback results.
   * @throws Propagates focus, geometry, selection, and ownership failures.
   */
  placeCaretAtPoint(clientX: number, clientY: number): boolean {
    if (!this.isActive()) {
      return false;
    }
    const { element } = this.#state;
    const HTMLElementType = element.ownerDocument.defaultView?.HTMLElement;
    return Boolean(
      HTMLElementType &&
      element instanceof HTMLElementType &&
      placeCaretAtPoint(element, clientX, clientY, () => this.isActive()),
    );
  }

  /**
   * Starts an editable drag selection inside this occurrence-owned region.
   *
   * @param input - Starting pointer data and synchronous default cancellation.
   * @param onEnd - Receives notification when tracking ends or is cancelled.
   * @returns Idempotent cancellation, or undefined when the region or hit is unavailable.
   * @throws Propagates browser selection, listener, and cleanup failures.
   */
  beginEditableTextSelection(
    input: EditableTextSelectionPointer,
    onEnd: EditableTextSelectionEnd,
  ): (() => void) | undefined {
    if (!this.isActive()) {
      return;
    }
    const { element } = this.#state;
    const HTMLElementType = element.ownerDocument.defaultView?.HTMLElement;
    if (!HTMLElementType || !(element instanceof HTMLElementType)) {
      return;
    }
    return beginEditableTextSelection(element, () => this.isActive(), input, onEnd);
  }

  /**
   * Reads a current attribute only while the captured region remains owned.
   *
   * If reading synchronously ends region ownership, the value is discarded.
   *
   * @param name - Attribute to read from the region.
   * @returns Current value, or undefined if absent or the region is inactive.
   * @throws If the browser rejects the attribute name or an ownership selector.
   */
  readAttribute(name: string): string | undefined {
    if (!this.isActive()) {
      return undefined;
    }
    const value = this.#state.element.getAttribute(name);
    return this.isActive() ? (value ?? undefined) : undefined;
  }

  /**
   * Compares active browser identities in the same occurrence.
   *
   * @param other - Another captured region.
   * @returns Whether both active capabilities address the same region.
   */
  isSame(other: InputRegion): boolean {
    return (
      other instanceof BrowserInputRegion &&
      this.isActive() &&
      other.isActive() &&
      other.#state.root === this.#state.root &&
      other.#state.element === this.#state.element
    );
  }

  /**
   * Compares the live browser containment of two captured regions.
   *
   * @param other - Region captured by this browser implementation.
   * @returns Whether both regions are active and this region contains the other.
   */
  containsRegion(other: InputRegion): boolean {
    return (
      other instanceof BrowserInputRegion &&
      this.isActive() &&
      other.isActive() &&
      this.#state.element.contains(other.#state.element)
    );
  }

  /**
   * Compares document identity while both captured regions remain active.
   *
   * @param other - Region captured by this browser implementation.
   * @returns Whether both active regions belong to the same document.
   */
  isInSameDocument(other: InputRegion): boolean {
    return (
      other instanceof BrowserInputRegion &&
      this.isActive() &&
      other.isActive() &&
      this.#state.root.ownerDocument === other.#state.root.ownerDocument
    );
  }

  /**
   * Checks this region against a document retained by the browser adapter.
   *
   * @param document - Document of the other attached occurrence.
   * @returns False if this region is inactive, disconnected, or belongs elsewhere.
   * @throws Propagates the region ownership check.
   */
  isInDocument(document: Document): boolean {
    return (
      this.isActive() && this.#state.root.isConnected && this.#state.root.ownerDocument === document
    );
  }

  /**
   * Reads an attribute from the nearest matching target ancestor within this region.
   *
   * Discards the value if ownership or the target's matching ancestry changes
   * during the browser read.
   *
   * @param target - Normalized target, or null when no element target was captured.
   * @param selector - Selector identifying the nearest target ancestor.
   * @param name - Attribute to read from the matching ancestor.
   * @returns Current attribute value, or undefined when inactive, outside or absent.
   * @throws If the browser rejects an evaluated selector.
   */
  ancestorAttribute(
    target: InputTarget | null,
    selector: string,
    name: string,
  ): string | undefined {
    const source = target && inputTargets.get(target);
    const ElementType = this.#state.root.ownerDocument.defaultView?.Element;
    if (!this.isActive() || !ElementType || !(source instanceof ElementType)) {
      return undefined;
    }
    const ancestor = source.closest(selector);
    if (!ancestor || !this.#state.element.contains(ancestor)) {
      return undefined;
    }
    const value = ancestor.getAttribute(name);
    if (
      !this.isActive() ||
      !this.#state.element.contains(ancestor) ||
      source.closest(selector) !== ancestor
    ) {
      return undefined;
    }
    return value ?? undefined;
  }

  /**
   * Checks a normalized element target against the captured region.
   *
   * @param target - Captured target, or null.
   * @returns Whether the target is an element within this active region.
   */
  containsTarget(target: InputTarget | null): boolean {
    const source = target && inputTargets.get(target);
    const ElementType = this.#state.root.ownerDocument.defaultView?.Element;
    return (
      this.isActive() &&
      !!ElementType &&
      source instanceof ElementType &&
      this.#state.element.contains(source)
    );
  }

  /**
   * Changes one presentation attribute while the captured region remains owned.
   *
   * @param name - Attribute used for presentation.
   * @param enabled - Whether to add the attribute.
   * @returns The attribute is updated when ownership is valid.
   * @throws If the browser rejects the attribute name.
   */
  toggleAttribute(name: string, enabled: boolean): void {
    if (this.isActive()) {
      this.#state.element.toggleAttribute(name, enabled);
    }
  }

  /**
   * Replaces an attribute until the caller releases its captured value.
   *
   * Restoration addresses the original element even after attachment loss.
   *
   * @param name - Attribute to replace.
   * @param value - Temporary attribute value.
   * @returns Idempotent disposer restoring the remaining owner's value or the original value.
   * @throws If setting or restoring the attribute fails; AggregateError retains a failed rollback.
   */
  setTemporaryAttribute(name: string, value: string): () => void {
    if (!this.isActive()) {
      return () => {};
    }
    const element = this.#state.element;
    let attributes = attributeOwners.get(element);
    if (!attributes) {
      attributes = new Map();
      attributeOwners.set(element, attributes);
    }
    let state = attributes.get(name);
    if (!state) {
      state = { original: element.getAttribute(name), owners: [] };
      attributes.set(name, state);
    }
    const capturedAttributes = attributes;
    const capturedState = state;
    const owner = { value };
    capturedState.owners.push(owner);
    let active = true;
    /**
     * Releases this owner and restores the next value when it was the latest owner.
     *
     * @returns The latest remaining value or original value is restored when needed.
     * @throws Propagates browser attribute mutation failures.
     */
    const restore = () => {
      if (!active) {
        return;
      }
      active = false;
      const index = capturedState.owners.indexOf(owner);
      const wasLatest = index === capturedState.owners.length - 1;
      capturedState.owners.splice(index, 1);
      if (!capturedState.owners.length) {
        capturedAttributes.delete(name);
      }
      if (!wasLatest) {
        return;
      }
      const previous = capturedState.owners.at(-1)?.value ?? capturedState.original;
      if (previous === null) {
        element.removeAttribute(name);
      } else {
        element.setAttribute(name, previous);
      }
    };
    try {
      element.setAttribute(name, value);
    } catch (error) {
      try {
        restore();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Input region attribute rollback failed");
      }
      throw error;
    }
    return restore;
  }

  /**
   * Checks the attachment, owner, and nested occurrence boundary captured at input.
   *
   * @returns Whether this region still belongs to its original occurrence and owner.
   * @throws If a retained selector is rejected by the browser.
   */
  private isActive(): boolean {
    const { root, element, owner, ownerSelector, boundarySelector, isAttached } = this.#state;
    if (!isAttached()) {
      return false;
    }
    const boundary = boundarySelector ? element.closest(boundarySelector) : null;
    return (
      root.contains(element) &&
      element.closest(ownerSelector) === owner &&
      (!boundary || boundary === root)
    );
  }

  /**
   * Binds a descendant to this region's lifetime and occurrence.
   *
   * @param element - Captured descendant.
   * @param selector - Selector the descendant must continue to match.
   * @param boundarySelector - Optional occurrence boundary selector.
   * @returns Opaque descendant capability bounded by this region.
   */
  private captureDescendant(
    element: Element,
    selector: string,
    boundarySelector?: string,
  ): InputRegion {
    return new BrowserInputRegion({
      root: this.#state.root,
      element,
      owner: element,
      ownerSelector: selector,
      boundarySelector,
      isAttached: () => this.isActive() && this.#state.element.contains(element),
    });
  }
}
