/**
 * Jest stand-in for `lucide-react/dynamic.mjs`.
 *
 * The published dynamic entry is ESM-only. Unit tests that import the
 * Intelligent UI library do not render icons, so they do not need the real
 * icon catalog.
 *
 * @module
 */

/** Icon names the stand-in reports as available. */
export const iconNames = ["check"] as const;

/**
 * Renders nothing in place of a lazily loaded Lucide icon.
 *
 * @returns No element.
 */
export function DynamicIcon(): null {
  return null;
}
