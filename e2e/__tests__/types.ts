import type { DocumentEditorAPI } from "@chulane/rivto";

/** Synchronous and two-frame timing of a block-handle drag sample. */
export interface PageHandleDragTiming {
  readonly sync: number;
  readonly frames: number;
}

/** Demo editor and pending pointer sample used by the block-handle benchmark. */
export interface PageHandleDragWindow extends Window {
  readonly __rivtoDemo: { readonly editor: DocumentEditorAPI };
  dragRegistrationTiming?: PageHandleDragTiming;
}

/** Synchronous and two-frame timings for the start of a Bento resize. */
export interface BentoResizeStartTiming {
  /** Pointer-down delivery duration in milliseconds. */
  readonly sync: number;
  /** Time through two browser frames in milliseconds. */
  readonly frames: number;
}

/** Browser measurement state while a Bento resize starts. */
export interface BentoResizeStartWindow extends Window {
  /** Current sample, or null while the next sample is pending. */
  bentoStartTiming: BentoResizeStartTiming | null;
}

/** Synchronous and two-frame timings for one visual-label input. */
export interface LabelTypingTiming {
  /** Time from before-input to completion of synchronous input delivery, in milliseconds. */
  readonly sync: number;
  /** Time from before-input through two animation frames, in milliseconds. */
  readonly rendered: number;
}

/** Browser measurement state for one visual-label input. */
export interface LabelTypingWindow extends Window {
  /** Current sample, or null while its rendering marker is pending. */
  labelTyping: LabelTypingTiming | null;
}

/** Synchronous and two-frame timings for one table resize pointer move. */
export interface TableResizeTiming {
  readonly sync: number;
  readonly rendered: number;
}

/** Demo editor and measurement state used by table resize browser tests. */
export interface TableResizeWindow extends Window {
  readonly __rivtoDemo: { readonly editor: DocumentEditorAPI };
  tableResizeStart: number | null;
  tableResizeTiming: TableResizeTiming | null;
}

/** Selection endpoints supplied to the virtualized lookup benchmark. */
export interface VirtualSelection {
  readonly type: "selection";
  readonly blocks: [];
  readonly anchorBlockId: string;
  readonly focusBlockId: string;
}

/** Page capability used to measure virtualized selection endpoint lookup. */
export interface VirtualSelectionPanel {
  readonly page: {
    readonly browserSelection: {
      /**
       * Checks whether a selection endpoint is outside the mounted virtualized view.
       *
       * @param selection - Directed block endpoints to inspect.
       * @returns Whether an endpoint is missing from the mounted view.
       */
      hasVirtualizedMissingEndpoints(selection: VirtualSelection): boolean;
    };
  };
}

/** Panel lookup exposed by the demo editor for browser tests. */
export interface VirtualSelectionPanels {
  /**
   * Reads the default mounted panel.
   *
   * @returns The panel, or undefined before registration.
   */
  getDefault(): VirtualSelectionPanel | undefined;
}

/** Demo access for the virtualized selection benchmark. */
export interface VirtualSelectionWindow extends Window {
  readonly __rivtoDemo: {
    readonly reactEditor: { readonly panels: VirtualSelectionPanels };
  };
}

/** Focus restoration and two-frame timings for one block-menu dismissal. */
export interface BlockMenuFocusTiming {
  /** Time from Escape delivery to handle focus, in milliseconds. */
  readonly focus: number;
  /** Time from Escape delivery through two animation frames after focus, in milliseconds. */
  readonly frames: number;
}

/** Browser state for one pending block-menu focus sample. */
export interface BlockMenuFocusWindow extends Window {
  /** Current sample, or null while focus and frame observation are pending. */
  blockMenuFocusTiming: BlockMenuFocusTiming | null;
  /** Start of the current Escape delivery, in milliseconds. */
  blockMenuFocusStart: number;
}

/** Browser startup timing for mounted block handles. */
export interface BlockHandleMountTiming {
  /** Milliseconds since navigation when the required mounted handles have been observed. */
  readonly mounted: number;
  /** Milliseconds since navigation through two frames after the count was observed. */
  readonly frames: number;
  /** Number of handle buttons observed in the target Page occurrence. */
  readonly handles: number;
}
