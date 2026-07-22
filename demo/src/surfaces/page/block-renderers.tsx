import {
  DEFAULT_BLOCK_TYPE,
  useBlock,
  useEditor,
} from "@chulane/rivto";
import type { ComponentType, MouseEvent } from "react";
import {
  COUNTER_BLOCK_TYPE,
  SLIDER_BLOCK_TYPE,
} from "../../blocks/custom-blocks";
import { MarkdownContent } from "../../blocks/markdown";

/** Props shared by every page-surface block content component. */
export interface BlockRendererProps {
  /** Stable ID resolved by hook-based renderers against the current document. */
  readonly blockId: string;
}

/** React component contract used by the page surface's renderer map. */
export type BlockRenderer = ComponentType<BlockRendererProps>;

/** Renders Markdown content above a collaborative native range property. */
function SliderBlock({ blockId }: BlockRendererProps) {
  const { block, operations } = useBlock(blockId);
  if (!block) return null;
  const value = typeof block.props.value === "number" ? block.props.value : 50;

  return (
    <div className="custom-slider-block">
      <MarkdownContent blockId={blockId} />
      <label className="custom-slider-control">
        <span>Value: {value}</span>
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          aria-label="Slider value"
          onChange={(event) => operations.setProp("value", Number(event.currentTarget.value))}
        />
      </label>
    </div>
  );
}

/** Renders a props-only block whose normal click increments its latest value. */
function CounterBlock({ blockId }: BlockRendererProps) {
  const editor = useEditor();
  const block = editor.getBlock(blockId);
  if (!block) return null;
  const count = typeof block.props.count === "number" ? block.props.count : 0;

  const increment = (event: MouseEvent<HTMLButtonElement>): void => {
    if (event.ctrlKey || event.metaKey) return;
    const latest = editor.getBlock(blockId)?.props.count;
    editor.setBlockProp(blockId, "count", (typeof latest === "number" ? latest : 0) + 1);
  };

  return (
    <button type="button" className="custom-counter-block" onClick={increment}>
      Count: {count}
    </button>
  );
}

/** Keeps documents readable when the demo lacks a renderer for a stored type. */
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

/** Explicit renderer policy shared by the demo's page and edgeless surfaces. */
export const blockRenderers: Readonly<Record<string, BlockRenderer>> = {
  [DEFAULT_BLOCK_TYPE]: MarkdownContent,
  [SLIDER_BLOCK_TYPE]: SliderBlock,
  [COUNTER_BLOCK_TYPE]: CounterBlock,
};
