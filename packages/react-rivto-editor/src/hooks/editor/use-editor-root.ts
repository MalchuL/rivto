import type { RefCallback } from "react";
import { useEditorRootContext } from "../../editor-root-context";

/** Surface root state returned by useEditorRoot. */
export interface UseEditorRootResult {
  /** Mounted surface root, or null before its ref runs and after unmount. */
  readonly element: HTMLElement | null;
  /** Stable callback ref that makes an element the current surface root. */
  readonly ref: RefCallback<HTMLElement>;
}

/**
 * Connects the active surface container with root-aware editor features.
 *
 * A surface assigns `ref` to its own container, preserving ownership of the
 * element, semantics, layout, and styling. Plugins read `element` indirectly
 * through `useDOMEvent` or directly for scoped queries, focus restoration,
 * geometry, and overlays. EditorView stores only the local DOM reference and
 * still renders no wrapper element.
 *
 * Only one active surface root should register inside an EditorView. React sets
 * the value to null automatically when that surface unmounts.
 *
 * @example
 * ```tsx
 * function PageSurface() {
 *   const { ref } = useEditorRoot();
 *   return <main ref={ref}>...</main>;
 * }
 * ```
 *
 * @returns Current surface root and its stable registration ref.
 * @throws If called outside an EditorView subtree.
 */
export function useEditorRoot(): UseEditorRootResult {
  return useEditorRootContext();
}
