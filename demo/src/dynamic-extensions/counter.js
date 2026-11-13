import { createElement as h } from "react";
import { z } from "zod";
import {
  blockExtension,
  BlockSelectionButton,
  useBlockContent,
  usePanel,
} from "@chulane/rivto-react/authoring";

/**
 * Renders a selectable counter whose button also accepts selection drags.
 *
 * @param {{blockId: string}} props - Identity of the counter block.
 * @returns {import('react').ReactNode} Counter content, or null after deletion.
 */
function Counter({ blockId }) {
  const { block, operations, selectionProps } = useBlockContent(blockId);
  const panel = usePanel();
  if (!block) {
    return null;
  }
  return h(
    "div",
    { ...selectionProps, className: "dynamic-block dynamic-counter" },
    h(
      BlockSelectionButton,
      {
        onClick: () => {
          const current = panel.blocks.getBlockNode(blockId);
          if (current) {
            operations.setProp("count", current.props.count + 1);
          }
        },
      },
      `Dynamic count: ${block.props.count}`,
    ),
  );
}

/**
 * Creates the counter registration for one editor runtime.
 *
 * @returns {import('@chulane/rivto-react').ReactEditorExtension} Counter extension.
 */
export function createExtension() {
  return blockExtension({
    definition: {
      type: "dynamic.counter",
      title: "Dynamic counter",
      defaultProps: { count: 0 },
      propSchema: z.object({ count: z.number().int().nonnegative() }).strict(),
    },
    render: Counter,
    slashCommand: { title: "Dynamic counter" },
  });
}
