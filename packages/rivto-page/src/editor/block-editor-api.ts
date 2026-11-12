import type { BlockPointerOwnership } from "./pointer/block-pointer-ownership";
import type { BlockLayoutRegions } from "../presentation/components/block-layout/block-layout-regions";
import type { BlockKeyboardApi } from "./keyboard/block-keyboard";
import type { BlockWrapperRegistryApi } from "../presentation/components/block-wrapper/types";
import type { BlockEditorAdapter } from "../adapter/types";
import type { BlockRendererRegistry } from "../presentation/renderers/block-renderer-registry";
import type { BlockSlotRegistry } from "../presentation/slots/block-slot-registry";
import type { BlockEditorNodeApi } from "./blocks/block-editor-node-api";
import type { BlockDropTargetsApi } from "./drag-and-drop/types";
import type { BlockEditorEventsApi } from "./events/block-editor-events";
import type { BlockEditorExtensionsApi } from "./extensions/types";

/** Borrowed editor contract for components and extensions; the host owns attachment and destruction. */
export interface BlockEditorApi {
  /** Mounted primitive ownership; refs release their own registrations. */
  readonly regions: Pick<BlockLayoutRegions, "register" | "get">;
  /** Borrowed semantic bindings and physical state queries. */
  readonly keyboard: BlockKeyboardApi;
  /** Exclusive pointer reservation; each gesture releases its own reservation. */
  readonly pointer: Pick<BlockPointerOwnership, "acquire">;
  /** Host-owned data access and addressed subscriptions. */
  readonly adapter: BlockEditorAdapter;
  /** Feature registration and explicit resource cleanup without manager teardown. */
  readonly extensions: BlockEditorExtensionsApi;
  /** Editor-owned slot contributions and their independent subscriptions. */
  readonly slots: BlockSlotRegistry;
  /** Live host content/layout registrations and their independent subscriptions. */
  readonly renderers: BlockRendererRegistry;
  /** Live ordered decorator registrations without manager teardown capabilities. */
  readonly wrappers: BlockWrapperRegistryApi;
  /** Whole-editor focus subscriptions without DOM attachment methods. */
  readonly events: BlockEditorEventsApi;
  /** Explicit mounted regions and geometry-only destination lookup. */
  readonly dropTargets: BlockDropTargetsApi;

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

  /**
   * Reads this occurrence's currently attached DOM root without changing attachment.
   *
   * @returns Mounted root, or null before attachment, after detachment, or after destruction.
   */
  getRoot(): HTMLElement | null;
}
