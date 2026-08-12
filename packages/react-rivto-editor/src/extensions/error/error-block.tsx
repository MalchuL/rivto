import type { EditorBlock, EditorBlockInput } from "@chulane/rivto";
import { useBlock } from "../../hooks";
import type { ReactEditorExtension } from "../../managers";

export const ERROR_BLOCK_TYPE = "rivto.error";

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[character]!);

/**
 * Renders quarantined clipboard data that failed block validation.
 *
 * @param blockId - Persisted identifier of the generated error block.
 * @returns An alert containing the error and original data, or `null` when the
 * block is no longer present.
 */
export function ErrorBlock({ blockId }: { readonly blockId: string }) {
  const { block } = useBlock(blockId);
  if (!block) return null;
  return (
    <div role="alert" data-error-block="true">
      <strong>{block.content || "Invalid block data"}</strong>
      <pre>{JSON.stringify(block.props.originalBlock, null, 2)}</pre>
    </div>
  );
}

/**
 * Creates a visible error-block input while preserving the rejected subtree.
 *
 * @param block - Complete invalid clipboard block to preserve for diagnosis.
 * @param error - Validation failure reported by clipboard preparation.
 * @returns A new Error block input containing a detached copy of the original.
 */
export const createErrorBlockInput = (block: EditorBlock, error: unknown): EditorBlockInput => ({
  type: ERROR_BLOCK_TYPE,
  content: error instanceof Error ? error.message : "Invalid block data",
  props: { originalBlock: structuredClone(block) },
});

/**
 * Registers the Error block renderer and its portable clipboard formatter.
 *
 * @returns A React editor extension ready for preset installation.
 */
export const errorBlockExtension = (): ReactEditorExtension => ({
  id: "block.error",
  setup: (reactEditor) => {
    reactEditor.blocks.register({
      definition: { type: ERROR_BLOCK_TYPE, title: "Invalid block" },
      render: ErrorBlock,
    });
    reactEditor.clipboard.registerFormatter({
      id: "error",
      matches: ({ block }) => block.type === ERROR_BLOCK_TYPE,
      format: ({ block }) => {
        const data = JSON.stringify(block.props.originalBlock, null, 2);
        const text = `${block.content}\n${data}`;
        return {
          plain: text,
          markdown: `> ${block.content}\n\n\`\`\`json\n${data}\n\`\`\``,
          html: `<aside><strong>${escapeHtml(block.content)}</strong><pre>${escapeHtml(data)}</pre></aside>`,
        };
      },
    });
  },
});
