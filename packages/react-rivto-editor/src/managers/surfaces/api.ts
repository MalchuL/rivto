import type { EditorMode } from "@chulane/rivto";
import type { ComponentType, ReactNode } from "react";
import type { BlockWrapperComponent } from "../../blocks/block-wrapper/block-wrapper";
import type {
  BlockSlotPosition,
  BlockSlotProps,
  BlockSlotRegistration,
  ElementSlotProps,
  ElementSlotRegistration,
  ResolvedSlot,
  SlotPosition,
  SurfaceComponent,
} from "./types";

/** Surface components, wrappers, and ordered slot contributions. */
export interface SurfacesApi {
  /** @returns Matching block slots with stable registration IDs, ordered by priority. */
  getBlockSlotEntries(
    position: BlockSlotPosition,
    props: BlockSlotProps,
  ): readonly ResolvedSlot<BlockSlotProps>[];
  /** @returns Matching element slots with stable registration IDs, ordered by priority. */
  getElementSlotEntries(
    position: SlotPosition,
    props: ElementSlotProps,
  ): readonly ResolvedSlot<ElementSlotProps>[];
  /**
   * Registers the surface component for an editor mode.
   *
   * @param mode - Editor mode whose surface is registered.
   * @param surface - Surface component to render for the mode.
   * @returns Owned cleanup that unregisters the surface.
   * @throws If the mode already has a surface or registration ownership is inactive.
   */
  register(mode: EditorMode, surface: SurfaceComponent): () => void;
  /**
   * Removes the surface component for an editor mode.
   *
   * @param mode - Editor mode whose surface is removed.
   * @returns Whether a surface was removed.
   */
  delete(mode: EditorMode): boolean;
  /**
   * Reads the surface component for an editor mode.
   *
   * @param mode - Editor mode to look up.
   * @returns Registered surface, or undefined when none exists.
   */
  get(mode: EditorMode): SurfaceComponent | undefined;
  /**
   * Registers a block wrapper for a mode in registration order.
   *
   * @param mode - Editor mode receiving the block wrapper.
   * @param wrapper - Wrapper component registered around blocks or editor content.
   * @returns Owned cleanup that removes the wrapper.
   */
  registerBlockWrapper(mode: EditorMode, wrapper: BlockWrapperComponent): () => void;
  /**
   * Reads the block wrappers registered for a mode.
   *
   * @param mode - Editor mode whose block wrappers are requested.
   * @returns Wrappers in registration order, or an empty list when none exist.
   */
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
  /**
   * Registers an editor wrapper for selected modes, defaulting to both modes.
   *
   * @param wrapper - Wrapper component registered around blocks or editor content.
   * @param mode - Editor mode or modes for the surface registration; omitted wrapper modes include both modes.
   * @returns Owned cleanup that removes the wrapper.
   */
  registerEditorWrapper(
    wrapper: ComponentType<{ readonly children?: ReactNode }>,
    mode?: EditorMode | readonly EditorMode[],
  ): () => void;
  /**
   * Reads editor wrappers applicable to a mode.
   *
   * @param mode - Editor mode whose editor wrappers are requested.
   * @returns Wrapper components in registration order.
   */
  getEditorWrappers(mode: EditorMode): ComponentType<{ readonly children?: ReactNode }>[];
  readonly revision: number;
  /**
   * Observes surface and wrapper registration changes.
   *
   * @param listener - Callback invoked when the observed state changes.
   * @returns A function that removes the listener.
   */
  subscribe(listener: () => void): () => void;
}
