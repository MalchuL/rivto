/**
 * Range control with a live preview for stroke widths and font sizes.
 *
 * The shadcn Slider owns pointer capture, keyboard input and accessible thumb
 * values. Changes preview live through onValueChange; the owning property panel
 * retains its commit/cancel lifecycle. Hosts should use the slider keyboard or
 * pointer API rather than assigning an input value. The preview swaps between
 * a dot whose diameter tracks the value and a serif "T" whose font size tracks it.
 */
import { Slider } from "../ui/slider";
import { editorControlProps } from "../../constants";
import { useEffect, useState } from "react";

/** Preview glyph shown before the slider. */
export type SizePreview = "dot" | "text";

const CONTROL_CLASS = "edgeless-size-control";
const PREVIEW_CLASS = "edgeless-size-control-preview";
const DOT_CLASS = "edgeless-size-control-dot";
const LETTER_CLASS = "edgeless-size-control-letter";
const RANGE_CLASS = "edgeless-size-control-range";
const VALUE_CLASS = "edgeless-size-control-value";

/**
 * Renders a labeled slider with a size preview and numeric readout.
 *
 * @param props - Accessible label, current value (non-numbers render as the
 * minimum), range bounds, preview glyph, and change callback.
 * @returns A group wrapping the preview, accessible slider thumb, and value.
 */
export function SizeControl({
  label,
  value,
  min = 1,
  max = 64,
  preview = "dot",
  onChange,
}: {
  readonly label: string;
  readonly value: unknown;
  readonly min?: number;
  readonly max?: number;
  readonly preview?: SizePreview;
  onChange(value: number): void;
}) {
  const numeric = typeof value === "number" ? value : min;
  const [draft, setDraft] = useState(numeric);
  useEffect(() => setDraft(typeof value === "number" ? value : min), [value, min]);

  const commit = (next: number) => {
    setDraft(next);
    onChange(next);
  };

  const diameter = Math.max(4, Math.min(28, draft));
  const textSize = Math.max(11, Math.min(30, Math.round(10 + ((draft - min) / Math.max(1, max - min)) * 18)));

  return (
    <div role="group" aria-label={label} className={CONTROL_CLASS} data-preview={preview} title={label}>
      <span className={PREVIEW_CLASS} aria-hidden="true">
        {preview === "text" ? (
          <span className={LETTER_CLASS} style={{ fontSize: textSize }}>T</span>
        ) : (
          <span className={DOT_CLASS} style={{ width: diameter, height: diameter }} />
        )}
      </span>
      <Slider {...editorControlProps}
        className={RANGE_CLASS}
        aria-label={label}
        min={min}
        max={max}
        value={[draft]}
        onValueChange={([next]) => commit(next!)}
      />
      <span className={VALUE_CLASS}>{draft}</span>
    </div>
  );
}
