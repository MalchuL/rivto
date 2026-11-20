import type { EditorMode } from "@chulane/rivto";
/** DOM boundary for a document panel, including full-document and embedded subtree surfaces. */
export const PANEL_ATTRIBUTE = "data-rivto-panel";
/** Selector used to distinguish repeated render occurrences and source documents. */
export const PANEL_SELECTOR = `[${PANEL_ATTRIBUTE}]`;
/** Attribute identifying a panel's rendered surface mode. */
export const PANEL_SURFACE_ATTRIBUTE = "data-rivto-surface";

/**
 * Interprets a panel's rendered surface attribute.
 *
 * @param value - Current attribute value, or null or undefined when absent.
 * @returns The supported surface mode, or undefined for an unrecognized value.
 */
export function getSurfaceTypeFromAttribute(
  value: string | null | undefined,
): EditorMode | undefined {
  return value === "block" || value === "edgeless" ? value : undefined;
}
