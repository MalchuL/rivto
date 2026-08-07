import { useEffect, useState } from "react";

export type SizePreview = "dot" | "text";

/** Range control with a live preview (stroke dot or scaling “T”). */
export function SizeControl({
  label,
  value,
  min = 1,
  max = 64,
  preview = "dot",
  onChange,
}: {
  label: string;
  value: unknown;
  min?: number;
  max?: number;
  preview?: SizePreview;
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
    <label className="edgeless-size-control" data-preview={preview} title={label}>
      <span className="edgeless-size-control-preview" aria-hidden="true">
        {preview === "text" ? (
          <span className="edgeless-size-control-letter" style={{ fontSize: textSize }}>T</span>
        ) : (
          <span className="edgeless-size-control-dot" style={{ width: diameter, height: diameter }} />
        )}
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={draft}
        onChange={(event) => commit(Number(event.currentTarget.value))}
      />
      <span className="edgeless-size-control-value">{draft}</span>
    </label>
  );
}

/** @deprecated Prefer SizeControl with an explicit preview. */
export const CircleSizeControl = SizeControl;
