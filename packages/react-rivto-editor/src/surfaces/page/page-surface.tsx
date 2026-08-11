import { useEditorRoot, useRootBlockIds } from "../../hooks";
import { BlockTree } from "../../blocks";

/**
 * Renders the collaborative document as a nested writing page.
 *
 * The surface owns only page geometry and supplies document roots to BlockTree.
 * BlockTree keeps renderer selection, controls, and traversal identical to
 * every other surface that displays blocks.
 */
export function PageSurface() {
  const rootIds = useRootBlockIds();
  const { ref } = useEditorRoot();

  /*
   * `ref` registers this element as the EditorView DOM/event root.
   * `className` is the public `.page-surface` styling hook in styles.css.
   * `data-rivto-page-editor-root` is PAGE_EDITOR_ROOT_ATTRIBUTE in constants.ts;
   * PAGE_EDITOR_ROOT_SELECTOR uses it for cross-journal caret navigation.
   * `data-empty` exposes document emptiness to styles and integration tests.
   * `aria-label` gives the <main> landmark an accessible editor name.
   * `tabIndex` lets structural selection focus the surface without tab-order noise.
   */
  return (
    <main
      ref={ref}
      className="page-surface"
      data-rivto-page-editor-root
      data-empty={rootIds.length ? undefined : "true"}
      aria-label="Document editor"
      tabIndex={-1}
    >
      <BlockTree blockIds={rootIds} />
      {/* PAGE_END_SLOT_ATTRIBUTE in constants.ts marks the TrailingBlock portal target. 
      * Uses to add "Add block" buttons at the end of the page.
      */}
      <div data-page-end-slot="true" />
    </main>
  );
}
