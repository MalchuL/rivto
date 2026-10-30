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

/** Note admonition. Markdown content plus an emoji. */
export const NOTE_BLOCK_TYPE = "demo.note";

/** Tip admonition. Markdown content plus an emoji. */
export const TIP_BLOCK_TYPE = "demo.tip";

/** Warning admonition. Markdown content plus an emoji. */
export const WARNING_BLOCK_TYPE = "demo.warning";

/** Demo bookmark block. The title is content; URL and description are properties. */
export const BOOKMARK_BLOCK_TYPE = "demo.bookmark";

/** Demo table-of-contents block. Generated entries are not persisted. */
export const TABLE_OF_CONTENTS_BLOCK_TYPE = "demo.table-of-contents";

/** Demo math block. The expression source is block content. */
export const MATH_BLOCK_TYPE = "demo.math";

/** Admonition tones, each stored as its own block type. */
export const ADMONITION_TONES = ["note", "tip", "warning"] as const;

/** One separable admonition tone. */
export type AdmonitionTone = (typeof ADMONITION_TONES)[number];

/** Block type string for each admonition tone. */
export const ADMONITION_BLOCK_TYPE: Record<AdmonitionTone, string> = {
  note: NOTE_BLOCK_TYPE,
  tip: TIP_BLOCK_TYPE,
  warning: WARNING_BLOCK_TYPE,
};

/** User-visible name for each admonition slash command and badge. */
export const ADMONITION_LABELS: Record<AdmonitionTone, string> = {
  note: "Note",
  tip: "Tip",
  warning: "Warning",
};

/** Emoji applied when that admonition type is created. */
export const ADMONITION_DEFAULT_EMOJI: Record<AdmonitionTone, string> = {
  note: "💡",
  tip: "✅",
  warning: "⚠️",
};

/** Persisted admonition properties. The tone is the block type, not a property. */
export interface AdmonitionProps {
  emoji: string;
}

/** Persisted bookmark properties. Description is manual and never scraped. */
export interface BookmarkProps {
  url: string;
  description: string;
}

const admonitionPropSchema = z.object({
  emoji: z.string().min(1),
}).strict();

/**
 * Returns the admonition tone encoded by a block type.
 *
 * @param type - Block type string.
 * @returns The tone, or undefined when the type is not an admonition.
 */
export function admonitionTone(type: string): AdmonitionTone | undefined {
  if (type === NOTE_BLOCK_TYPE) return "note";
  if (type === TIP_BLOCK_TYPE) return "tip";
  if (type === WARNING_BLOCK_TYPE) return "warning";
  return undefined;
}

/** Builds one admonition definition. The tone is the type, so the three cannot share a variant field. */
function admonitionDefinition(tone: AdmonitionTone): BlockDefinition {
  return {
    type: ADMONITION_BLOCK_TYPE[tone],
    title: ADMONITION_LABELS[tone],
    defaultProps: { emoji: ADMONITION_DEFAULT_EMOJI[tone] },
    propSchema: admonitionPropSchema,
  };
}

/** Validated note contract. */
export const noteBlockDefinition = admonitionDefinition("note");

/** Validated tip contract. */
export const tipBlockDefinition = admonitionDefinition("tip");

/** Validated warning contract. */
export const warningBlockDefinition = admonitionDefinition("warning");

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

/** Math contract. The expression source lives in block content and is evaluated at render time. */
export const mathBlockDefinition: BlockDefinition = {
  type: MATH_BLOCK_TYPE,
  title: "Math",
  defaultProps: {},
  propSchema: z.object({}).strict(),
};
