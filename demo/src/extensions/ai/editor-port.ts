/**
 * Adapts the public editor block API to the agent document port.
 *
 * Writes go through `reactEditor.blocks`, so they are normal document
 * transactions. A synced peer observes them the same way it observes typing.
 *
 * @module
 */

import type { EditorBlock, EditorBlockInput } from "@chulane/rivto";
import { BLOCK_CONTENT_ATTRIBUTE, type ReactEditor } from "@chulane/rivto-react";
import type { AiBlockRecord, AiDocumentPort } from "./editor-tools.ts";
import { caretOffset, setCaretOffset } from "./caret.ts";

/**
 * Copies a block without ids so insertion generates a new identity.
 *
 * @param block - Detached source subtree.
 * @returns Creation input for the copy.
 */
function cloneInput(block: EditorBlock): EditorBlockInput {
  return {
    type: block.type,
    content: block.content,
    props: { ...block.props },
    listProps: { ...block.listProps },
    pluginData: { ...block.pluginData },
    children: block.children.map(cloneInput),
  };
}

/** @returns Block records in document order. */
function flatten(blocks: readonly EditorBlock[], into: AiBlockRecord[]): void {
  for (const block of blocks) {
    into.push({ id: block.id, type: block.type, content: block.content });
    flatten(block.children, into);
  }
}

/**
 * Document port backed by one React editor.
 *
 * @param reactEditor - Editor the extension was installed on.
 * @returns Port the agent calls while a tool streams.
 */
export function createEditorPort(reactEditor: ReactEditor): AiDocumentPort {
  const blocks = reactEditor.blocks;
  return {
    listBlocks() {
      const records: AiBlockRecord[] = [];
      flatten(blocks.getBlocks(), records);
      return records;
    },
    getBlock(id) {
      const block = blocks.getBlock(id);
      return block ? { id: block.id, type: block.type, content: block.content } : undefined;
    },
    insertParagraph(content, afterId) {
      const created = blocks.insertBlock({
        ...reactEditor.createDefaultBlock(),
        content,
      }, afterId);
      const blockId = created.id;
      requestAnimationFrame(() => {
        reactEditor.events.getRoot()
          ?.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`)
          ?.scrollIntoView({ block: "nearest" });
      });
      return { id: blockId };
    },
    updateContent(id, content) {
      blocks.updateBlock(id, { content });
    },
    duplicateBlock(id) {
      const source = blocks.getBlock(id);
      if (!source) return undefined;
      const created = blocks.insertBlock(cloneInput(source), id);
      return { id: created.id };
    },
    deleteBlock(id) {
      if (!blocks.hasBlock(id)) return false;
      blocks.removeBlock(id);
      return true;
    },
  };
}

/**
 * Inserts accepted ghost text at the live caret and moves the caret after it.
 *
 * The model update is synchronous. The caret move waits a frame so the writing
 * block can replace its text node first.
 *
 * @param reactEditor - Editor that owns the block.
 * @param blockId - Focused block.
 * @param text - Suggestion to insert. It is not a replacement of the prefix.
 * @returns Nothing.
 */
export function insertSuggestion(reactEditor: ReactEditor, blockId: string, text: string): void {
  const root = reactEditor.events.getRoot();
  const block = reactEditor.blocks.getBlock(blockId);
  if (!root || !block) return;
  const place = root.ownerDocument.activeElement;
  const offset = place instanceof HTMLElement && place.hasAttribute(BLOCK_CONTENT_ATTRIBUTE)
    ? caretOffset(place) ?? block.content.length
    : block.content.length;
  const next = block.content.slice(0, offset) + text + block.content.slice(offset);
  reactEditor.blocks.updateBlock(blockId, { content: next });
  const target = offset + text.length;
  requestAnimationFrame(() => {
    const current = reactEditor.events.getRoot();
    if (current) setCaretOffset(current, blockId, target);
  });
}
