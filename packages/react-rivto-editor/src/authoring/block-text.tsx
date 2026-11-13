import type { HTMLAttributes } from "react";
import type { BlockTextEditingAttributes } from "../hooks/blocks/use-block-text-editing";

/** Plain-text editing attributes and the native presentation of the editable element. */
export interface BlockTextProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "contentEditable" | "onInput" | "onCompositionStart" | "onCompositionEnd"
> {
  /** Attributes returned by useBlockEditing for this block. */
  readonly attributes: BlockTextEditingAttributes;
  /** Accessible name of this text field. */
  readonly label: string;
  /** Whether the field is announced as multiline; defaults to true and does not restrict input. */
  readonly multiline?: boolean;
}

/**
 * Renders one accessible plain-text editable owned by the block editing hook.
 *
 * The hook owns text nodes, input, composition and its ref; React children must
 * not be supplied. Other native attributes configure the same editable element.
 *
 * @param props - Hook attributes, accessible name and native presentation.
 * @param props.attributes - Attributes returned by useBlockEditing for this occurrence.
 * @param props.label - Accessible name announced for the text field.
 * @param props.multiline - Whether to announce multiple lines; defaults to true and does not restrict input.
 * @returns One contenteditable textbox whose content is synchronized by the hook.
 */
export function BlockText({ attributes, label, multiline = true, ...props }: BlockTextProps) {
  return (
    <div {...props} {...attributes} role="textbox" aria-label={label} aria-multiline={multiline} />
  );
}
