import { PanelBlockContextMenuManager } from "../managers/block-context-menu/panel-manager";
import type { DocumentModel } from "@chulane/document-model";
import type { PanelAPI, ModeManagerApi, EditorMode } from "@chulane/rivto";
import type { ReactEditorExtensionApi, ReactEditorPanelApi } from "../editor/types";
import type { BlockEditorViewApi, BlockSelectionExtensions } from "@chulane/rivto-page";
import type { PageNavigationController } from "../surfaces/page/page-navigation-controller";
import type { PanelClipboardApi } from "../managers/clipboard/api";
import type { PanelEventsApi } from "../managers/events/api";
import type { EditorEventInputRoot, EventPanel } from "../managers/events/types";
import type { KeyboardApi } from "../managers/keyboard/types";
import type { PanelSelectionApi } from "../managers/selection/api";
import type { PanelSlashCommandsApi } from "../managers/slash/api";
import type { BrowserInputRoot } from "@chulane/rivto-root/browser";
import type { BrowserInputRootApi, InputRoot } from "@chulane/rivto-root";
import type { BrowserListenerControl } from "@chulane/rivto-root";

/** Pointer ownership operations borrowed by panel event routing. */
export type PanelPointerOwnership = Pick<
  BrowserListenerControl,
  "getPointerOwner" | "claimPointerOwner" | "releasePointerOwner"
>;

/** Nearest input boundary and its registered panel, when owned by this editor. */
export interface PanelTargetMatch {
  readonly hasBoundary: boolean;
  readonly candidate?: object;
}

/** Panel registration operations used for attachment identity, surface state and browser focus. */
export type PanelInputRoot = Pick<
  BrowserInputRootApi,
  | "isAttached"
  | "getElementIdentity"
  | "captureRegionByIdentity"
  | "focusRegionByIdentity"
  | "captureFocusedRegion"
  | "createRectangleOverlay"
  | "createPathOverlay"
  | "captureDocument"
  | "readRegionViewportTop"
  | "readRegionValues"
  | "measureRegionViewportBounds"
  | "captureDocumentScroll"
  | "observeWindowWheel"
  | "observeWindowInput"
  | "writeClipboard"
  | "captureFrameClock"
  | "setTemporaryAttribute"
  | "findRegions"
  | "someTopLevelRegion"
  | "findRegionsByAttribute"
  | "isConnected"
  | "readAttribute"
  | "clearSelection"
  | "focus"
  | "captureFocusedTextHost"
>;

/** Root operations used to identify and read one panel surface. */
export type PanelSurfaceRoot = Pick<
  InputRoot,
  "isAttached" | "readAttribute" | "getElementIdentity"
>;

/**
 * Receives the staged routing lifetime before registration listeners run.
 *
 * @param inputRegistration - Routing lifetime that becomes current if registration succeeds.
 * @returns The receiver has retained the routing lifetime for its mounted Root.
 * @throws Propagates receiver failures and prevents registration.
 */
export type PanelInputReceiver = (inputRegistration: PanelInputRegistration) => void;

/** Borrowed panel and occurrence operations for one routed browser input. */
export interface PanelEventRoute {
  /** Panel API, absent when a registration does not dispatch editing handlers. */
  readonly api?: PanelEventRecipient;
  /** Browser operations tied to the exact receiving registration. */
  readonly inputRoot: EditorEventInputRoot;
  /** Lifetime of the exact routing registration that received this event. */
  readonly inputRegistration: PanelInputRegistration;
}

/** Validity of one panel's exact input registration. */
export interface PanelInputRegistration {
  /**
   * Checks whether this registration still routes input for its mounted occurrence.
   *
   * @param inputRoot - Optional Root to match against the registration that supplied it.
   * @returns False after removal, replacement, occurrence detachment, or a Root mismatch.
   * @throws Propagates occurrence attachment-check failures.
   */
  isCurrent(inputRoot?: Pick<InputRoot, "isAttached">): boolean;
}

