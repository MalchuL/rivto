import type { UseEditorRootResult } from "./types";
export type { UseEditorRootResult } from "./types";
import { useEditorRootContext } from "./use-editor-root-context";

/**
 * Connects the active surface container with root-aware editor features.
 *
 * A surface assigns `ref` to its own container, preserving ownership of the
 * element, semantics, layout, and styling. EditorPanel stores the local DOM
 * reference and still renders no wrapper element. Plugins use the panel's Root
 * capabilities for scoped queries, focus restoration, geometry, and overlays.
 *
 * Only one active surface root should register inside an EditorPanel. React sets
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
 * @returns The stable callback used to register the surface root.
 * @throws If called outside an EditorPanel or EditorEmbed subtree.
 */
export function useEditorRoot(): UseEditorRootResult {
  const { ref } = useEditorRootContext();
  return { ref };
}
