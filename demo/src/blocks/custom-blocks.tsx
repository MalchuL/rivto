/**
 * Demo custom block renderers for Slider and Counter, plus their extension
 * registrations. Slider previews its range locally during a pointer drag and
 * commits once the drag finishes so each drag is one document write.
 *
 * @module
 */
import {
  blockExtension,
  kanbanExtension,
  bentoExtension,
  tableExtension,
  columnsExtension,
  MarkdownContent,
  useBlockEditing,
  type ReactEditorExtension,
} from "@chulane/rivto-react";
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  COUNTER_BLOCK_TYPE,
  counterBlockDefinition,
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

/**
 * Demo block with collaborative text and one validated range property.
 *
 * The thumb previews locally while dragging. The document, CRDT, and undo
 * history receive a single write when the pointer is released. Keyboard steps
 * still commit immediately.
 *
 * @param blockId - Stable ID of the slider block.
 * @returns The markdown body and range control, or null after deletion.
 */
function SliderBlock({ blockId }: { readonly blockId: string }) {
  const { block, getProp, setProp } = useBlockEditing<SliderProps>(blockId);
  const draggingRef = useRef(false);
  const [draftValue, setDraftValue] = useState<number | null>(null);
  const committedValue = getProp("value") ?? 50;
  const value = draftValue ?? committedValue;

  /**
   * Writes the finished range into the block, skipping no-ops and mid-drag input.
   *
   * @param next - Value shown by the input when the gesture completed.
   * @returns Nothing; the document is updated through `setProp`.
   */
  const commitValue = useCallback((next: number) => {
    setDraftValue(null);
    if (next === (getProp("value") ?? 50)) return;
    setProp("value", next);
  }, [getProp, setProp]);

  /**
   * Marks the current pointer gesture as an in-progress drag.
   *
   * Keyboard steps never set this flag, so they still commit on each `input`.
   *
   * @returns Nothing; only the drag flag is updated.
   */
  const beginDrag = () => {
    draggingRef.current = true;
  };

  /**
   * Follows the thumb locally while dragging; keyboard changes write immediately.
   *
   * React `onChange` maps to the continuous `input` event, which would otherwise
   * emit one CRDT update per pointer move.
   *
   * @param event - Native range `input` event.
   * @returns Nothing; either draft state or the document property is updated.
   */
  const previewOrCommit = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.currentTarget.value);
    if (draggingRef.current) setDraftValue(next);
    else commitValue(next);
  };

  /**
   * Persists the previewed value after pointer release or blur.
   *
   * @param event - Event whose current target is the range input.
   * @returns Nothing; persistence is delegated to `commitValue`.
   */
  const finishDrag = (event: PointerEvent<HTMLInputElement> | FocusEvent<HTMLInputElement>) => {
    draggingRef.current = false;
    commitValue(Number(event.currentTarget.value));
  };

  /**
   * Drops an in-progress preview when the browser cancels the pointer gesture.
   *
   * @returns Nothing; the displayed value falls back to the committed property.
   */
  const discardDrag = () => {
    draggingRef.current = false;
    setDraftValue(null);
  };

  if (!block) return null;
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
          onPointerDown={beginDrag}
          onChange={previewOrCommit}
          onPointerUp={finishDrag}
          onPointerCancel={discardDrag}
          onBlur={finishDrag}
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

/** Creation-time extensions for the demo's optional and custom block types. */
export const customBlockExtensions: readonly ReactEditorExtension[] = [
    kanbanExtension(),
    bentoExtension(),
    tableExtension(),
    columnsExtension(),
    blockExtension({
      definition: sliderBlockDefinition,
      render: SliderBlock,
      slashCommand: { title: "Slider", group: "Turn into", keywords: ["range", "value"] },
    }),
    blockExtension({
      definition: counterBlockDefinition,
      render: CounterBlock,
      slashCommand: { title: "Counter", group: "Turn into", keywords: ["count", "button"] },
    }),
    {
      id: "clipboard.demo-counter",
      setup: (reactEditor) => {
        reactEditor.clipboard.registerFormatter({
          id: "demo.counter",
          matches: ({ block }) => block.type === COUNTER_BLOCK_TYPE,
          format: ({ block }) => {
            const text = `Count: ${block.props.count}`;
            return { plain: text, markdown: text, html: `<p>${text}</p>` };
          },
        });
      },
    },
];
