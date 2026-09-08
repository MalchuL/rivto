/**
 * Owns Markdown-safe keyboard indentation for the documentation editor.
 * List nesting maps directly to Markdown, while ordinary paragraph indentation
 * does not, so Tab handling deliberately applies only when a list command works.
 */

import { liftListItem, sinkListItem } from "@tiptap/pm/schema-list";
import type { EditorView } from "@tiptap/pm/view";

export type DocumentationIndentAction = "indent" | "outdent";

/**
 * Resolves an unmodified Tab keystroke to its requested nesting operation.
 *
 * @param event Keyboard state supplied by the editor or a focused test.
 * @returns Indent direction for Tab/Shift+Tab, otherwise `null`.
 */
export function getDocumentationIndentAction(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey">,
): DocumentationIndentAction | null {
  let action: DocumentationIndentAction | null = null;
  if (event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey) {
    action = event.shiftKey ? "outdent" : "indent";
  }
  return action;
}

/**
 * Applies Tab or Shift+Tab to the selected Markdown list item.
 *
 * @param view Active ProseMirror view.
 * @param event Browser keyboard event.
 * @returns `true` when list nesting changed and the event was consumed.
 */
export function handleDocumentationIndentKey(view: EditorView, event: KeyboardEvent): boolean {
  const action = getDocumentationIndentAction(event);
  const listItem = view.state.schema.nodes.listItem;
  let handled = false;

  if (action !== null && listItem) {
    const command = action === "indent" ? sinkListItem(listItem) : liftListItem(listItem);
    handled = command(view.state, view.dispatch);
    if (handled) {
      event.preventDefault();
    }
  }

  return handled;
}
