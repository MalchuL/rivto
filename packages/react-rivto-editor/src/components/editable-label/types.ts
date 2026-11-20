import type { MutableRefObject, RefCallback, RefObject } from "react";
import type { InputRegion, RegionIdentity } from "@chulane/rivto-root";
import type { EditableLabelFocusPoint, EditableLabelProps, EditableLabelText } from "../types";

/** Mounted occurrence operations needed to capture a label's text. */
export interface EditableLabelMountedRoot {
  /**
   * Captures text operations for an editable owned by this occurrence.
   *
   * @param identity - Opaque identity of the mounted label.
   * @param boundarySelector - Selector identifying nested occurrence boundaries.
   * @returns Label text operations, or undefined when the label is foreign or detached.
   * @throws Propagates selector and Root ownership-check failures.
   */
  captureEditableTextByIdentity(
    identity: RegionIdentity,
    boundarySelector: string,
  ): EditableLabelText | undefined;
}

/** Input operations needed to focus and position a label caret. */
export interface EditableLabelInputRoot {
  /**
   * Checks whether the input occurrence is still attached.
   *
   * @returns False after the occurrence is detached or replaced.
   * @throws Propagates Root ownership-check failures.
   */
  isAttached(): boolean;
  /**
   * Requests focus for a region owned by the input occurrence.
   *
   * @param identity - Opaque identity of the mounted label.
   * @param boundarySelector - Optional selector identifying nested occurrence boundaries.
   * @returns True when focus was requested and the occurrence remains current.
   * @throws Propagates Root ownership, selector, and focus failures.
   */
  focusRegionByIdentity(identity: RegionIdentity, boundarySelector?: string): boolean;
  /**
   * Captures a region for positioning the label's caret.
   *
   * @param identity - Opaque identity of the mounted label.
   * @returns Caret placement capability, or undefined when the region is unavailable.
   * @throws Propagates Root ownership-check failures.
   */
  captureRegionByIdentity(
    identity: RegionIdentity,
  ): Pick<InputRegion, "placeCaretAtPoint"> | undefined;
}

/** Root operations borrowed by a label without attachment or teardown ownership. */
export interface EditableLabelPanel {
  /** Root retained by the panel even when interaction is disabled. */
  readonly mountedRoot: EditableLabelMountedRoot | undefined;
  /** Interactive occurrence, absent while disabled or detached. */
  readonly inputRoot?: EditableLabelInputRoot;
  /**
   * Observes changes to the panel's current Root availability.
   *
   * @param listener - Called when an occurrence is attached, replaced, or enabled.
   * @returns Disposer removing this observation.
   */
  subscribeAvailability(listener: () => void): () => void;
}

/** Panel operations and current props borrowed by a label editing session. */
export interface EditableLabelSessionOptions {
  /** Occurrence state borrowed from the host panel. */
  readonly reactPanel: EditableLabelPanel;
  /** Whether this label currently accepts editing input. */
  readonly editing: boolean;
  /** Persisted content used before or between editing sessions. */
  readonly text: string;
  /** Optional pending viewport point owned by the host. */
  readonly focusPointRef?: MutableRefObject<EditableLabelFocusPoint | null>;
}

/** Mounting and draft state retained by one rendered label. */
export interface EditableLabelSession {
  /** React mounting callback that captures the label's opaque identity. */
  readonly labelRef: RefCallback<HTMLDivElement>;
  /** Viewport point requested through the label's imperative handle. */
  readonly pendingCaret: RefObject<EditableLabelFocusPoint | null>;
  /** Last text captured while the editable belonged to the occurrence. */
  readonly draft: RefObject<string>;
}

/** Mutable state shared by one label's successive editing effects. */
export interface EditableLabelSessionState {
  readonly pendingCaret: RefObject<EditableLabelFocusPoint | null>;
  readonly editingSession: RefObject<boolean>;
  readonly needsSeed: RefObject<boolean>;
  readonly needsFocus: RefObject<boolean>;
  readonly draft: RefObject<string>;
}

/** One effect's label reconciliation and reentrancy state. */
export interface EditableLabelReconciliation {
  readonly options: EditableLabelSessionOptions;
  readonly state: EditableLabelSessionState;
  readonly identity: RegionIdentity;
  readonly point: EditableLabelFocusPoint | null;
  placed: boolean;
  placing: boolean;
}

/** Current label state borrowed by the private React input adapter. */
export interface EditableLabelInputOptions extends Pick<
  EditableLabelProps,
  "editing" | "onCommit" | "onEditingChange" | "stopPointerWhileEditing"
> {
  /** Panel capability for capturing the current editable. */
  readonly panel: Pick<EditableLabelPanel, "mountedRoot">;
  /** Last text captured while the editable belonged to the occurrence. */
  readonly draft: RefObject<string>;
  /** Prevents a keydown insertion from being repeated by before-input. */
  readonly enterInsertedNewline: RefObject<boolean>;
}
