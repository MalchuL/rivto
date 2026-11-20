import type {
  BrowserInputRootApi,
  BrowserInputMap,
  ClipboardWriteFormats,
  WindowInputPhase,
  DocumentAttribute,
  FocusBoundaryInputRoot,
  InputRegion,
  InputDocument,
  InputFocusOptions,
  RegionAncestorQuery,
  RegionPredicate,
  AdjacentOccurrence,
  RegionPointHit,
  RegionPointQuery,
  RegionIdentity,
  InputObserver,
} from "../../events/types";
import { writeClipboard } from "./write-clipboard";
import { suspendScrollAnchoring } from "../geometry/suspend-scroll-anchoring";
import { BrowserDocumentAttribute } from "./browser-document-attribute";
import { BrowserTextOverlay } from "../overlay/browser-text-overlay";
import { BrowserEditableText } from "../text/browser-editable-text";
import { BrowserLineOverlay } from "../overlay/browser-line-overlay";
import { BrowserPathOverlay } from "../overlay/browser-path-overlay";
import { BrowserRectangleOverlay } from "../overlay/browser-rectangle-overlay";
import type {
  LineOverlay,
  LineOverlayStyle,
  PathOverlay,
  PathOverlayStyle,
  RectangleOverlay,
  RectangleOverlayStyle,
  TextOverlay,
} from "../../overlay/types";
import type {
  DocumentScroll,
  FrameClock,
  RegionViewportBounds,
  RegionViewportSnapshot,
  WindowWheelObserver,
} from "../../geometry/types";
import { BrowserDocumentScroll } from "../geometry/browser-document-scroll";
import { BrowserFrameClock } from "../geometry/browser-frame-clock";
import { BrowserInputRegion } from "./input-region";
import { BrowserInputObserver } from "./browser-input-observer";
import { inputElementForIdentity, inputElementIdentity } from "./input-element-identity";
import { captureRegionPoint } from "./region-point";
import { BrowserInputDocument } from "./input-document";
import { releasePointerOwner } from "./pointer-ownership";
import type { InputRootOwnerCheck } from "./types";
import type {
  EditableText,
  TextHost,
  TextHostFocusResult,
  TextHostQuery,
  TextSelection,
  TextSelectionGesture,
  TextNavigationMount,
  TextSelectionPosition,
  TextSelectionQuery,
  TextOwnerObserver,
  TextOwnerScope,
  ContentViewport,
} from "../../text/types";
import { findBrowserTextHost } from "../text/find-text-host";
import { focusBrowserTextHost } from "../text/focus-text-host";
import { readBrowserTextSelection } from "../selection/read-text-selection";
import { observeBrowserTextOwners } from "../selection/observe-text-owners";
import { BrowserTextSelectionGesture } from "../selection/browser-text-selection-gesture";
import {
  adjacentBrowserTextPosition,
  verticalBrowserTextPosition,
} from "../selection/text-navigation";
import {
  findSelectionContent,
  restoreBrowserTextSelection,
} from "../selection/restore-text-selection";
import { captureBrowserTextHost } from "../text/browser-text-host";
import { captureBrowserTextOwnerScope } from "../selection/browser-text-owner-scope";
import { rememberBrowserInputRoot } from "./browser-input-root-elements";
import { BrowserInputListeners } from "./browser-input-listeners";
import { findBrowserAdjacentOccurrence } from "./adjacent-occurrence";

/** Browser operations owned by one attachment and borrowed by its input callbacks. */
export class BrowserInputRoot implements BrowserInputRootApi, FocusBoundaryInputRoot {
  #attached = true;
  readonly #element: HTMLElement;
  readonly #isCurrent?: InputRootOwnerCheck;

