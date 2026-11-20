import type { RegionBounds } from "../geometry/types";

/** Presentation of an inert document path overlay. */
export interface PathOverlayStyle {
  /** CSS class used to present the overlay. */
  readonly className: string;
  /** Data markers applied to the overlay for presentation and inspection. */
  readonly attributes: Readonly<Record<`data-${string}`, string>>;
}

/** A document path borrowed from one mounted occurrence. */
export interface PathOverlay {
  /**
   * Creates the inert path overlay in the occurrence's document body.
   *
   * A failed creation may leave a partial overlay that its owner must remove.
   *
   * @returns True when created for the current occurrence, or false after ownership changes.
   * @throws If already created or browser setup or ownership checks fail.
   */
  create(): boolean;
  /**
   * Measures the overlay relative to the viewport.
   *
   * @returns Detached bounds, or undefined before creation or after ownership changes.
   * @throws Propagates browser measurement and ownership failures.
   */
  readBounds(): RegionBounds | undefined;
  /**
   * Sets the SVG path data while the occurrence and overlay remain current.
   *
   * @param path - SVG path commands, or an empty string to clear the path.
   * @returns True when the current overlay accepted the update; false after ownership changes.
   * @throws Propagates browser mutation and ownership failures.
   */
  update(path: string): boolean;
  /**
   * Removes the overlay, including after detachment or partial setup.
   *
   * @returns The overlay has been released; repeated calls are harmless.
   * @throws Propagates browser removal failures.
   */
  remove(): void;
}

/** One text row in an inert overlay. */
export interface TextOverlayLine {
  /** CSS class used to present this row. */
  readonly className: string;
  /** Plain text displayed without interpreting markup. */
  readonly text: string;
  /** Logical inline indentation in CSS pixels. */
  readonly indent: number;
}

/** Content and presentation names for an inert text overlay. */
export interface TextOverlayContent {
  /** CSS class used to present the overlay. */
  readonly className: string;
  /** Plain text preceding the rows. */
  readonly text: string;
  /** Rows displayed in the given order. */
  readonly lines: readonly TextOverlayLine[];
}

/** A text overlay borrowed from one mounted occurrence. */
export interface TextOverlay {
  /**
   * Checks whether creating the overlay has started.
   *
   * @returns True while a created node is retained, including after partial setup failure; false after successful removal.
   */
  isCreated(): boolean;
  /**
   * Creates and appends inert text when the originating occurrence is attached.
   *
   * A failed creation can leave a partial overlay; the owner must call remove.
   *
   * @param content - Text, row indentation and CSS classes to display.
   * @returns True when the overlay remains appended to its active occurrence in the captured document; false when ownership is inactive or the overlay is canceled or moved.
   * @throws If a previous node is still retained, an ownership check fails, or browser creation, attachment or containment fails.
   */
  create(content: TextOverlayContent): boolean;
  /**
   * Positions the created overlay relative to the viewport.
   *
   * @param x - Horizontal position in CSS pixels.
   * @param y - Vertical position in CSS pixels.
   * @returns The overlay is moved while it remains in its attached occurrence and captured document; no work is performed before creation, after detachment, or after reparenting.
   * @throws If an ownership check, browser containment check or style write fails.
   */
  move(x: number, y: number): void;
  /**
   * Removes the created overlay, including after partial setup or detachment.
   *
   * @returns The overlay is removed and its node is released; repeated calls are harmless.
   * @throws If browser removal fails.
   */
  remove(): void;
}

/** Presentation of an inert line overlay. */
export interface LineOverlayStyle {
  /** CSS class used to present the line. */
  readonly className: string;
  /** CSS length used for the line's thickness. */
  readonly thickness: string;
}

/** Viewport position and direction of an inert line. */
export interface LineOverlayPosition {
  /** Horizontal viewport position in CSS pixels. */
  readonly x: number;
  /** Vertical viewport position in CSS pixels. */
  readonly y: number;
  /** Length of the line in CSS pixels. */
  readonly length: number;
  /** Direction in which the line extends. */
  readonly orientation: "horizontal" | "vertical";
}

/** A line overlay borrowed from one mounted occurrence. */
export interface LineOverlay {
  /**
   * Checks the occurrence and document captured for this line.
   *
   * @returns False after detachment, document movement, or reparenting of the retained line.
   * @throws Propagates attachment ownership or browser containment failures.
   */
  isCurrent(): boolean;
  /**
   * Shows a positioned line or hides an existing line without removing it.
   *
   * A failed creation may leave a node that must still be removed by the owner.
   *
   * @param position - Viewport position and length, or undefined to hide the line.
   * @returns True when the current occurrence accepted the update; false after ownership loss or cancellation.
   * @throws If an ownership check or browser creation, attachment, containment or style write fails.
   */
  update(position?: LineOverlayPosition): boolean;
  /**
   * Removes the line, including after detachment or partial creation.
   *
   * @returns The line is removed and released; repeated calls are harmless.
   * @throws If browser removal fails.
   */
  remove(): void;
}

/** Presentation of an inert rectangle in the occurrence's document. */
export interface RectangleOverlayStyle {
  /** CSS class used to present the rectangle. */
  readonly className: string;
  /** Data markers applied to the rectangle for presentation and inspection. */
  readonly attributes: Readonly<Record<`data-${string}`, string>>;
  /** Mount inside the occurrence instead of its document body when set to root. */
  readonly container?: "root";
  /** CSS properties applied before attaching the rectangle. */
  readonly properties?: Readonly<Record<string, string>>;
}

/** Rectangle bounds in viewport CSS pixels, or root-local CSS pixels for a root container. */
export interface RectangleOverlayPosition {
  /** Left coordinate in CSS pixels, relative to the selected container. */
  readonly x: number;
  /** Top coordinate in CSS pixels, relative to the selected container. */
  readonly y: number;
  /** Width in CSS pixels. */
  readonly width: number;
  /** Height in CSS pixels. */
  readonly height: number;
}

/** A rectangle borrowed from one mounted occurrence. */
export interface RectangleOverlay {
  /**
   * Checks the captured occurrence and any retained rectangle.
   *
   * @returns False after detachment, document movement, or rectangle reparenting.
   * @throws Propagates occurrence ownership checks.
   */
  isCurrent(): boolean;
  /**
   * Shows a rectangle or hides the retained rectangle without removing it.
   *
   * A failed creation may leave a node that the owner must remove.
   *
   * @param position - Viewport bounds, or root-local bounds for a root container, in CSS pixels; undefined hides it.
   * @returns True when the current occurrence accepted the update; false after ownership loss or cancellation.
   * @throws Propagates ownership, browser creation, attachment, and style failures.
   */
  update(position?: RectangleOverlayPosition): boolean;
  /**
   * Removes the rectangle, including after detachment or partial creation.
   *
   * @returns The rectangle is removed and released; repeated calls are harmless.
   * @throws If browser removal fails.
   */
  remove(): void;
}
