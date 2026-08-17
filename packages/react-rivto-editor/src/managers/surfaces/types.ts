import type { EditorBlock, EditorElement, EditorMode } from "@chulane/rivto";
import type { ComponentType, ReactNode } from "react";
import type { BlockWrapperComponent } from "../../blocks/block-wrapper";

/** Root React component rendering one complete presentation mode. */
export type SurfaceComponent = ComponentType;

/** Component wrapped around the complete active EditorView content. */
export type EditorWrapper = ComponentType<{ readonly children?: ReactNode }>;

/** One editor wrapper and the modes where it surrounds EditorView. */
export interface EditorWrapperRegistration {
  /** Editor-wide React context or interaction boundary. */
  readonly wrapper: EditorWrapper;
  /** Modes in which EditorView applies the wrapper. */
  readonly mode?: EditorMode | readonly EditorMode[];
}

/** Identity-bearing entry in one mode's block-wrapper chain. */
export interface BlockWrapperRegistration {
  /** React decorator registered for recursively rendered blocks. */
  readonly wrapper: BlockWrapperComponent;
}

/** Twelve edge-specific anchors available on block rows and canvas elements. */
export const SLOT_POSITIONS = [
  "top-left",
  "top",
  "top-right",
  "right-top",
  "right",
  "right-bottom",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left-bottom",
  "left",
  "left-top",
] as const;

/** One supported block-row or canvas-element perimeter anchor. */
export type SlotPosition = typeof SLOT_POSITIONS[number];

/**
 * In-flow logical anchors available only to block rows.
 *
 * These names describe the row's inline axis, not text offsets: `start` is a
 * sibling immediately before the renderer, while `end` is a sibling after the
 * renderer's flexible box. Neither position tracks the first or last rendered
 * character.
 */
export const BLOCK_FLOW_SLOT_POSITIONS = ["start", "end"] as const;

/** One supported block-row anchor, including its in-flow start and end. */
export type BlockSlotPosition =
  | SlotPosition
  | typeof BLOCK_FLOW_SLOT_POSITIONS[number];

/** Render context supplied to a registered block-slot component or predicate. */
export interface BlockSlotProps {
  /** Latest detached block snapshot owned by the row. */
  readonly block: EditorBlock;
  /** Active presentation mode containing the row. */
  readonly mode: EditorMode;
  /** Whether the complete block participates in the current block selection. */
  readonly selected: boolean;
}

/** Render context supplied to a registered element-slot component or predicate. */
export interface ElementSlotProps {
  /** Latest detached first-class canvas element. */
  readonly element: EditorElement;
  /** Active presentation mode containing the element. */
  readonly mode: EditorMode;
  /** Whether the canvas element participates in the current edgeless selection. */
  readonly selected: boolean;
}

/** Ordered extension contribution rendered at one block-row anchor. */
export interface BlockSlotRegistration {
  /** Perimeter or in-flow logical anchor receiving the component. */
  readonly position: BlockSlotPosition;
  /** React component rendered with the owning block context. */
  readonly component: ComponentType<BlockSlotProps>;
  /** Larger values render closer to the owner; defaults to zero. */
  readonly priority?: number;
  /** Optional surface-mode restriction. */
  readonly mode?: EditorMode | readonly EditorMode[];
  /** Optional synchronous presentation filter. */
  readonly when?: (props: BlockSlotProps) => boolean;
}

/** Ordered extension contribution rendered at one canvas-element perimeter anchor. */
export interface ElementSlotRegistration {
  /** Perimeter anchor receiving the component. */
  readonly position: SlotPosition;
  /** React component rendered with the owning element context. */
  readonly component: ComponentType<ElementSlotProps>;
  /** Larger values render closer to the owner; defaults to zero. */
  readonly priority?: number;
  /** Optional surface-mode restriction. */
  readonly mode?: EditorMode | readonly EditorMode[];
  /** Optional synchronous presentation filter. */
  readonly when?: (props: ElementSlotProps) => boolean;
}
