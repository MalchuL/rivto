/**
 * Compact color swatch backed by a native color input.
 *
 * The visible face previews the draft color while the transparent
 * `<input type="color">` stretched over it opens the platform picker and
 * receives programmatic `input` events from hosts and tests. A mixed
 * selection shows a checkerboard face (see `visuals.css`) and the parent
 * commits undo entries once the interaction settles.
 */
import { editorControlProps } from "../../../../constants";
import { useEffect, useState } from "react";

/** `edgeless-color-swatch` and `edgeless-color-swatch-face` are hooks for the mixed checkerboard rule. */
const SWATCH_CLASS = "edgeless-color-swatch";
const FACE_CLASS = "edgeless-color-swatch-face";
const INPUT_CLASS = "edgeless-color-control-input";

/**
 * Renders a color swatch that previews edits live.
 *
 * @param props - Accessible label, committed color, whether the selection
 * holds several colors, disabled state, and the change callback.
 * @returns A label wrapping the swatch face and the native color input.
 */
export function ColorControl({
  label,
  value,
  mixed,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly mixed?: boolean;
  readonly disabled?: boolean;
  onChange(value: string): void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <label className={SWATCH_CLASS} data-mixed={mixed || undefined} data-disabled={disabled || undefined} title={label}>
      <span className={FACE_CLASS} style={{ backgroundColor: draft }} aria-hidden="true" />
      <input {...editorControlProps}
        type="color"
        className={INPUT_CLASS}
        aria-label={label}
        value={draft}
        disabled={disabled}
        onInput={(event) => {
          const next = event.currentTarget.value;
          setDraft(next);
          onChange(next);
        }}
      />
    </label>
  );
}
