/** Preset palette for tag colors (editable; free hex also allowed). */
export const TAG_COLOR_PRESETS = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#64748b",
] as const;

export const DEFAULT_TAG_COLOR = TAG_COLOR_PRESETS[0];

export interface Tag {
  id: string;
  /** Owning project — only this project can edit/delete the tag. */
  projectId: string;
  /** Displayed as `#name`; stored without the leading `#`. */
  name: string;
  description?: string;
  /** Hex color, e.g. `#0f766e`. */
  color: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateTagInput = {
  projectId: string;
  name: string;
  description?: string;
  color?: string;
};

export type UpdateTagInput = {
  id: string;
  name?: string;
  description?: string;
  color?: string;
};

export type AvailableTag = Tag & {
  inherited: boolean;
  /** Set when inherited — name of the owning project. */
  ownerProjectName?: string;
};

/** Normalize user input into a tag name (no `#`, no spaces). */
export function normalizeTagName(raw: string): string {
  const stripped = raw.trim().replace(/^#+/, "").replace(/\s+/g, "");
  return stripped;
}

export function formatTagName(name: string): string {
  return `#${name}`;
}

export function normalizeTagColor(raw: string | undefined): string {
  if (!raw) return DEFAULT_TAG_COLOR;
  const value = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const [, a, b, c] = value;
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  return DEFAULT_TAG_COLOR;
}
