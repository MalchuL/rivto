import { useBlockEditing, type ReactEditor } from "@chulane/rivto-react";
import type { MouseEvent } from "react";
import { MarkdownContent } from "@chulane/rivto-react";
import {
  COUNTER_BLOCK_TYPE,
  counterBlockDefinition,
  SLIDER_BLOCK_TYPE,
  sliderBlockDefinition,
} from "./custom-block-definitions";

interface SliderProps {
  value: number;
}

interface CounterProps {
  count: number;
}

export { duplicateBlockInput } from "./block-utils";
export {
  COUNTER_BLOCK_TYPE,
  counterBlockDefinition,
  SLIDER_BLOCK_TYPE,
  sliderBlockDefinition,
} from "./custom-block-definitions";

/** Demo block with normal collaborative text and one validated range property. */
function SliderBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing<SliderProps>(blockId);
  if (!editing.block) return null;
  const value = editing.getProp("value") ?? 50;
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
          onChange={(event) => editing.setProp("value", Number(event.currentTarget.value))}
        />
      </label>
    </div>
  );
}

/** Demo contentless block proving controls can participate in structural selection. */
function CounterBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing<CounterProps>(blockId, { textEdit: false });
  if (!editing.block) return null;
  const count = editing.getProp("count") ?? 0;
  const increment = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
    editing.setProp("count", (editing.getProp("count") ?? 0) + 1);
  };
  return (
    // The renderer region fills the block row, making its otherwise empty
    // right-hand side a valid structural-selection anchor. The actual Counter
    // button remains compact and retains its normal click behavior.
    <div {...editing.attributes} className="custom-counter-selection-region">
      <button
        type="button"
        className="custom-counter-block"
        onClick={increment}
      >
        Count: {count}
      </button>
    </div>
  );
}

/** Registers each demo block's model, renderer, and slash conversion together. */
export function installCustomBlocks(editor: ReactEditor): () => void {
  const disposers = [
    editor.blocks.register({
      definition: sliderBlockDefinition,
      render: SliderBlock,
      slashCommand: { title: "Slider", group: "Turn into", keywords: ["range", "value"] },
    }),
    editor.blocks.register({
      definition: counterBlockDefinition,
      render: CounterBlock,
      slashCommand: { title: "Counter", group: "Turn into", keywords: ["count", "button"] },
    }),
  ];
  return () => disposers.reverse().forEach((dispose) => dispose());
}
