import type { EditorBlockInput } from "@chulane/rivto";

/** Shared function translating an HTML list item to persisted list properties. */
export const CLIPBOARD_LIST_PROPERTIES_KEY = "rivto.clipboard.list-properties";

/**
 * Reads host list properties from a detached HTML list item.
 *
 * @param element - List item parsed from the external clipboard document.
 * @returns List properties to attach, or undefined to leave the block undecorated.
 */
export type ClipboardListProperties = (element: Element) => EditorBlockInput["listProps"];

/**
 * Translates HTML list and checkbox items using the built-in block property format.
 *
 * @param element - Detached HTML list item and its parent list.
 * @returns Built-in checkbox, numbered-list, or ordinary-list properties.
 */
export const defaultClipboardListProperties: ClipboardListProperties = (element) => {
  const checkbox = element.querySelector('input[type="checkbox"]');
  if (checkbox) {
    return { type: "checkbox", checked: checkbox.hasAttribute("checked") };
  }
  return { type: element.parentElement?.tagName === "OL" ? "numbered_list" : "list" };
};
