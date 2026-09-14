import { useEffect, useState } from "react";

/** Compact solid color swatch with live preview (parent commits undo later). */
export function ColorControl({
  label,
  value,
  mixed,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  mixed?: boolean;
  disabled?: boolean;
  onChange(value: string): void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <label className="edgeless-color-swatch" data-mixed={mixed || undefined} data-disabled={disabled || undefined} title={label}>
      <span className="edgeless-color-swatch-face" style={{ backgroundColor: draft }} aria-hidden="true" />
      <input
        type="color"
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
