import { BlockDOMSelection } from "@chulane/rivto-page";
import { isStructuralSelection, type Selection } from "@chulane/rivto";
import { PageNavigationController } from "../../surfaces/page/page-navigation-controller";
import type { RestoreDOMSelectionOptions } from "./api";

/**
 * DOM ↔ editor selection bridge for Rivto's multi-contenteditable surfaces.
 *
 * ## DOM vocabulary (why helpers take Node vs HTMLElement)
 *
 * Inheritance (each row is a more specific kind of the row above):
 *
 * ```text
 * Node          — anything in the DOM tree
 *  └── Element      — a tag (`<div>`, `<span>`, `<svg>`, …)
 *       └── HTMLElement — an HTML tag (has focus(), dataset, contentEditable, …)
 * ```
 *
 * Important: character content is also a Node. Markup like
 * `<div>hello</div>` is not “a div with a string property”; the browser
 * builds a real child object:
 *
 * ```text
 * HTMLElement <div>          ← Element (and HTMLElement)
 *   └── Text "hello"         ← Node, but NOT an Element
 * ```
 *
 * That Text object is what `Selection.anchorNode` usually points at, with
 * `anchorOffset` as a character index inside it (e.g. offset 2 = between
 * `e` and `l`). Selection APIs need an object to point at; a plain string
 * field on the parent would not work.
 *
 * Quick map used throughout this file:
 *
 * | Type         | Meaning                         | Example              | Has closest()? |
 * |--------------|---------------------------------|----------------------|----------------|
 * | Node         | Any tree piece                  | Text, Element, …    | no (not always)|
 * | Element      | A tag node                      | `<div>`, `<svg>`     | yes            |
 * | HTMLElement  | An HTML tag                     | block / block content  | yes + HTML APIs|
 * | Text         | Character content (a Node)      | `"hello"`            | no             |
 *
 * So:
 * - `node: Node` → caret target (usually Text; sometimes the content Element).
 * - `content` / `root: HTMLElement` → HTML hosts we query with selectors /
 *   `closest()` / `focus()`.
 *
 * Typical Rivto tree:
 *
 * ```text
 * HTMLElement (editor root)
 * └── HTMLElement (block host, data-block-id)
 *     └── HTMLElement (block content, contenteditable)
 *         └── Text ("hello")   ← Selection often points here
 * ```
 */
/**
 * Reads `window.getSelection()` when both endpoints belong to this editor root.
 *
 * Anchor and focus are read independently instead of using Range start/end.
 * A Range normalizes endpoints into document order and would lose the
 * direction of a bottom-to-top selection.
 *
 * @param root - EditorPanel root; both endpoints must live under it.
 * The root must be an attached block-editor occurrence with a registered host bridge.
 *
 * @returns Directed selection, or `undefined` when there is no usable
 *   browser selection inside this editor.
 */
export function readEditorDOMSelection(root: HTMLElement): Selection | undefined {
  const navigation = PageNavigationController.getForElement(root);
  if (!navigation) {
    return undefined;
  }
  const selection = new BlockDOMSelection(navigation.selection).readEditorDOMSelection(root);
  return selection
    ? { ...selection, blocks: selection.blocks.map((block) => ({ ...block })) }
    : undefined;
}

/**
 * Restores the browser range represented by an editor text selection.
 *
 * Structural commands can preserve block IDs and text offsets while React
 * reparents their DOM elements. The browser range still points at the detached
 * nodes and is commonly cleared. This helper resolves both stored endpoints
 * against the newly rendered content elements, focuses the moving endpoint,
 * and recreates the directed native selection inside that block.
 *
 * Whole-block selections have no native text range, so they return
 * false without changing focus. Missing rendered endpoints also return false;
 * callers can safely retry after a later render.
 *
 * @param root - Active EditorPanel root containing the rendered block content.
 * @param selection - Editor selection captured before the structural command.
 * @param options - Virtual endpoint mounting and navigation policy.
 * Unattached occurrences return false without modifying browser selection.
 *
 * @returns True when a text selection was resolved and restored.
 */
export function restoreEditorDOMSelection(
  root: HTMLElement,
  selection: Selection,
  options?: RestoreDOMSelectionOptions,
): boolean {
  const navigation = PageNavigationController.getForElement(root);
  if (!navigation || isStructuralSelection(selection)) {
    return false;
  }
  navigation.mountBlocks(
    [selection.anchorBlockId, selection.focusBlockId].filter((id): id is string => Boolean(id)),
    options,
  );
  return new BlockDOMSelection(navigation.selection).restoreEditorDOMSelection(root, selection);
}
