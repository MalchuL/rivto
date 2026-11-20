import type { BlockEditorAdapter } from "../adapter/types";
import type { BlockRenderer } from "../presentation/renderers/types";
import type { FocusBoundaryInputRoot, InputRoot, RegionIdentity } from "@chulane/rivto-root";
import type { BlockPointerOwnership } from "./pointer/block-pointer-ownership";
import type { BlockKeyboardApi } from "./keyboard/types";
import type { BlockWrapperRegistryApi } from "../presentation/components/block-wrapper/types";
import type { BlockRendererRegistry } from "../presentation/renderers/block-renderer-registry";
import type { BlockSlotRegistry } from "../presentation/slots/block-slot-registry";
import type { BlockEditorNodeApi } from "./blocks/block-editor-node-api";
import type { BlockDropTargetsApi } from "./drag-and-drop/types";
import type { BlockEditorEventsApi } from "./events/types";
import type { BlockEditorExtensionsApi } from "./extensions/types";
import type { BlockBrowserSelectionApi, BlockSelectionAttachment } from "./selection/types";
import type { BlockEditorEventsRoot } from "./events/types";

/** Occurrence input and identity borrowed by Page during one attachment. */
export type PageInputRoot = BlockEditorEventsRoot &
  BlockSelectionAttachment["occurrence"] &
  PageViewInputRoot &
  Pick<FocusBoundaryInputRoot, "capturePoint" | "observeTextOwners"> & {
    /**
     * Identifies the mounted occurrence for its virtualization region.
     *
     * @returns Opaque identity of the mounted occurrence.
     */
    getElementIdentity(): RegionIdentity;
  };

/** Occurrence operations borrowed by Page's mounted rendering scope. */
export type PageViewInputRoot = Pick<
  InputRoot,
  "getElementIdentity" | "captureRegionByIdentity" | "isAttached" | "observeWindowInput"
>;

/** Identity token for one mounted root, independent of later attachments. */
export interface BlockEditorAttachment {
  /** Browser capability owned by this mounted occurrence. */
  readonly inputRoot: PageInputRoot;
  /** Releases native event listeners installed for this exact attachment. */
  readonly detachEvents: () => void;
  /** Releases selection ownership for this exact attachment. */
  readonly detachSelection: () => void;
  /** Releases virtualized views' observations of this exact Root. */
  detachVirtualization: () => void;
}

/** Data source borrowed by one independently configurable block editor instance. */
export interface BlockEditorOptions {
  /** Stable data adapter; its lifetime and document resources remain with the host. */
  readonly adapter: BlockEditorAdapter;
  /** Content component for unregistered types; omission leaves their content area empty. */
  readonly fallbackRenderer?: BlockRenderer;
}

/** Borrowed editor contract for components and extensions; the host owns attachment and destruction. */
export interface BlockEditorApi<CustomEvents extends object = object> {
  /** Borrowed semantic bindings and physical state queries. */
  readonly keyboard: BlockKeyboardApi;
  /** Exclusive pointer reservation; each gesture releases its own reservation. */
  readonly pointer: Pick<BlockPointerOwnership, "acquire">;
  /** Host-owned data access and addressed subscriptions. */
  readonly adapter: BlockEditorAdapter;
  /** Feature registration and explicit resource cleanup without manager teardown. */
  readonly extensions: BlockEditorExtensionsApi<CustomEvents>;
  /** Editor-owned slot contributions and their independent subscriptions. */
  readonly slots: BlockSlotRegistry;
  /** Live host content/layout registrations and their independent subscriptions. */
  readonly renderers: BlockRendererRegistry;
  /** Live ordered decorator registrations without manager teardown capabilities. */
  readonly wrappers: BlockWrapperRegistryApi;
  /** Portable browser selection reads for this occurrence, without attachment ownership. */
  readonly browserSelection: BlockBrowserSelectionApi;
  /** Whole-editor focus subscriptions without DOM attachment methods. */
  readonly events: BlockEditorEventsApi<CustomEvents>;
  /** Geometry-only destination lookup without mounted-region registration. */
  readonly dropTargets: Pick<BlockDropTargetsApi, "resolve">;

  /**
   * Reuses one live node per requested ID for this editor's lifetime.
   *
   * Missing IDs still receive objects so consumers can observe later restoration.
   * Reading a node does not read its snapshot or subscribe to host data.
   *
   * @param blockId - Stable identity inside this editor's adapter occurrence.
   * @returns Borrowed cached node, retaining identity across updates and view remounts.
   * @throws If the editor has been destroyed.
   */
  getNode(blockId: string): BlockEditorNodeApi;
}
