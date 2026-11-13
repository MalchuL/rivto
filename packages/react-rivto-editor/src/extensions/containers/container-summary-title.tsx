import { BlockText } from "../../authoring/block-text";
import { useBlockEditing } from "../../hooks";
import { BLOCK_SELECTION_ANCHOR_ATTRIBUTE, editorControlProps } from "../../constants";

/** Shared collapsed summary surface; empty expanded anchors remain unstyled. */
export const CONTAINER_SUMMARY_CLASS = "rivto-container-summary";
/** Allows summary counts to start block selection in both editor surfaces. */
export const CONTAINER_SUMMARY_SELECTION_ATTRIBUTES = {
  ...editorControlProps,
  [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "",
} as const;

interface ContainerSummaryTitleProps {
  readonly blockId: string;
  readonly name: string;
}

/**
 * Renders a collapsed container name as editable block text.
 *
 * Pointer gestures on the name edit or select text. The surrounding summary
 * remains available for structural selection. An empty name displays its type
 * until the editor receives focus. Focusing commits that default
 * as real text so it can be selected, copied, or replaced like any other name.
 * Clearing an already focused field remains possible.
 *
 * @param props - Identity and default name of the container.
 * @param props.blockId - Block whose content stores the name.
 * @param props.name - Default text and accessible name prefix.
 * @returns The editable title for the collapsed summary.
 */
export function ContainerSummaryTitle({ blockId, name }: ContainerSummaryTitleProps) {
  const editing = useBlockEditing(blockId);
  return (
    <BlockText
      editing={editing.attributes}
      className="rivto-container-summary-title"
      label={`${name} name`}
      data-placeholder={name}
      onFocus={(event) => {
        if (event.currentTarget.textContent === "") {
          event.currentTarget.textContent = name;
          editing.operations.setContent(name);
        }
      }}
    />
  );
}
