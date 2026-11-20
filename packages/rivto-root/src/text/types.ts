/** Attachment-bound plain-text editing operations for one mounted host. */
export interface EditableText {
  /**
   * Checks whether the host still belongs to its captured occurrence.
   *
   * @returns False after Root detachment or movement across the occurrence boundary.
   * @throws Propagates ownership and browser selector failures.
   */
  isCurrent(): boolean;
  /**
   * Reads the opaque identity of the captured editing host.
   *
   * @returns Stable identity of this host, including after detachment.
   */
  getIdentity(): object;
  /**
   * Reads the host's current plain text while the occurrence remains current.
   *
   * @returns Text, including an empty string, or undefined after ownership ends.
   * @throws Propagates browser reads and ownership-check failures.
   */
  readText(): string | undefined;
  /**
   * Reads visible plain text, including browser-rendered line breaks.
   *
   * @returns Text with normalized newline characters, or undefined after ownership ends.
   * @throws Propagates browser reads and ownership-check failures.
   */
  readRenderedText(): string | undefined;
  /**
   * Inserts plain text at the current browser selection in this editable.
   *
   * Browser insertion is attempted first to preserve native caret and undo behavior.
   *
   * @param text - Characters to insert, including newline characters.
   * @returns True for empty text or an owned insertion; false when the host loses ownership or focus, or the selection is outside it.
   * @throws Propagates browser selection and text insertion failures.
   */
  insertText(text: string): boolean;
  /**
   * Reconciles plain text without exposing the browser host or its selection.
   *
   * When requested, selection endpoints are retained around a text replacement.
   * No selection is read when the text already matches or preservation is false.
   *
   * @param text - Complete plain text to render.
   * @param preserveSelection - Whether to retain the current browser selection.
   * @returns True if ownership remained current; false after detachment or movement.
   * @throws Propagates browser text, selection, and ownership-check failures.
   */
  synchronize(text: string, preserveSelection: boolean): boolean;
}

/** Viewport coordinates used to position UI near a content caret. */
export interface ContentCaretGeometry {
  /** Caret edges, absent when the document has no selection range. */
  readonly caret?: ContentBounds;
  /** Content host edges used when caret geometry is unavailable or zero. */
  readonly content: ContentBounds;
  /** Owning window dimensions, absent when the document has no window. */
  readonly viewport?: ContentViewport;
}

/** Horizontal and vertical edges measured in viewport CSS pixels. */
export interface ContentBounds {
  /** Horizontal position relative to the viewport. */
  readonly left: number;
  /** Upper edge relative to the viewport. */
  readonly top: number;
  /** Lower edge relative to the viewport. */
  readonly bottom: number;
}

/** Browser viewport dimensions in CSS pixels. */
export interface ContentViewport {
  /** Viewport width in CSS pixels. */
  readonly width: number;
  /** Viewport height in CSS pixels. */
  readonly height: number;
}

/** Identity comparison for captured content hosts without exposing elements. */
export interface TextHostIdentity {
  /**
   * Compares this captured host with another browser content capability.
   *
   * @param other - Another captured content identity.
   * @returns True when both capabilities refer to the same host; false for different or unsupported providers.
   */
  isSameHost(other: TextHostIdentity): boolean;
}

/**
 * Browser-free reads from a content host captured by input or occurrence lookup.
 *
 * Reads use the same host and its current browser state. Guard deferred work
 * with the originating occurrence's attachment capability before using this value.
 */
export interface TextHost extends TextHostIdentity {
  /**
   * Places a collapsed browser caret at an offset in the captured host.
   *
   * @param offset - UTF-16 offset from the beginning of the host.
   * @returns The selection is updated when the host remains in its occurrence and a selection is available.
   * @throws Propagates browser selection and text traversal failures.
   */
  restoreCaret(offset: number): void;
  /**
   * Reads the current plain text of the captured content host.
   *
   * @returns The host's text, or an empty string when it contains no text.
   */
  readText(): string;
  /**
   * Checks whether the captured content host is connected to a document.
   *
   * @returns The host's current connectivity, independently of registration state.
   */
  isConnected(): boolean;
  /**
   * Replaces a leading text decoration while preserving the browser selection.
   *
   * @param prefix - Leading text to wrap, or undefined to remove the decoration.
   * @param className - CSS class identifying the decoration element.
   * @returns Text remains unchanged and the browser selection is restored when possible.
   * @throws Propagates invalid selector, DOM mutation, or selection failures.
   */
  decoratePrefix(prefix: string | undefined, className: string): void;
  /**
   * Reads an attribute from the captured host's nearest matching ancestor.
   *
   * @param selector - Selector identifying an ancestor.
   * @param attribute - Attribute to read from the matching ancestor.
   * @returns Its value, or undefined when absent, outside the captured occurrence, or moved during the read.
   * @throws If the browser rejects the selector or attribute name.
   */
  readAncestorAttribute(selector: string, attribute: string): string | undefined;
  /**
   * Reads the live content and a collapsed caret within the captured host.
   *
   * @returns Current text and its caret offset, absent when selection is not a collapsed caret in the host.
   * @throws Propagates browser selection and range creation failures.
   */
  readCaret(): ContentCaret;
  /**
   * Measures the current caret, content bounds, and viewport.
   *
   * @returns Viewport-relative geometry; caret and viewport are absent when unavailable.
   * @throws Propagates browser selection and geometry measurement failures.
   */
  measureCaret(): ContentCaretGeometry;
}