/** Panel operations used to create and deliver a routed input event. */
export interface PanelEventRecipient extends EventPanel {
  /** Surface mode fallback used when the mounted Root has no recognized marker. */
  readonly mode: Pick<ReactPanelApi["mode"], "get">;
}

/** Operations borrowed by the registry to identify panels, route input, and restore focus. */
export type PanelRoutingRoot = EditorEventInputRoot &
  Pick<BrowserInputRoot, "getElementIdentity" | "getParentIdentity" | "releasePointerOwnership">;

/** Resources owned by one mounted panel registration. */
export interface RegisteredPanel {
  /** Optional root block restricting the displayed subtree. */
  readonly rootBlockId?: string;
  /** Borrowed panel API, absent for registrations without interaction handlers. */
  readonly api?: ReactPanelApi;
  /** Mounted occurrence borrowed from the panel and retained independently of routing. */
  readonly inputRoot: PanelRoutingRoot;
  /** Exact routing lifetime, independent of the mounted Root's lifetime. */
  readonly inputRegistration: PanelInputRegistration;
  /**
   * Notifies transient UI that another occurrence became active.
   *
   * @returns Local deactivation observers have been notified.
   */
  readonly deactivate?: () => void;
  /**
   * Cancels selection work owned by this registration.
   *
   * @returns Pending local selection work has been cancelled.
   */
  readonly cancelSelection?: () => void;
}

/** Panel API, subtree and lifecycle callbacks supplied by the occurrence owner. */
export interface PanelRegistrationOptions extends Pick<
  RegisteredPanel,
  "rootBlockId" | "api" | "deactivate" | "cancelSelection"
> {
  /** Receives the staged routing lifetime before registration listeners run. */
  readonly receiveInput?: PanelInputReceiver;
}

/**
 * Public operations for one EditorPanel component displaying a document or subtree.
 *
 * Several panels can share the same runtime while using different DOM roots and
 * local event registrations. Use reactPanel.document.blocks, reactPanel.document.history, and the other
 * document managers for whole-document operations; reactPanel.editor owns registrations. Use this
 * panel's selection, clipboard, and slashCommands for browser interaction with its
 * own surface. Use reactPanel.blocks and reactPanel.elements for bounded editing; reactPanel.document.elements spans the document.
 * The interface exposes cleanup registration without exposing mutable registries or panel destruction.
 *
 * Writing-block factories are installed by defaultWritingBlockExtension or a host
 * extension through editor.installDefaultWriting. ReactPanel implements
 * this contract; components obtain it from useReactPanel rather than constructing it.
 */
export interface ReactPanelApi extends PanelAPI {
  /** Mounted Root supplied to input consumers while the panel accepts input. */
  readonly inputRoot?: PanelInputRoot;
  /** Current routing lifetime, absent while this occurrence is unregistered or disabled. */
  readonly inputRegistration?: PanelInputRegistration;
  /**
   * Adds synchronous cleanup to this panel's local registration list.
   * Other panels and the shared runtime retain their resources when this panel closes.
   * @param release - Cleanup for a resource owned by this panel occurrence.
   * @returns Idempotent disposer; panel destruction calls it if still retained.
   * @throws If panel destruction has started, or if the returned disposer's cleanup fails.
   */
  registerCleanup(release: () => void): () => void;
  /** Shared document infrastructure; this occurrence never destroys it. */
  readonly editor: ReactEditorExtensionApi;
  /** Panel-local mode by default; hosts can explicitly supply a shared ModeManager. */
  readonly mode: ModeManagerApi;
  /** Copy, cut, and paste using this occurrence's selection and destination. */
  readonly clipboard: PanelClipboardApi;
  /** Delegated native DOM event registration. */
  readonly events: PanelEventsApi;
  /**
   * Reads the rendered surface of this panel without changing shared document mode.
   * Unlike the panel's declared `mode.get()`, this reads markers on the mounted
   * root to describe the receiving DOM surface: a page embedding returns `block` even
   * when its document's core mode is `edgeless`. No additional mode is stored.
   * Event dispatch captures this value in `event.mode`; handlers should use that
   * snapshot. Use this method for panel-specific commands outside event handlers,
   * and the core mode manager for document-wide presentation choices.
   *
   * @returns Mounted panel's surface type, or the panel's declared mode when unmounted.
   * Unrecognized mounted roots use the registry's panel-mode fallback.
   */
  getSurfaceType(): EditorMode;
  /** Semantic keyboard actions and runtime shortcut overrides. */
  readonly keyboard: KeyboardApi;
  /** Reads the selection owned by this panel and synchronizes its DOM caret and highlights. */
  readonly selection: PanelSelectionApi;
  /** Menu actions bound to this panel and captured structural targets. */
  readonly blockContextMenu: PanelBlockContextMenuManager;
  /** Filters and executes shared command definitions using this panel as their context. */
  readonly slashCommands: PanelSlashCommandsApi;
  /** Observes deactivation so transient UI closes when another occurrence receives focus. */
  subscribeDeactivation(listener: () => void): () => void;
}

