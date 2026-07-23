import { useBlock, useEditor, type ReactEditor } from "@chulane/rivto-react";
import type { MouseEvent } from "react";
import { MarkdownContent } from "@chulane/rivto-react";
import {
  COUNTER_BLOCK_TYPE,
  counterBlockDefinition,
  SLIDER_BLOCK_TYPE,
  sliderBlockDefinition,
} from "./custom-block-definitions";

export { duplicateBlockInput } from "./block-utils";
export {
  COUNTER_BLOCK_TYPE,
  counterBlockDefinition,
  SLIDER_BLOCK_TYPE,
  sliderBlockDefinition,
} from "./custom-block-definitions";

/** Demo block with normal collaborative text and one validated range property. */
function SliderBlock({ blockId }: { readonly blockId: string }) {
  const { block, operations } = useBlock(blockId);
  if (!block) return null;
  const value = typeof block.props.value === "number" ? block.props.value : 50;
  return (
    <div className="custom-slider-block">
      <MarkdownContent blockId={blockId} />
      <label>
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

/** Demo contentless block proving controls can participate in structural selection. */
function CounterBlock({ blockId }: { readonly blockId: string }) {
  const editor = useEditor();
  const block = editor.getBlock(blockId);
  if (!block) return null;
  const count = typeof block.props.count === "number" ? block.props.count : 0;
  const increment = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.ctrlKey || event.metaKey) return;
    const latest = editor.getBlock(blockId)?.props.count;
    editor.setBlockProp(blockId, "count", (typeof latest === "number" ? latest : 0) + 1);
  };
  return <button type="button" className="custom-counter-block" onClick={increment}>Count: {count}</button>;
}

/** Registers each demo block's model, renderer, and slash conversion together. */
export function installCustomBlocks(editor: ReactEditor): () => void {
  const disposers = [
    editor.registerBlock({
      definition: sliderBlockDefinition,
      render: SliderBlock,
      slashCommand: { title: "Slider", group: "Turn into", keywords: ["range", "value"] },
    }),
    editor.registerBlock({
      definition: counterBlockDefinition,
      render: CounterBlock,
      slashCommand: { title: "Counter", group: "Turn into", keywords: ["count", "button"] },
    }),
  ];
  return () => disposers.reverse().forEach((dispose) => dispose());
}
