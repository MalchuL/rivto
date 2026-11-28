/**
 * Schema rule for the props of HTML canvas elements, registered as the element
 * type's `validate` function.
 *
 * @module
 */
import { isDangerousKey, isPortableValue } from "@chulane/rivto-utils";

/**
 * Validates the merged property bag of an HTML canvas element.
 *
 * `undefined` values are allowed so a patch can remove a key. The registry
 * merges defaults before calling this, so `html` is always expected. Every
 * other value must be portable, the same rule the document applies when the
 * props are stored.
 *
 * @param props - Merged element properties, including `html`.
 * @returns The same property record when it is valid.
 * @throws If `html` is missing or any property is not portable data.
 */
export function validateHtmlElementProps(props: Record<string, unknown>): Record<string, unknown> {
  if (typeof props.html !== "string") {
    throw new Error("HTML element requires an html string");
  }
  for (const [key, value] of Object.entries(props)) {
    if (isDangerousKey(key) || (value !== undefined && !isPortableValue(value))) {
      throw new Error(`Invalid HTML element property ${key}`);
    }
  }
  return props;
}
