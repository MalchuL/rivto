/**
 * Compact color swatch backed by a native color input.
 *
 * The visible face previews the draft color while the transparent
 * `<input type="color">` stretched over it opens the platform picker and
 * receives programmatic `input` events from hosts and tests. A mixed
 * selection shows a checkerboard face (see `visuals.css`) and the parent
 * commits undo entries once the interaction settles.
 */
import { useEffect, useState } from "react";

/** `edgeless-color-swatch` and `edgeless-color-swatch-face` are hooks for the mixed checkerboard rule. */
const SWATCH_CLASS =
  "edgeless-color-swatch relative inline-grid size-7 shrink-0 cursor-pointer place-items-center rounded-full focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45";
const FACE_CLASS = "edgeless-color-swatch-face pointer-events-none box-border size-5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/18%)]";
const INPUT_CLASS = "absolute inset-0 m-0 size-full cursor-pointer rounded-full border-0 bg-transparent p-0 opacity-0";

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
      <input
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
