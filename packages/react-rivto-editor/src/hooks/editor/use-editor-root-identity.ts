import { useEditorRootContext } from "./use-editor-root-context";

/**
 * Reads the opaque identity of the currently mounted surface.
 *
 * The identity changes when the mounting element changes; it does not grant
 * attachment ownership or access to the element itself.
 *
 * @returns Surface identity, or undefined before mount or after unmount.
 * @throws If called outside an EditorPanel or EditorEmbed subtree.
 */
export function useEditorRootIdentity(): object | undefined {
  const { identity } = useEditorRootContext();
  return identity;
}
