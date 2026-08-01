import type { EditorMode } from "@chulane/rivto";
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
