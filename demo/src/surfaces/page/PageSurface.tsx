import { useDocument, useEditorRoot } from "@chulane/rivto";
import { PageBlock } from "./PageBlock";

/**
 * Renders the collaborative document as a nested writing page.
 *
 * The surface owns root traversal, page layout, block renderer selection through
 * PageBlock, and child placement. It intentionally lives in the demo because
 * those are product presentation decisions rather than responsibilities of the
 * UI-style-agnostic React library.
 */
export function PageSurface() {
  const document = useDocument();
  const { ref } = useEditorRoot();

  return (
    <main ref={ref} className="page-surface" aria-label="Document editor">
      {document.document.map((block) => (
        <PageBlock key={block.id} blockId={block.id} />
      ))}
    </main>
  );
}
