import { createElement as h, Fragment } from "react";
import { z } from "zod";
import { BlockRow, BlockContent, BlockBody, BlockChildren } from "@chulane/rivto-page";
import {
  blockExtension,
  editorControlProps,
  useBlockNode,
  useBlockSelectionAnchor,
} from "@chulane/rivto-react";

/**
 * Renders the accordion header and controls its persisted collapse state.
 *
 * @param {{blockId: string}} props - Identity of the accordion block.
 * @returns {import('react').ReactNode} Header, or null after deletion.
 */
function Accordion({ blockId }) {
  const { block, operations } = useBlockNode(blockId);
  const anchor = useBlockSelectionAnchor(blockId);
  if (!block) {
    return null;
  }
  const collapsed = block.listProps.collapsed === true;
  return h(
    "div",
    { ...anchor, className: "dynamic-block dynamic-accordion-header" },
    h(
      "button",
      {
        ...editorControlProps,
        type: "button",
        "aria-expanded": !collapsed,
        onClick: () => operations.update({ listProps: { collapsed: !collapsed } }),
      },
      collapsed ? "Expand accordion" : "Collapse accordion",
    ),
    h("span", null, "Accordion"),
  );
}

/**
 * Composes the shared row and one canonical drop-enabled child region.
 *
 * @returns {import('react').ReactNode} Accordion layout.
 */
function AccordionLayout() {
  return h(
    Fragment,
    null,
    h(BlockRow, null, h(BlockContent)),
    h(BlockBody),
    h(BlockChildren, {
      className: "dynamic-accordion-children",
      emptyDropTarget: true,
      dropBackground: true,
    }),
  );
}

/**
 * Creates the accordion registration for one editor runtime.
 *
 * @returns {import('@chulane/rivto-react').ReactEditorExtension} Accordion extension.
 */
export function createExtension() {
  return blockExtension({
    definition: {
      type: "dynamic.accordion",
      title: "Dynamic accordion",
      defaultProps: {},
      propSchema: z.object({}).strict(),
    },
    render: Accordion,
    layout: AccordionLayout,
    slashCommand: { title: "Dynamic accordion" },
  });
}
