import type { EditorMode } from "@chulane/rivto";
import type { ComponentType, ReactNode } from "react";
import type { BlockWrapperComponent } from "../../blocks/block-wrapper/block-wrapper";
import type { BlockSlotPosition, BlockSlotProps, BlockSlotRegistration, ElementSlotProps, ElementSlotRegistration, ResolvedSlot, SlotPosition, SurfaceComponent } from "./types";

/** Surface components, wrappers, and ordered slot contributions. */
export interface SurfacesApi {
  /** @returns Matching block slots with stable registration IDs, ordered by priority. */
  getBlockSlotEntries(position: BlockSlotPosition, props: BlockSlotProps): readonly ResolvedSlot<BlockSlotProps>[];
  /** @returns Matching element slots with stable registration IDs, ordered by priority. */
  getElementSlotEntries(position: SlotPosition, props: ElementSlotProps): readonly ResolvedSlot<ElementSlotProps>[];
  register(mode: EditorMode, surface: SurfaceComponent): () => void;
  delete(mode: EditorMode): boolean;
  get(mode: EditorMode): SurfaceComponent | undefined;
  registerBlockWrapper(mode: EditorMode, wrapper: BlockWrapperComponent): () => void;
  getBlockWrappers(mode: EditorMode): readonly BlockWrapperComponent[];
  /** Registers one ordered block-row slot contribution. */
  registerBlockSlot(registration: BlockSlotRegistration): () => void;
  /** Resolves matching block-slot components from nearest to farthest. */
  getBlockSlots(
    position: BlockSlotPosition,
    props: BlockSlotProps,
  ): readonly ComponentType<BlockSlotProps>[];
  /** Registers one ordered first-class element slot contribution. */
  registerElementSlot(registration: ElementSlotRegistration): () => void;
  /** Resolves matching element-slot components from nearest to farthest. */
  getElementSlots(
    position: SlotPosition,
    props: ElementSlotProps,
  ): readonly ComponentType<ElementSlotProps>[];
  registerEditorWrapper(
    wrapper: ComponentType<{ readonly children?: ReactNode }>,
    mode?: EditorMode | readonly EditorMode[],
  ): () => void;
  getEditorWrappers(mode: EditorMode): ComponentType<{ readonly children?: ReactNode }>[];
  readonly revision: number;
  subscribe(listener: () => void): () => void;
}
