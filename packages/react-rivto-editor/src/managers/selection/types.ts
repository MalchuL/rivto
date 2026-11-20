import type { ReactPanelApi } from "../../panels/types";
import type { InputRoot } from "@chulane/rivto-root";
import type { BlockBrowserSelectionApi } from "@chulane/rivto-page";
import type { PageNavigationApi } from "../../surfaces/page/page-navigation-controller";

/** Page selection conversion borrowed from the panel's existing Page controller. */
export interface PanelPageSelectionSource {
  readonly browserSelection: Pick<
    BlockBrowserSelectionApi,
    | "readEditorDOMSelection"
    | "restoreEditorDOMSelection"
    | "focusBlock"
    | "focusBlockSelection"
    | "verticalCaretPosition"
    | "adjacentCaretPosition"
  >;
}

/** Input capabilities borrowed by panel selection without owning attachment cleanup. */
export type PanelSelectionInputRoot = Pick<InputRoot, "isAttached" | "findTextHost">;

/** Panel state and occurrence-local Page capabilities needed by selection operations. */
export interface PanelSelectionHost extends Pick<ReactPanelApi, "rootBlockId"> {
  /**
   * Checks whether the panel currently exposes an assigned surface for interaction.
   *
   * @returns True while the panel is enabled and its surface has not been cleared.
   */
  hasInteractiveRoot(): boolean;
  /** Whether the panel currently accepts interaction. */
  readonly enabled: boolean;
  /** Mounted occurrence used to schedule and observe input for deferred work. */
  readonly mountedRoot?: Pick<
    InputRoot,
    | "captureFrameClock"
    | "observeInput"
    | "getElementIdentity"
    | "isAttached"
    | "adjacentTextPosition"
    | "hasRegionAncestor"
    | "captureTextOwnerScope"
    | "clearSelection"
    | "findAdjacentOccurrence"
  >;
  /** Current registration capability, absent when the panel is not registered. */
  readonly inputRoot?: PanelSelectionInputRoot;
  readonly blocks: Pick<ReactPanelApi["blocks"], "canRemove" | "hasBlock">;
  readonly document: Pick<ReactPanelApi["document"], "getDocument">;
  readonly editor: PanelSelectionEditor;
  readonly elements: Pick<ReactPanelApi["elements"], "hasElement">;
  readonly page: PanelPageSelectionSource;
  readonly pageNavigation: Pick<
    PageNavigationApi,
    "selection" | "mountBlocks" | "mountAdjacentBlocks" | "isAttached" | "suspendScrollAdjustments"
  >;
}

/** Selected block whose viewport position anchors a structural command. */
export interface BlockViewportAnchor {
  /** Stable block identifier. */
  readonly id: string;
  /** Viewport top before the command. */
  readonly top: number;
}

/** Root operations borrowed by viewport settlement. */
export type ViewportRoot = Pick<
  InputRoot,
  | "getElementIdentity"
  | "readRegionViewportTop"
  | "readRegionValues"
  | "measureRegionViewportBounds"
  | "captureDocumentScroll"
  | "observeWindowWheel"
  | "captureFrameClock"
>;

/** Active viewport settlement for one page surface. */
export interface ViewportSettlement {
  /** Block whose viewport position is retained across repeated commands. */
  readonly anchorId?: string;
  /** Latest intended viewport top, including deliberate user scrolling. */
  expectedTop?: number;
  /**
   * Stops pending correction and restores normal virtual measurement behavior.
   *
   * @returns The wheel subscription and suspended adjustments have been released.
   */
  cancel(): void;
}

/**
 * Checks whether a viewport operation still belongs to its captured registration.
 *
 * @returns True while the same occurrence may access its browser surface.
 */
export type ViewportAttachmentCheck = () => boolean;

/**
 * Executes the host's synchronous structural operation.
 *
 * @returns Whether the operation claimed the shortcut.
 * @throws Propagates host mutation failures.
 */
export type ViewportSelectionAction = () => boolean;

/** Panel registry queries used to determine selection ownership. */
/** Root lookup borrowed by selection without registration or teardown operations. */
export interface PanelSelectionRoots {
  /**
   * Checks whether an activated panel remains remembered during removal.
   *
   * @returns True while an active panel is remembered, including during its synchronous cleanup.
   */
  hasActivePanel(): boolean;
  /**
   * Reads the Root of the last activated panel.
   *
   * @returns Its attachment capability, or undefined before activation or after removal.
   */
  getActiveInputRoot(): Pick<InputRoot, "isAttached"> | undefined;
  /**
   * Reads the preferred Root when selection has no active panel.
   *
   * @returns Its attachment capability, or undefined when no panel is registered.
   */
  getDefaultInputRoot(): Pick<InputRoot, "isAttached"> | undefined;
}

export interface PanelSelectionEditor {
  readonly panels: PanelSelectionRoots;
}

/**
 * State owned by one deferred selection request. Cancellation handles retain
 * this record so a stale handle cannot cancel a newer request on the manager.
 * Frame and subscription are assigned during scheduling before caller cleanup runs.
 */
export interface PendingSelectionCallback {
  readonly root: object;
  readonly occurrence: NonNullable<PanelSelectionHost["mountedRoot"]>;
  readonly callback: () => void;
  readonly onCancel?: () => void;
  active: boolean;
  cancelFrame?: () => void;
  unsubscribe?: () => void;
}

/** Rendered-block traversal direction for keyboard editing. */
export type EditableBlockDirection = "previous" | "next";

/**
 * Performs the document edit before focusing a structural predecessor.
 *
 * @returns The synchronous document edit has completed.
 * @throws Propagates failures from the document edit.
 */
export type StructuralPredecessorAction = () => void;