  /**
   * Binds capabilities to the exact element supplied at the mounting boundary.
   *
   * The mounting boundary owns the Root. Consumers borrow the same instance
   * and can capture regions with a shorter lifetime for individual operations.
   *
   * @param root - Browser element supplied by the owner of this mount.
   * @param isCurrent - Optional owner check for the mounted element. Omission keeps it active until detach.
   */
  constructor(root: HTMLElement, isCurrent?: InputRootOwnerCheck) {
    this.#element = root;
    this.#isCurrent = isCurrent;
    rememberBrowserInputRoot(this, this.#element);
  }

  /**
   * Captures this occurrence's connected document for cross-occurrence hit testing.
   *
   * @returns Document capability, or undefined when disconnected or detached.
   * @throws Propagates occurrence ownership checks.
   */
  captureDocument(): InputDocument | undefined {
    const document = new BrowserInputDocument(this.#element, () => this.isAttached());
    return document.isCurrent() ? document : undefined;
  }

  /**
   * Captures a point hit and its owner in this exact occurrence.
   *
   * @param query - Viewport coordinates and ownership selectors.
   * @returns Captured regions, or undefined when the hit or attachment is unavailable.
   * @throws Propagates hit testing, selector, and attachment-check failures.
   */
  capturePoint(query: RegionPointQuery): RegionPointHit | undefined {
    return captureRegionPoint(this.#element, query, () => this.isAttached());
  }

  /**
   * Captures an identity that still belongs to this occurrence.
   *
   * @param identity - Opaque browser element identity.
   * @param isCurrent - Optional borrower lifetime check for the captured region.
   * @returns Region capability, or undefined for missing, foreign, or detached elements.
   * @throws Propagates attachment-check failures.
   */
  captureRegionByIdentity(
    identity: RegionIdentity,
    isCurrent?: () => boolean,
  ): InputRegion | undefined {
    /**
     * Checks the attachment before and after the borrower's lifetime callback.
     *
     * @returns True only while both the Root and borrower remain current.
     * @throws Propagates attachment or borrower failures.
     */
    const active = () => this.isAttached() && (isCurrent?.() ?? true) && this.isAttached();
    if (!active()) {
      return undefined;
    }
    const element = inputElementForIdentity(identity);
    if (!element || !this.#element.contains(element) || !active()) {
      return undefined;
    }
    return new BrowserInputRegion({
      root: this.#element,
      element,
      owner: element,
      ownerSelector: "*",
      isAttached: active,
    });
  }

  /**
   * Requests focus on an owned, connected HTML region without scrolling by default.
   *
   * An optional boundary excludes nested occurrences. Focus handlers may
   * synchronously replace the attachment or move the region; such a request
   * reports false after the focus callback returns.
   *
   * @param identity - Opaque identity of the region to focus.
   * @param boundarySelector - Optional selector identifying nested occurrence boundaries.
   * @param options - Optional focus behavior; scrolling is prevented by default.
   * @returns True when focus was requested and ownership remains current; false otherwise.
   * @throws Propagates focus-option, browser focus, and ownership-check failures.
   */
  focusRegionByIdentity(
    identity: RegionIdentity,
    boundarySelector?: string,
    options?: InputFocusOptions,
  ): boolean {
    if (!this.isAttached()) {
      return false;
    }
    const preventScroll = options?.preventScroll ?? true;
    const element = inputElementForIdentity(identity);
    const view = this.#element.ownerDocument.defaultView;
    if (
      !element ||
      !view ||
      !(element instanceof view.HTMLElement) ||
      !element.isConnected ||
      !this.#element.contains(element) ||
      !this.isAttached() ||
      !element.isConnected ||
      !this.#element.contains(element)
    ) {
      return false;
    }
    const rootBoundary = boundarySelector
      ? (this.#element.closest(boundarySelector) ?? this.#element)
      : undefined;
    const boundary = boundarySelector ? element.closest(boundarySelector) : null;
    if (
      (boundary && boundary !== rootBoundary) ||
      !this.isAttached() ||
      !element.isConnected ||
      !this.#element.contains(element) ||
      (boundarySelector && element.closest(boundarySelector) !== boundary)
    ) {
      return false;
    }
    element.focus({ preventScroll });
    const currentBoundary = boundarySelector ? element.closest(boundarySelector) : null;
    return (
      this.isAttached() &&
      element.isConnected &&
      this.#element.contains(element) &&
      (!currentBoundary || currentBoundary === rootBoundary) &&
      (!boundarySelector ||
        (this.#element.closest(boundarySelector) ?? this.#element) === rootBoundary)
    );
  }

  /**
   * Captures a connected editable host without exposing its browser element.
   *
   * @param identity - Opaque identity supplied by the mounting boundary.
   * @param boundarySelector - Selector identifying nested occurrences.
   * @returns Editing capability, or undefined when the host is unavailable or foreign.
   * @throws Propagates selector and ownership-check failures.
   */
  captureEditableTextByIdentity(
    identity: RegionIdentity,
    boundarySelector: string,
  ): EditableText | undefined {
    const element = inputElementForIdentity(identity);
    const view = this.#element.ownerDocument.defaultView;
    if (!element || !view || !(element instanceof view.HTMLElement) || !this.isAttached()) {
      return undefined;
    }
    const target = new BrowserEditableText(this.#element, element, identity, boundarySelector, () =>
      this.isAttached(),
    );
    return target.isCurrent() ? target : undefined;
  }

  /**
   * Captures the matching owner of focus, optionally excluding nested occurrences.
   *
   * @param selector - Selector identifying the focused target's owner.
   * @param boundarySelector - Optional selector identifying nested occurrences to exclude.
   * @returns Focus-bound owner region, or undefined when detached, outside this occurrence, or without a matching owner.
   * @throws Propagates browser focus, selector, and ownership failures.
   */
  captureFocusedRegion(selector: string, boundarySelector?: string): InputRegion | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    const root = this.#element;
    const document = root.ownerDocument;
    const focused = document.activeElement;
    if (!focused || !root.contains(focused)) {
      return undefined;
    }
    const boundary = boundarySelector ? focused.closest(boundarySelector) : null;
    if (boundary && boundary !== root && root.contains(boundary)) {
      return undefined;
    }
    const owner = focused.closest(selector);
    if (!owner || !root.contains(owner)) {
      return undefined;
    }
    return this.captureRegionByIdentity(inputElementIdentity(owner), () => {
      const currentBoundary = boundarySelector ? focused.closest(boundarySelector) : null;
      return (
        root.ownerDocument === document &&
        document.activeElement === focused &&
        root.contains(focused) &&
        focused.closest(selector) === owner &&
        (!currentBoundary || currentBoundary === root || !root.contains(currentBoundary))
      );
    });
  }

  /**
   * Temporarily replaces an attribute on this occurrence's mounted element.
   *
   * Cleanup restores the remaining owner's value or the original value even
   * after detachment, without overwriting a newer owner.
   *
   * @param name - Attribute to replace on the occurrence.
   * @param value - Value retained until the cleanup runs.
   * @returns Idempotent cleanup, or a no-op when detached.
   * @throws Propagates mutation or cleanup failures; AggregateError retains a failed rollback.
   */
  setTemporaryAttribute(name: string, value: string): () => void {
    return new BrowserInputRegion({
      root: this.#element,
      element: this.#element,
      owner: this.#element,
      ownerSelector: "*",
      isAttached: () => this.isAttached(),
    }).setTemporaryAttribute(name, value);
  }

  /**
   * Reads the current dimensions of the occurrence's browser viewport.
   *
   * A document move or detachment during the read discards the captured dimensions.
   *
   * @returns Width and height in CSS pixels, or undefined when detached or windowless.
   * @throws Propagates browser window and attachment-check failures.
   */
  readViewport(): ContentViewport | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    const document = this.#element.ownerDocument;
    const view = document.defaultView;
    if (!view) {
      return undefined;
    }
    const viewport = { width: view.innerWidth, height: view.innerHeight };
    return this.isAttached() && this.#element.ownerDocument === document ? viewport : undefined;
  }

  /**
   * Creates a caller-owned observer whose groups share dispatch identity.
   *
   * The observer borrows this Root and remains the caller's cleanup responsibility
   * after detachment.
   *
   * @returns An attached observer, or undefined when this Root is detached.
   * @throws Propagates browser listener attachment and rollback failures.
   */
  createInputObserver(): InputObserver | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    return new BrowserInputObserver(this);
  }

  /**
   * Observes normalized bubbling input on this occurrence and its nested surfaces.
   *
   * The caller owns the returned subscription, including after Root detachment.
   *
   * @param type - Input name to observe on the occurrence.
   * @param observer - Receives normalized input during its browser delivery.
   * @returns Idempotent listener cleanup, or undefined if the occurrence is detached.
   * @throws Propagates attachment, browser listener installation, and disposer failures.
   */
  observeInput<K extends keyof BrowserInputMap>(
    type: K,
    observer: (input: BrowserInputMap[K]) => void,
  ): (() => void) | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    const listeners = new BrowserInputListeners({ ownsRoot: false });
    listeners.register({ type, target: "root", capture: false }, observer);
    return listeners.attach(this);
  }

  /**
   * Creates a line overlay bound to this occurrence without exposing its element.
   *
   * @param style - CSS class and thickness used to present the line.
   * @returns An uncreated line that can still be removed after detachment.
   */
  createLineOverlay(style: LineOverlayStyle): LineOverlay {
    return new BrowserLineOverlay(this.#element, style, () => this.isAttached());
  }

  /**
   * Creates a document path bound to this occurrence without exposing its element.
   *
   * @param style - CSS class and data markers used to present the path.
   * @returns An uncreated overlay that can be removed after detachment.
   */
  createPathOverlay(style: PathOverlayStyle): PathOverlay {
    return new BrowserPathOverlay(this.#element, style, () => this.isAttached());
  }

  /**
   * Creates a document rectangle bound to this occurrence without exposing its element.
   *
   * @param style - CSS class and data markers used to present the rectangle.
   * @returns An uncreated overlay that can still be removed after detachment.
   */
  createRectangleOverlay(style: RectangleOverlayStyle): RectangleOverlay {
    return new BrowserRectangleOverlay(this.#element, style, () => this.isAttached());
  }

  /**
   * Creates a text overlay bound to this occurrence without exposing its element.
   *
   * @returns An uncreated overlay that can still be removed after detachment.
   */
  createTextOverlay(): TextOverlay {
    return new BrowserTextOverlay(this.#element, () => this.isAttached());
  }

  /**
   * Captures a document attribute without transferring document ownership.
   *
   * Its removal remains bound to the captured document after detachment.
   *
   * @param name - Attribute on the document element.
   * @returns Capability for an active write and conditional later cleanup.
   */
  captureDocumentAttribute(name: string): DocumentAttribute {
    const document = this.#element.ownerDocument;
    return new BrowserDocumentAttribute(
      document,
      name,
      () => this.isConnected() && this.#element.ownerDocument === document,
    );
  }

  /**
   * Captures the currently focused editable in this exact occurrence.
   *
   * @param selector - Selector the focused host must match.
   * @param boundarySelector - Selector identifying nested occurrences.
   * @returns Captured host, or undefined if focus or attachment changed during capture.
   * @throws If the browser rejects a selector or an attachment check fails.
   */
  captureFocusedTextHost(selector: string, boundarySelector: string): TextHost | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    const focused = this.#element.ownerDocument.activeElement;
    const HTMLElementType = this.#element.ownerDocument.defaultView?.HTMLElement;
    if (!HTMLElementType || !(focused instanceof HTMLElementType) || !focused.matches(selector)) {
      return undefined;
    }
    const host = captureBrowserTextHost(
      focused,
      this.#element,
      boundarySelector,
      () => this.isAttached() && this.#element.ownerDocument.activeElement === focused,
    );
    return this.isAttached() && this.#element.ownerDocument.activeElement === focused
      ? host
      : undefined;
  }

  /**
   * Finds a rendered content host inside this active occurrence.
   *
   * @param query - Selectors and owner identity defining the host to locate.
   * @returns Captured host, or undefined when detached or no eligible host exists.
   * @throws If the browser rejects an evaluated selector or ownership check.
   */
  findTextHost(query: TextHostQuery): TextHost | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    const host = findBrowserTextHost(this.#element, query);
    return this.isAttached() ? host : undefined;
  }

  /**
   * Focuses the first matching owned text host and restores a collapsed caret.
   *
   * Both the caller's attachment and this Root must remain current, including
   * after focus invokes synchronous browser or application callbacks.
   *
   * @param query - Owner identity and selectors for the content host.
   * @param offset - Requested UTF-16 text offset.
   * @param isCurrent - Checks whether the caller still owns the operation.
   * @returns The focus outcome, including missing owner, content, and attachment.
   * @throws Propagates selector, attachment, focus, and range failures.
   */
  focusTextHost(
    query: TextHostQuery,
    offset: number,
    isCurrent: () => boolean,
  ): TextHostFocusResult {
    return focusBrowserTextHost(
      this.#element,
      query,
      offset,
      () => this.isAttached() && isCurrent(),
    );
  }

  /**
   * Reads both directed text endpoints without exposing browser nodes.
   *
   * @param query - Selectors identifying content, its owner, and occurrence boundaries.
   * @returns Portable endpoints, or undefined when either endpoint or attachment is unavailable.
   * @throws Propagates selector, ownership, and browser selection access failures.
   */
  readTextSelection(query: TextSelectionQuery): TextSelection | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    const selection = readBrowserTextSelection(this.#element, query);
    return this.isAttached() ? selection : undefined;
  }

  /**
   * Observes current focus and text-selection owners while this Root is attached.
   *
   * @param query - Selectors identifying content, owners, and occurrence boundaries.
   * @param observer - Receives unique current owner identities on each observation.
   * @returns Idempotent disposer removing the browser listeners.
   * @throws Propagates installation, inspection, observer, and disposer failures.
   */
  observeTextOwners(query: TextSelectionQuery, observer: TextOwnerObserver): () => void {
    return observeBrowserTextOwners(this.#element, query, observer, () => this.isAttached());
  }

  /**
   * Reads the length of one occurrence-owned rendered content host.
   *
   * @param query - Owner identity and selectors identifying its content.
   * @returns UTF-16 length, or undefined when detached or no matching host exists.
   * @throws Propagates selector and ownership failures.
   */
  readTextLength(query: TextHostQuery): number | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    const content = findSelectionContent(this.#element, query, query.ownerValue);
    const length = content?.textContent?.length;
    return this.isAttached() ? length : undefined;
  }

  /**
   * Restores a directed browser range while this occurrence and its caller remain current.
   *
   * @param query - Selectors identifying content, owners, and occurrence boundaries.
   * @param selection - Directed owner identities and UTF-16 offsets.
   * @param mountMissing - Requests mounting of an absent owner.
   * @param isCurrent - Checks the originating caller attachment.
   * @returns Whether both endpoints were resolved and restoration was requested.
   * @throws Propagates mounting, selector, focus, and browser range failures.
   */
  restoreTextSelection(
    query: TextSelectionQuery,
    selection: TextSelection,
    mountMissing: (ownerId: string) => void,
    isCurrent: () => boolean,
  ): boolean {
    return restoreBrowserTextSelection(
      this.#element,
      query,
      selection,
      mountMissing,
      () => this.isAttached() && isCurrent(),
    );
  }

  /**
   * Creates a pointer gesture retaining native text points inside this adapter.
   *
   * @param query - Selectors identifying content, owners, and occurrence boundaries.
   * @param mountMissing - Requests synchronous mounting of an absent owner.
   * @param isCurrent - Checks the caller's originating attachment.
   * @returns Gesture bound to both this Root and the caller's attachment.
   */
  createTextSelectionGesture(
    query: TextSelectionQuery,
    mountMissing: (ownerId: string) => void,
    isCurrent: () => boolean,
  ): TextSelectionGesture {
    return new BrowserTextSelectionGesture(
      this.#element,
      query,
      mountMissing,
      () => this.isAttached() && isCurrent(),
    );
  }

  /**
   * Finds the immediately adjacent content owner within a local navigation scope.
   *
   * @param query - Selectors identifying content, owners, and boundaries.
   * @param ownerId - Current rendered owner identity.
   * @param direction - Previous or next rendered owner.
   * @param scopeSelector - Selector identifying an optional local boundary.
   * @param mountAdjacent - Requests mounting of an offscreen neighbor.
   * @param isCurrent - Checks the originating caller attachment.
   * @returns Adjacent owner and edge offset, or undefined when unavailable.
   * @throws Propagates browser selector and host mounting failures.
   */
  adjacentTextPosition(
    query: TextSelectionQuery,
    ownerId: string,
    direction: "left" | "right",
    scopeSelector: string,
    mountAdjacent: TextNavigationMount,
    isCurrent: () => boolean,
  ): TextSelectionPosition | undefined {
    return adjacentBrowserTextPosition(
      this.#element,
      query,
      ownerId,
      direction,
      scopeSelector,
      mountAdjacent,
      () => this.isAttached() && isCurrent(),
    );
  }

  /**
   * Captures the local scope containing an owner, falling back to this occurrence.
   *
   * The captured scope remains fixed if the owner is removed during an edit.
   *
   * @param query - Selectors identifying owners, content, and occurrence boundaries.
   * @param ownerId - Exact identity of the owner used to select the local scope.
   * @param scopeSelector - Selector identifying an optional local scope.
   * @returns Scope capabilities, or undefined when this occurrence detaches.
   * @throws Propagates selector, attribute, and attachment-check failures.
   */
  captureTextOwnerScope(
    query: TextSelectionQuery,
    ownerId: string,
    scopeSelector: string,
  ): TextOwnerScope | undefined {
    return captureBrowserTextOwnerScope(this.#element, query, ownerId, scopeSelector, () =>
      this.isAttached(),
    );
  }

  /**
   * Finds the immediate neighboring top-level occurrence in this document.
   *
   * The capability is bounded by this attachment and destination membership in
   * the captured document; destination registration is checked by its owner.
   *
   * @param selector - Selector identifying occurrences in document order.
   * @param direction - Whether to find the previous or next occurrence.
   * @returns Adjacent occurrence, or undefined when absent or detached.
   * @throws Propagates selector and attachment-check failures.
   */
  findAdjacentOccurrence(
    selector: string,
    direction: "previous" | "next",
  ): AdjacentOccurrence | undefined {
    return findBrowserAdjacentOccurrence(this.#element, selector, direction, () =>
      this.isAttached(),
    );
  }

  /**
   * Resolves a vertical caret destination using rendered visual lines.
   *
   * @param query - Selectors identifying content, owners, and boundaries.
   * @param position - Current owner identity and UTF-16 caret offset.
   * @param direction - Previous or next visual line.
   * @param mountAdjacent - Requests mounting of an offscreen neighbor.
   * @param isCurrent - Checks the originating caller attachment.
   * @returns Nearest visual-line position, or undefined when unavailable.
   * @throws Propagates browser measurement and host mounting failures.
   */
  verticalTextPosition(
    query: TextSelectionQuery,
    position: TextSelectionPosition,
    direction: "up" | "down",
    mountAdjacent: TextNavigationMount,
    isCurrent: () => boolean,
  ): TextSelectionPosition | undefined {
    return verticalBrowserTextPosition(
      this.#element,
      query,
      position,
      direction,
      mountAdjacent,
      () => this.isAttached() && isCurrent(),
    );
  }

  /**
   * Compares a browser element with the element owned by this occurrence.
   *
   * @param element - Browser element to compare with the mounting element.
   * @returns Whether it is the element bound to this capability.
   */
  isForElement(element: Element): boolean {
    return this.#element === element;
  }

  /**
   * Changes whether the mounted occurrence is inert to browser interaction.
   *
   * @param inert - True disables focus and interaction for this occurrence's subtree.
   * @returns The browser surface is updated only while this Root is attached.
   * @throws Propagates attachment checks and browser property failures.
   */
  setInert(inert: boolean): void {
    if (this.isAttached()) {
      this.#element.inert = inert;
    }
  }

  /**
   * Sets an attribute on this Root's mounted occurrence.
   *
   * @param name - Browser attribute name to set.
   * @param value - String value retained on the mounted element.
   * @returns The attribute is updated only while this Root is attached.
   * @throws Propagates attachment checks and browser attribute failures.
   */
  setAttribute(name: string, value: string): void {
    if (this.isAttached()) {
      this.#element.setAttribute(name, value);
    }
  }

  /**
   * Identifies the mounted element independently of attachment lifetime.
   *
   * @returns Opaque identity shared by roots attached to the same element.
   */
  getElementIdentity(): RegionIdentity {
    return inputElementIdentity(this.#element);
  }

  /**
   * Identifies the nearest matching ancestor outside this occurrence's surface.
   *
   * The identity describes an element, not an attachment. Detached occurrences
   * do not resolve an ancestor, including after the same element is remounted.
   *
   * @param selector - Selector identifying an enclosing surface.
   * @returns Its opaque identity, or undefined when detached or no ancestor matches.
   * @throws If the selector or the attachment owner check fails.
   */
  getParentIdentity(selector: string): object | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    const parent = this.#element.parentElement?.closest(selector);
    return parent && this.isAttached() ? inputElementIdentity(parent) : undefined;
  }

  /**
   * Releases document pointer ownership only when this element owns the gesture.
   *
   * @returns Another occurrence's pointer owner is left untouched.
   */
  releasePointerOwnership(): void {
    releasePointerOwner(this.#element.ownerDocument, this.getElementIdentity());
  }

  /**
   * Checks whether this capability's exact attachment is still active.
   *
   * An owner check can temporarily reject operations while a replacement is
   * being installed. A released attachment cannot be reactivated. An owner
   * callback may detach the Root synchronously, so read the attachment flag
   * again after the callback returns.
   *
   * @returns False after release or while the owner reports that the mount is inactive.
   * @throws Propagates failures from the owner check.
   */
  isAttached(): boolean {
    return this.#attached && (this.#isCurrent?.() ?? true) && this.#attached;
  }

  /**
   * Reads a current surface attribute without exposing the mounting element.
   *
   * If reading synchronously replaces the attachment, the value is discarded.
   *
   * @param name - Attribute name on the bound surface.
   * @returns Current value, including an empty string, or undefined when absent or detached.
   * @throws If the browser rejects the attribute name or the owner check fails.
   */
  readAttribute(name: string): string | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    const value = this.#element.getAttribute(name);
    return this.isAttached() ? (value ?? undefined) : undefined;
  }

  /**
   * Captures matching regions inside this occurrence and outside nested boundaries.
   *
   * @param selector - Selector for descendant regions.
   * @param boundarySelector - Selector identifying occurrence boundaries.
   * @returns Regions in document order, or an empty list when detached.
   * @throws If the browser rejects an evaluated selector.
   */
  findRegions(selector: string, boundarySelector: string): readonly InputRegion[] {
    if (!this.isAttached()) {
      return [];
    }
    const root = this.#element;
    return Array.from(root.querySelectorAll(selector))
      .filter((element) => element.closest(boundarySelector) === root)
      .map(
        (element) =>
          new BrowserInputRegion({
            root,
            element,
            owner: element,
            ownerSelector: selector,
            boundarySelector,
            isAttached: () => this.isAttached(),
          }),
      );
  }

  /**
   * Visits occurrence-owned matching regions without another matching ancestor.
   *
   * @param selector - Selector identifying candidate regions and their ancestors.
   * @param boundarySelector - Selector identifying occurrence boundaries.
   * @param predicate - Synchronous test for each top-level region.
   * @returns Whether a region matched, or undefined if ownership changes during the walk.
   * @throws Propagates selector, predicate, and ownership failures.
   */
  someTopLevelRegion(
    selector: string,
    boundarySelector: string,
    predicate: RegionPredicate,
  ): boolean | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    const root = this.#element;
    const occurrenceBoundary = root.closest(boundarySelector) ?? root;
    for (const element of root.querySelectorAll(selector)) {
      const boundary = element.closest(boundarySelector);
      if (boundary && boundary !== occurrenceBoundary) {
        continue;
      }
      const parent = element.parentElement?.closest(selector);
      if (parent && root.contains(parent)) {
        continue;
      }
      const region = new BrowserInputRegion({
        root,
        element,
        owner: element,
        ownerSelector: selector,
        isAttached: () => {
          const currentBoundary = element.closest(boundarySelector);
          return this.isAttached() && (!currentBoundary || currentBoundary === occurrenceBoundary);
        },
      });
      const matched = predicate(region);
      const currentParent = element.parentElement?.closest(selector);
      const currentBoundary = element.closest(boundarySelector);
      if (
        !this.isAttached() ||
        !root.contains(element) ||
        !element.matches(selector) ||
        (currentBoundary && currentBoundary !== occurrenceBoundary) ||
        (currentParent && root.contains(currentParent))
      ) {
        return undefined;
      }
      if (matched) {
        return true;
      }
    }
    return this.isAttached() ? false : undefined;
  }

  /**
   * Captures the first directly owned region for each requested attribute value.
   *
   * @param attribute - Attribute identifying candidate regions.
   * @param values - Exact values to find; missing values are ignored.
   * @param boundarySelector - Selector identifying occurrence boundaries.
   * @returns Matching regions in document order, or an empty list when detached.
   * @throws Propagates selector and ownership failures.
   */
  findRegionsByAttribute(
    attribute: string,
    values: readonly string[],
    boundarySelector: string,
  ): readonly InputRegion[] {
    if (!this.isAttached() || !values.length) {
      return [];
    }
    const root = this.#element;
    const selector = `[${CSS.escape(attribute)}]`;
    const remaining = new Set(values);
    const result: InputRegion[] = [];
    for (const element of root.querySelectorAll(selector)) {
      const value = element.getAttribute(attribute);
      if (value === null || !remaining.has(value) || element.closest(boundarySelector) !== root) {
        continue;
      }
      if (!this.isAttached()) {
        return [];
      }
      remaining.delete(value);
      result.push(
        new BrowserInputRegion({
          root,
          element,
          owner: element,
          ownerSelector: selector,
          boundarySelector,
          isAttached: () => this.isAttached(),
        }),
      );
      if (!remaining.size) {
        break;
      }
    }
    return this.isAttached() ? result : [];
  }

  /**
   * Finds an exact attribute value inside this occurrence without entering nested occurrences.
   *
   * @param attribute - Attribute identifying candidate regions.
   * @param value - Exact attribute value to find.
   * @param boundarySelector - Selector identifying occurrence boundaries.
   * @returns True if a match remains owned; false when missing or detached.
   * @throws Propagates selector evaluation and attachment-check failures.
   */
  hasRegionByAttribute(attribute: string, value: string, boundarySelector: string): boolean {
    if (!this.isAttached()) {
      return false;
    }
    const root = this.#element;
    const selector = `[${CSS.escape(attribute)}="${CSS.escape(value)}"]`;
    for (const element of root.querySelectorAll(selector)) {
      if (
        element.closest(boundarySelector) === root &&
        this.isAttached() &&
        root.contains(element) &&
        element.getAttribute(attribute) === value &&
        element.closest(boundarySelector) === root &&
        this.isAttached()
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks the first occurrence-owned region with the given identity for an ancestor.
   *
   * Identity is compared as an attribute value so it need not be escaped as CSS.
   * Nested occurrences are excluded and detachment discards the result.
   *
   * @param query - Region identity, ancestor selector, and occurrence boundary.
   * @returns False when the region or its ancestor is absent or the Root detaches.
   * @throws Propagates browser selector, attribute, and attachment-check failures.
   */
  hasRegionAncestor(query: RegionAncestorQuery): boolean {
    if (!this.isAttached()) {
      return false;
    }
    const root = this.#element;
    const boundary = root.closest(query.boundarySelector) ?? root;
    for (const region of root.querySelectorAll(query.regionSelector)) {
      const regionBoundary = region.closest(query.boundarySelector);
      if (
        region.getAttribute(query.identityAttribute) !== query.identity ||
        (regionBoundary && regionBoundary !== boundary)
      ) {
        continue;
      }
      const ancestor = region.parentElement?.closest(query.ancestorSelector);
      const ancestorBoundary = ancestor?.closest(query.boundarySelector);
      return Boolean(
        ancestor && (!ancestorBoundary || ancestorBoundary === boundary) && this.isAttached(),
      );
    }
    return false;
  }

  /**
   * Measures the first matching descendant's top relative to the viewport.
   *
   * Nested occurrence descendants are included; detachment during lookup or
   * measurement discards the result.
   *
   * @param attribute - Attribute identifying candidate regions.
   * @param value - Exact attribute value of the desired region.
   * @returns Viewport top in CSS pixels, or undefined when missing or detached.
   * @throws Propagates selector evaluation, measurement, and attachment-check failures.
   */
  readRegionViewportTop(attribute: string, value: string): number | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    const element = this.#element.querySelector<HTMLElement>(
      `[${attribute}="${CSS.escape(value)}"]`,
    );
    if (!this.isAttached()) {
      return undefined;
    }
    const top = element?.getBoundingClientRect().top;
    return this.isAttached() ? top : undefined;
  }

  /**
   * Reads unique matching descendant attribute values in document order.
   *
   * Nested occurrence descendants are included and detachment discards the read.
   *
   * @param attribute - Attribute identifying candidate regions.
   * @param values - Values to include; empty or absent attributes are ignored.
   * @returns Unique matching values, or an empty list when detached or unmatched.
   * @throws Propagates selector evaluation and attachment-check failures.
   */
  readRegionValues(attribute: string, values: readonly string[]): readonly string[] {
    if (!this.isAttached()) {
      return [];
    }
    const selected = new Set(values);
    const found = new Set<string>();
    for (const element of this.#element.querySelectorAll(`[${attribute}]`)) {
      const value = element.getAttribute(attribute);
      if (value && selected.has(value)) {
        found.add(value);
      }
    }
    return this.isAttached() ? [...found] : [];
  }

  /**
   * Measures matching descendant regions relative to the viewport.
   *
   * Nested occurrence descendants and duplicate values remain in DOM order.
   * Detachment during the read discards the complete snapshot.
   *
   * @param attribute - Attribute identifying candidate regions.
   * @param values - Values to measure; empty or absent attributes are ignored.
   * @returns Viewport height and matching bounds, or undefined when detached.
   * @throws Propagates selector evaluation, measurement, and attachment-check failures.
   */
  measureRegionViewportBounds(
    attribute: string,
    values: readonly string[],
  ): RegionViewportSnapshot | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    const selected = new Set(values);
    const regions: RegionViewportBounds[] = [];
    const viewportHeight = this.#element.ownerDocument.defaultView?.innerHeight ?? 0;
    for (const element of this.#element.querySelectorAll(`[${attribute}]`)) {
      const value = element.getAttribute(attribute);
      if (!value || !selected.has(value)) {
        continue;
      }
      if (!this.isAttached()) {
        return undefined;
      }
      const { top, bottom, height } = element.getBoundingClientRect();
      regions.push({ value, top, bottom, height });
    }
    return this.isAttached() ? { viewportHeight, regions } : undefined;
  }

  /**
   * Captures the current document's scrolling element without exposing it.
   *
   * The capability remains bound to that element and stops adjusting it when
   * the Root detaches or moves to another document.
   *
   * @returns Scroll adjustment capability, or undefined when unavailable or detached.
   * @throws Propagates browser document access and attachment-check failures.
   */
  captureDocumentScroll(): DocumentScroll | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    const document = this.#element.ownerDocument;
    const element = document.scrollingElement;
    if (!element || !this.isAttached() || this.#element.ownerDocument !== document) {
      return undefined;
    }
    return new BrowserDocumentScroll(
      element,
      () => this.isAttached() && this.#element.ownerDocument === document && this.isAttached(),
    );
  }

  /**
   * Observes normalized input in the occurrence's captured window.
   *
   * @param type - Root-supported input name to observe.
   * @param phase - Capture or bubble phase of the window listener.
   * @param observer - Receives normalized input during its browser delivery.
   * @returns Idempotent listener cleanup, or a no-op when the occurrence has no window.
   * @throws Propagates listener setup, observation, and cleanup failures.
   */
  observeWindowInput<K extends keyof BrowserInputMap>(
    type: K,
    phase: WindowInputPhase,
    observer: (input: BrowserInputMap[K]) => void,
  ): () => void {
    const document = this.#element.ownerDocument;
    if (!this.isAttached() || !document.defaultView) {
      return () => {};
    }
    const listeners = new BrowserInputListeners({ ownsRoot: false });
    listeners.register({ type, target: "window", capture: phase === "capture" }, (input) => {
      if (this.isAttached() && this.#element.ownerDocument === document && this.isAttached()) {
        observer(input);
      }
    });
    if (!this.isAttached() || this.#element.ownerDocument !== document) {
      return () => {};
    }
    return listeners.attach(this);
  }

  /**
   * Observes normalized input in the occurrence's captured document.
   *
   * @param type - Root-supported input name to observe.
   * @param phase - Capture or bubble phase of the document listener.
   * @param observer - Receives normalized input during its browser delivery.
   * @returns Idempotent listener cleanup, or a no-op when the Root is detached.
   * @throws Propagates listener setup, observation, and cleanup failures.
   */
  observeDocumentInput<K extends keyof BrowserInputMap>(
    type: K,
    phase: "capture" | "bubble",
    observer: (input: BrowserInputMap[K]) => void,
  ): () => void {
    const document = this.#element.ownerDocument;
    if (!this.isAttached()) {
      return () => {};
    }
    const listeners = new BrowserInputListeners({ ownsRoot: false });
    listeners.register({ type, target: "document", capture: phase === "capture" }, (input) => {
      if (this.isAttached() && this.#element.ownerDocument === document && this.isAttached()) {
        observer(input);
      }
    });
    if (!this.isAttached() || this.#element.ownerDocument !== document) {
      return () => {};
    }
    return listeners.attach(this);
  }

  /**
   * Writes clipboard data through the current occurrence's browser document.
   *
   * @param formats - Clipboard strings and asynchronous format selection.
   * @returns A promise resolving when the browser accepts the data.
   * @throws If the occurrence is detached or the browser write fails.
   */
  writeClipboard(formats: ClipboardWriteFormats): Promise<void> {
    if (!this.isAttached()) {
      throw new Error("The input Root is no longer attached");
    }
    return writeClipboard(this.#element.ownerDocument, formats);
  }

  /**
   * Observes vertical wheel movement anywhere in this occurrence's window.
   *
   * Deltas retain browser-reported units. Detachment or a document move stops
   * delivery; the disposer still removes the original window listener.
   *
   * @param observer - Receives each vertical delta without a browser event.
   * @returns Idempotent disposer removing this passive observation.
   * @throws Propagates listener installation, delivery, and cleanup failures.
   */
  observeWindowWheel(observer: WindowWheelObserver): () => void {
    if (!this.isAttached()) {
      return () => {};
    }
    const document = this.#element.ownerDocument;
    const view = document.defaultView;
    if (!view || !this.isAttached() || this.#element.ownerDocument !== document) {
      return () => {};
    }
    let active = true;
    /**
     * Delivers browser-reported wheel movement while the captured Root remains current.
     *
     * @param event - Browser wheel delivery on the captured window.
     * @returns The observer receives the vertical delta when the occurrence remains active.
     * @throws Propagates attachment checks and observer failures.
     */
    const listener = (event: WheelEvent) => {
      if (active && this.isAttached() && this.#element.ownerDocument === document) {
        const deltaY = event.deltaY;
        if (active && this.isAttached() && this.#element.ownerDocument === document) {
          observer(deltaY);
        }
      }
    };
    /**
     * Removes this exact window listener once.
     *
     * @returns The captured listener has been offered removal.
     * @throws Propagates browser listener removal failures.
     */
    const dispose = () => {
      if (active) {
        active = false;
        view.removeEventListener("wheel", listener);
      }
    };
    try {
      view.addEventListener("wheel", listener, { passive: true });
      return dispose;
    } catch (error) {
      try {
        dispose();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Window wheel observation setup failed");
      }
      throw error;
    }
  }

  /**
   * Captures frame timing and scheduling for this occurrence's window.
   *
   * Accepted callbacks can run after detachment so their owner can clean up.
   * New requests and clock reads stop when the Root or document changes.
   *
   * @returns Frame clock, or undefined when detached or no window is available.
   * @throws Propagates browser document access and attachment-check failures.
   */
  captureFrameClock(): FrameClock | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    const document = this.#element.ownerDocument;
    const view = document.defaultView;
    if (!view || !this.isAttached() || this.#element.ownerDocument !== document) {
      return undefined;
    }
    return new BrowserFrameClock(
      view,
      () => this.isAttached() && this.#element.ownerDocument === document && this.isAttached(),
    );
  }

  /**
   * Scrolls the first matching region owned by this occurrence to its nearest edge.
   *
   * Matching nested occurrences are skipped, and an ownership change during
   * lookup prevents scrolling a region from the previous attachment.
   *
   * @param attribute - Attribute identifying candidate regions.
   * @param value - Exact value of the attribute to match.
   * @param boundarySelector - Selector identifying occurrence boundaries.
   * @returns The first owned match is scrolled when the occurrence remains attached.
   * @throws If selector evaluation, ownership checks, or browser scrolling fail.
   */
  scrollFirstMatchingRegionIntoView(
    attribute: string,
    value: string,
    boundarySelector: string,
  ): void {
    if (!this.isAttached()) {
      return;
    }
    const root = this.#element;
    const boundary = root.closest(boundarySelector) ?? root;
    const matches = root.querySelectorAll(`[${CSS.escape(attribute)}="${CSS.escape(value)}"]`);
    for (const region of matches) {
      const owner = region.closest(boundarySelector) ?? boundary;
      if (!root.contains(region) || owner !== boundary) {
        continue;
      }
      if (
        this.isAttached() &&
        root.contains(region) &&
        (region.closest(boundarySelector) ?? boundary) === boundary &&
        (root.closest(boundarySelector) ?? root) === boundary
      ) {
        region.scrollIntoView({ block: "nearest" });
      }
      return;
    }
  }

  /**
   * Temporarily disables browser scroll anchoring for this occurrence.
   *
   * @returns Idempotent cleanup restoring the original style after the last owner.
   * @throws Propagates attachment checks and browser style failures.
   */
  suspendScrollAnchoring(): () => void {
    return suspendScrollAnchoring(this.#element, () => this.isAttached());
  }

  /**
   * Checks whether the current occurrence is connected to its document.
   *
   * @returns False when detached, replaced, or disconnected from the document.
   * @throws Propagates attachment owner-check failures.
   */
  isConnected(): boolean {
    return this.isAttached() && this.#element.isConnected;
  }

  /**
   * Compares this connected attachment's document with a browser input region.
   *
   * @param region - Borrowed region whose attachment must also remain active.
   * @returns False if either occurrence is disconnected, replaced, or in another document.
   * @throws Propagates attachment and region ownership checks.
   */
  isInSameDocument(region: InputRegion): boolean {
    if (!this.isConnected() || !(region instanceof BrowserInputRegion)) {
      return false;
    }
    const document = this.#element.ownerDocument;
    return (
      region.isInDocument(document) &&
      this.isConnected() &&
      this.#element.ownerDocument === document
    );
  }

  /**
   * Checks whether the document of the active occurrence owns browser focus.
   *
   * @returns False when detached or when the document lacks focus.
   * @throws Propagates owner-check and browser focus inspection failures.
   */
  isDocumentFocused(): boolean {
    return this.isAttached() && this.#element.ownerDocument.hasFocus();
  }

  /**
   * Checks the live browser focus against this occurrence's surface.
   *
   * Descendants, including nested editor elements, count as inside the surface.
   * A detached or temporarily replaced attachment reports false.
   *
   * @returns Whether the attached surface or a descendant has focus.
   * @throws Propagates owner check or browser focus inspection failures.
   */
  hasFocus(): boolean {
    if (!this.isAttached()) {
      return false;
    }
    const active = this.#element.ownerDocument.activeElement;
    return active !== null && (active === this.#element || this.#element.contains(active));
  }

  /**
   * Checks focus in this occurrence while excluding nested matching boundaries.
   *
   * @param boundarySelector - Selector identifying independently owned occurrences.
   * @returns True when the active element belongs directly to this attached occurrence.
   * @throws If the browser rejects the selector or an attachment check fails.
   */
  hasFocusWithin(boundarySelector: string): boolean {
    if (!this.isAttached()) {
      return false;
    }
    const active = this.#element.ownerDocument.activeElement;
    const ElementType = this.#element.ownerDocument.defaultView?.Element;
    if (!ElementType || !(active instanceof ElementType) || !this.#element.contains(active)) {
      return false;
    }
    const boundary = active.closest(boundarySelector);
    return (
      (!boundary || boundary === this.#element) &&
      this.isAttached() &&
      this.#element.ownerDocument.activeElement === active
    );
  }

  /**
   * Checks whether the surface itself, rather than a descendant, has focus.
   *
   * A detached or temporarily replaced attachment reports false.
   *
   * @returns Whether the attached surface is the document's focused element.
   * @throws Propagates owner check or browser focus inspection failures.
   */
  isFocused(): boolean {
    return this.isAttached() && this.#element.ownerDocument.activeElement === this.#element;
  }

  /**
   * Clears browser selection ranges in this occurrence's document.
   *
   * The document selection is unchanged after this attachment is released.
   *
   * @returns Existing browser ranges have been removed when selection is available.
   * @throws Propagates owner check, browser selection access, or range-removal failures.
   */
  clearSelection(): void {
    if (this.isAttached()) {
      this.#element.ownerDocument.getSelection()?.removeAllRanges();
    }
  }

  /**
   * Requests focus on the attached occurrence, preventing scroll by default.
   *
   * A released attachment cannot focus a later mount, even on the same element.
   *
   * @param options - Optional focus behavior; omitted properties retain their defaults.
   * @returns Focus has been requested when the occurrence is still attached.
   * @throws Propagates owner check or browser focus failures.
   */
  focus(options?: InputFocusOptions): void {
    if (this.isAttached()) {
      this.#element.focus({ preventScroll: options?.preventScroll ?? true });
    }
  }

  /**
   * Invalidates borrowed capabilities for this attachment.
   *
   * @returns Repeated release is harmless and later operations are no-ops.
   */
  detach(): void {
    this.#attached = false;
  }
}