/** Page operations borrowed by the panel's mounted surfaces. */
export interface ReactPanelSurfaceApi extends ReactPanelApi {
  /** Host-owned mounted occurrence, retained even while event routing is disabled. */
  readonly mountedRoot:
    | Pick<
        InputRoot,
        | "isAttached"
        | "getElementIdentity"
        | "captureFrameClock"
        | "captureDocument"
        | "captureFocusedRegion"
        | "focus"
        | "focusRegionByIdentity"
        | "observeDocumentInput"
        | "captureRegionByIdentity"
        | "captureEditableTextByIdentity"
        | "createRectangleOverlay"
      >
    | undefined;
  /**
   * Observes panel availability, input Root replacement, and routing lifetime changes.
   *
   * @param listener - Called synchronously after the observed state changes.
   * @returns Disposer that removes this listener.
   */
  subscribeAvailability(listener: () => void): () => void;
  readonly editor: ReactEditorPanelApi;
  readonly page: BlockEditorViewApi;
  readonly pageSelectionFeatures: Pick<BlockSelectionExtensions, "feature">;
  readonly pageNavigation: Pick<PageNavigationController, "attachCanvas">;
}

/** Browser configuration around a framework-neutral panel. Presentation modes belong to each displayed occurrence. */
export interface PanelOptions {
  readonly mode?: ModeManagerApi;
}

/**
 * Loading and availability state returned to React through useSyncExternalStore.
 *
 * Before the hook's creation effect and after destruction, loading has no panel API.
 * A connected panel may also be loading while an embedded root has not arrived.
 * Available and missing states both keep
 * the document and panel API; missing means a previously observed root was removed.
 * Document loading failures belong to the host; this panel observes only root availability.
 * The snapshot is replaced on change; its model and API are live references.
 */
export type PanelSnapshot =
  | {
      readonly status: "loading";
      readonly document?: DocumentModel;
      readonly api?: ReactPanelSurfaceApi;
      readonly retained?: boolean;
    }
  | {
      readonly status: "available" | "missing";
      readonly document: DocumentModel;
      readonly api: ReactPanelSurfaceApi;
      readonly retained: boolean;
    };

/** Local registration identity and current input capability of one EditorPanel. */
export interface PanelRegistration {
  /** Stable occurrence identity; shared shortcut settings continue to use semantic action IDs. */
  readonly id: string;
  /**
   * Current routing capability used to identify this occurrence's handlers.
   *
   * It is undefined before mounting, while disabled, and after registration
   * cleanup. Re-enabling the same mounted surface supplies the same Root.
   * Deferred handlers use their captured inputRegistration to detect replacement.
   */
  readonly inputRoot: Pick<InputRoot, "isAttached"> | undefined;
  /**
   * Retains local registration cleanup until this occurrence is destroyed.
   *
   * @param dispose - Callback releasing the occurrence's registration.
   * @returns Idempotent disposer, also invoked during occurrence cleanup.
   * @throws If cleanup registration is attempted during or after panel destruction.
   */
  registerCleanup(dispose: () => void): () => void;
}
