/** Numeric field used by creation defaults and property panels. */
export function NumberControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange(value: number): void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        min={1}
        max={160}
        value={typeof value === "number" ? value : ""}
        placeholder={value === undefined ? "Mixed" : undefined}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}
