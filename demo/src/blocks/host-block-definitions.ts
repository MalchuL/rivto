/**
 * Persisted contracts for the demo's extension-only blocks.
 *
 * These definitions stay free of React so host tests can validate defaults
 * without starting an editor. Renderers and slash registration live in
 * `host-blocks.tsx`.
 *
 * @module
 */
import type { BlockDefinition } from "@chulane/rivto";
import { z } from "zod";

/** Demo callout block. Markdown content plus variant and emoji properties. */
export const CALLOUT_BLOCK_TYPE = "demo.callout";

/** Demo bookmark block. The title is content; URL and description are properties. */
export const BOOKMARK_BLOCK_TYPE = "demo.bookmark";

/** Demo table-of-contents block. Generated entries are not persisted. */
export const TABLE_OF_CONTENTS_BLOCK_TYPE = "demo.table-of-contents";

/** Demo display-math block. The LaTeX source is block content. */
export const MATH_EQUATION_BLOCK_TYPE = "demo.math-equation";

/** Callout tones a host can persist. */
export const CALLOUT_VARIANTS = ["note", "tip", "warning"] as const;

/** One persisted callout tone. */
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

/** Tone applied when a callout is created or an invalid tone is repaired. */
export const DEFAULT_CALLOUT_VARIANT: CalloutVariant = "note";

/** Emoji applied when a callout is created. */
export const DEFAULT_CALLOUT_EMOJI = "💡";

/** User-visible labels for the callout tone control. */
export const CALLOUT_VARIANT_LABELS: Record<CalloutVariant, string> = {
  note: "Note",
  tip: "Tip",
  warning: "Warning",
};

/** Persisted callout properties. */
export interface CalloutProps {
  variant: CalloutVariant;
  emoji: string;
}

/** Persisted bookmark properties. Description is manual and never scraped. */
export interface BookmarkProps {
  url: string;
  description: string;
}

/**
 * Returns whether a string is an absolute HTTP or HTTPS URL.
 *
 * Empty strings are not URLs. Callers that treat an empty URL as "not set yet"
 * check that case separately so a setup form can stay editable.
 *
 * @param value - Candidate URL without surrounding whitespace.
 * @returns True when the value has an HTTP(S) protocol and a host.
 */
export function isHttpUrl(value: string): boolean {
  if (!value || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Returns whether a string is one of the persisted callout tones.
 *
 * @param value - Raw control value.
 * @returns True when the value is note, tip, or warning.
 */
export function isCalloutVariant(value: string): value is CalloutVariant {
  return (CALLOUT_VARIANTS as readonly string[]).includes(value);
}

/** Validated callout contract installed by the demo plugin. */
export const calloutBlockDefinition: BlockDefinition = {
  type: CALLOUT_BLOCK_TYPE,
  title: "Callout",
  defaultProps: {
    variant: DEFAULT_CALLOUT_VARIANT,
    emoji: DEFAULT_CALLOUT_EMOJI,
  },
  propSchema: z.object({
    variant: z.enum(CALLOUT_VARIANTS),
    emoji: z.string().min(1),
  }).strict(),
};

/** Validated bookmark contract installed by the demo plugin. */
export const bookmarkBlockDefinition: BlockDefinition = {
  type: BOOKMARK_BLOCK_TYPE,
  title: "Bookmark",
  defaultProps: { url: "", description: "" },
  propSchema: z.object({
    url: z.string().refine((value) => value === "" || isHttpUrl(value)),
    description: z.string(),
  }).strict(),
};

/** Contentless table-of-contents contract. Entries are derived at render time. */
export const tableOfContentsBlockDefinition: BlockDefinition = {
  type: TABLE_OF_CONTENTS_BLOCK_TYPE,
  title: "Table of contents",
  defaultProps: {},
  propSchema: z.object({}).strict(),
};

/** Display-math contract. The formula source lives in block content. */
export const mathEquationBlockDefinition: BlockDefinition = {
  type: MATH_EQUATION_BLOCK_TYPE,
  title: "Math equation",
  defaultProps: {},
  propSchema: z.object({}).strict(),
};
