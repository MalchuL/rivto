import { useEditorRoot, useRootBlockIds } from "../../hooks";
import { PageBlock } from "./page-block";

/**
 * Renders the collaborative document as a nested writing page.
 *
 * The surface owns root traversal, page layout, block renderer selection through
 * PageBlock, and child placement. It intentionally lives in the demo because
 * those are product presentation decisions rather than responsibilities of the
 * UI-style-agnostic React library.
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
      {rootIds.map((blockId) => (
        <PageBlock key={blockId} blockId={blockId} />
      ))}
      <div data-page-end-slot="true" />
    </main>
  );
}
