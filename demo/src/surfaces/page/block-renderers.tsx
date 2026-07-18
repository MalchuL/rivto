import {
  useBlock,
  useBlockTextEditing,
} from "@chulane/rivto";
import type { ComponentType } from "react";

/** Props shared by every page-surface block content component. */
export interface BlockRendererProps {
  /** Stable ID resolved by hook-based renderers against the current document. */
  readonly blockId: string;
}

/** React component contract used by the page surface's renderer map. */
export type BlockRenderer = ComponentType<BlockRendererProps>;

/**
 * Renders plain collaborative text for paragraph-like built-in blocks.
 *
 * The surrounding BlockView exposes native block identity and type, so CSS can
 * style this same renderer as a heading, list item, quote, or code block without
 * putting surface-specific presentation into the published library.
 */
function TextBlock({ blockId }: BlockRendererProps) {
  const editing = useBlockTextEditing(blockId);

  return (
    <div
      {...editing}
      className="page-block-content"
      role="textbox"
      aria-label="Block content"
      aria-multiline="true"
      spellCheck
    />
  );
}

/** Renders the built-in divider as non-editable document structure. */
function DividerBlock() {
  return <hr className="page-divider" />;
}

/**
 * Renders a readable placeholder for built-in binary attachment blocks.
 *
 * Uploading and previews are application features and intentionally remain out
 * of this first surface slice; persisted labels are still visible.
 */
function AttachmentBlock({ blockId }: BlockRendererProps) {
  const { block } = useBlock(blockId);

  if (!block) return null;
  return (
    <div className="page-attachment">
      <strong>{block.type}</strong>
      {block.content && <span>{block.content}</span>}
    </div>
  );
}

/**
 * Keeps documents readable when the demo has no renderer for a registered type.
 */
export function UnknownBlock({ blockId }: BlockRendererProps) {
  const { block } = useBlock(blockId);

  if (!block) return null;
  return (
    <div className="page-unknown-block" role="note">
      Unsupported block: <strong>{block.type}</strong>
      {block.content && <span>{block.content}</span>}
    </div>
  );
}

/**
 * Built-in content components selected by PageBlock.
 *
 * This plain object is deliberately local to the demo. It has no registration
 * lifecycle, fallback policy, or mutable global state; adding a renderer is one
 * property and removing the surface removes the map with it.
 */
export const pageBlockRenderers: Readonly<Record<string, BlockRenderer>> = {
  paragraph: TextBlock,
  heading: TextBlock,
  heading2: TextBlock,
  heading3: TextBlock,
  bulletListItem: TextBlock,
  numberedListItem: TextBlock,
  checkListItem: TextBlock,
  quote: TextBlock,
  code: TextBlock,
  divider: DividerBlock,
  image: AttachmentBlock,
  file: AttachmentBlock,
};
