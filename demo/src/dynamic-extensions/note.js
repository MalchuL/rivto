import { createElement as h } from "react";
import { z } from "zod";
import {
  BLOCK_TEXT_METADATA_KEY,
  BlockText,
  blockExtension,
  useBlockEditing,
} from "@chulane/rivto-react/authoring";

/**
 * Renders a collaborative plain-text note using the editor-owned editable.
 *
 * @param {{blockId: string}} props - Identity of the note block.
 * @returns {import('react').ReactNode} Editable note, or null after deletion.
 */
function Note({ blockId }) {
  const editing = useBlockEditing(blockId);
  if (!editing.block) {
    return null;
  }
  return h(BlockText, {
    editing: editing.attributes,
    className: "dynamic-block dynamic-note",
    label: "Dynamic note",
  });
}

/**
 * Creates the text note registration for one editor runtime.
 *
 * @returns {import('@chulane/rivto-react').ReactEditorExtension} Note extension.
 */
export function createExtension() {
  return blockExtension({
    definition: {
      type: "dynamic.note",
      title: "Dynamic note",
      defaultProps: {},
      propSchema: z.object({}).strict(),
      metadata: { [BLOCK_TEXT_METADATA_KEY]: true },
    },
    render: Note,
    slashCommand: { title: "Dynamic note" },
  });
}