/** Current text and collapsed caret offset in one captured content host. */
export interface ContentCaret {
  /** Current text of the captured content host. */
  readonly text: string;
  /** UTF-16 offset of its collapsed caret, absent for a nonlocal or invalid selection. */
  readonly offset: number | undefined;
}

/** Selector policy for locating one content host within an occurrence. */
export interface TextHostQuery {
  /** Selector identifying the host's owning element. */
  readonly ownerSelector: string;
  /** Owner attribute compared to the requested value. */
  readonly ownerAttribute: string;
  /** Exact owner attribute value to locate. */
  readonly ownerValue: string;
  /** Selector identifying a content host within its owner. */
  readonly contentSelector: string;
  /** Selector identifying nested occurrence boundaries. */
  readonly boundarySelector: string;
}

/** Outcome of focusing an occurrence-owned content host. */
export type TextHostFocusResult = "focused" | "owner-missing" | "content-missing" | "detached";

/** Selectors used to identify the owner and content of browser selection endpoints. */
export type TextSelectionQuery = Pick<
  TextHostQuery,
  "ownerSelector" | "ownerAttribute" | "contentSelector" | "boundarySelector"
>;

/** Occurrence-bound access to the rendered owners in one captured local scope. */
export interface TextOwnerScope {
  /**
   * Checks whether the first matching owner exists without directly owned content.
   *
   * Content belonging to a nested owner does not make this owner editable.
   *
   * @param ownerId - Exact attribute identity of the rendered owner to inspect.
   * @returns False when the owner is missing, has content, or the scope is inactive.
   * @throws Propagates selector, attribute, and attachment-check failures.
   */
  hasContentlessOwner(ownerId: string): boolean;
  /**
   * Requests focus on the captured scope without scrolling it into view.
   *
   * @returns Focus has been requested if the captured scope remains active.
   * @throws Propagates browser focus and attachment-check failures.
   */
  focus(): void;
}

/**
 * Receives the occurrence-owned focus and browser text-selection owner identities.
 *
 * @param ownerIds - Unique owner IDs in focus, anchor, and focus-endpoint order.
 * @returns The consumer has processed the current identities.
 * @throws Propagates consumer failures to the registration or event delivery.
 */
export type TextOwnerObserver = (ownerIds: readonly string[]) => void;

/** An owner identity and UTF-16 offset measured within its content host. */
export interface TextSelectionPosition {
  /** Identity read from the content host's nearest matching owner. */
  readonly ownerId: string;
  /** UTF-16 offset from the start of the content host. */
  readonly offset: number;
}

/** Directed text endpoints, preserving the browser's anchor and focus order. */
export interface TextSelection {
  /** Fixed browser selection endpoint. */
  readonly anchor: TextSelectionPosition;
  /** Moving browser selection endpoint. */
  readonly focus: TextSelectionPosition;
}

/** Occurrence-bound pointer gesture retaining exact browser text endpoints. */
export interface TextSelectionGesture {
  /**
   * Captures the fixed endpoint beneath viewport coordinates.
   *
   * @param x - Horizontal viewport coordinate in CSS pixels.
   * @param y - Vertical viewport coordinate in CSS pixels.
   * @returns Owner identity and text offset, or undefined when unavailable.
   */
  readAnchor(x: number, y: number): TextSelectionPosition | undefined;
  /**
   * Captures a candidate moving endpoint beneath viewport coordinates.
   *
   * @param x - Horizontal viewport coordinate in CSS pixels.
   * @param y - Vertical viewport coordinate in CSS pixels.
   * @returns Owner identity and text offset, or undefined when unavailable.
   */
  readHead(x: number, y: number): TextSelectionPosition | undefined;
  /**
   * Checks for the retained fixed endpoint.
   *
   * @returns True while the originating attachment and anchor are available.
   */
  hasAnchor(): boolean;
  /**
   * Checks for the latest candidate endpoint, including an unmappable point.
   *
   * @returns True while the originating attachment and candidate are available.
   */
  hasPendingHead(): boolean;
  /**
   * Checks for the published moving endpoint.
   *
   * @returns True while the originating attachment and published endpoint are available.
   */
  hasHead(): boolean;
  /**
   * Publishes the latest candidate as the moving endpoint or clears it.
   *
   * @param hasHead - Whether the current selection uses the candidate endpoint.
   * @returns The published endpoint has been updated while attached.
   */
  commitHead(hasHead: boolean): void;
  /**
   * Replaces the fixed endpoint with an existing directed selection endpoint.
   *
   * The original pointer endpoint becomes the pending moving endpoint. A missing
   * owner may be synchronously mounted by the caller-provided operation.
   *
   * @param position - Owner identity and UTF-16 offset of the existing anchor.
   * @returns True when both the old pointer point and new anchor are available.
   * @throws Propagates mounting, selector, and browser traversal failures.
   */
  setAnchor(position: TextSelectionPosition): boolean;
  /**
   * Restores the directed browser range from retained live endpoints.
   *
   * @returns The browser selection is updated when both endpoints remain available.
   * @throws Propagates browser range failures.
   */
  restore(): void;
}

/**
 * Requests synchronous mounting of a neighboring rendered owner.
 *
 * @param ownerId - Identity at the currently rendered edge.
 * @param direction - Negative for the preceding owner, positive for the next.
 * @returns The host has attempted to mount the requested neighbor.
 * @throws Propagates host lookup and mounting failures.
 */
export type TextNavigationMount = (ownerId: string, direction: -1 | 1) => void;
