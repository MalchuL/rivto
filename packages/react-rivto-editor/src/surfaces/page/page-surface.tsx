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

  return (
    <main
      ref={ref}
      className="page-surface"
      data-empty={rootIds.length ? undefined : "true"}
      aria-label="Document editor"
      tabIndex={-1}
    >
      <BlockTree blockIds={rootIds} />
      <div data-page-end-slot="true" />
    </main>
  );
}
