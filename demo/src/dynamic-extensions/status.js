import { createElement as h } from "react";
import { z } from "zod";
import {
  blockExtension,
  editorControlProps,
  useBlockNode,
  useBlockSelectionAnchor,
} from "@chulane/rivto-react";

/**
 * Renders a selectable status with a separately owned native toggle.
 *
 * @param {{blockId: string}} props - Identity of the status block.
 * @returns {import('react').ReactNode} Status control, or null after deletion.
 */
function Status({ blockId }) {
  const { block, operations } = useBlockNode(blockId);
  const anchor = useBlockSelectionAnchor(blockId);
  if (!block) {
    return null;
  }
  return h(
    "div",
    { ...anchor, className: "dynamic-block dynamic-status" },
    h(
      "label",
      null,
      h("input", {
        ...editorControlProps,
        type: "checkbox",
        checked: block.props.done,
        onChange: (event) => operations.setProp("done", event.currentTarget.checked),
      }),
      " Dynamic status",
    ),
    h("span", null, block.props.done ? "Done" : "Open"),
  );
}

/**
 * Creates the status registration for one editor runtime.
 *
 * @returns {import('@chulane/rivto-react').ReactEditorExtension} Status extension.
 */
export function createExtension() {
  return blockExtension({
    definition: {
      type: "dynamic.status",
      title: "Dynamic status",
      defaultProps: { done: false },
      propSchema: z.object({ done: z.boolean() }).strict(),
    },
    render: Status,
    slashCommand: { title: "Dynamic status" },
  });
}
