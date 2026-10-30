/**
 * Editor tools a model can call, and the document port that applies them.
 *
 * The port is the harness boundary. The React adapter writes through the
 * editor; tests use {@link createMemoryDocument}. Streaming tools copy the
 * JSON `content` field into the document as argument frames arrive.
 *
 * @module
 */

import type { ChatTool, JsonSchema } from "./llm.ts";
import { readJsonStringField } from "./json-field.ts";
import { buildPassage, type Rng } from "./words.ts";

/** Flat block the model and the panel can show. */
export interface AiBlockRecord {
  readonly id: string;
  readonly type: string;
  readonly content: string;
}

/**
 * Document operations the agent is allowed to perform.
 *
 * Implementations must apply `updateContent` immediately. The sync demo relies
 * on that so each token is a normal block write peers can converge on.
 */
export interface AiDocumentPort {
  listBlocks(): readonly AiBlockRecord[];
  getBlock(id: string): AiBlockRecord | undefined;
  /** Inserts a writing block and returns its new id. */
  insertParagraph(content: string, afterId?: string): { id: string };
  updateContent(id: string, content: string): void;
  /** Copies a block after itself. @returns The copy, or undefined when `id` is missing. */
  duplicateBlock(id: string): { id: string } | undefined;
  /** @returns False when the block does not exist. */
  deleteBlock(id: string): boolean;
}

/** Tool the planner selected. `content` is omitted for structural tools. */
export interface EditorPlan {
  readonly tool: string;
  readonly blockId?: string;
  readonly afterId?: string;
  readonly content?: string;
}

const objectSchema = (properties: JsonSchema["properties"], required: readonly string[] = []): JsonSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const stringField = (description: string): JsonSchema => ({ type: "string", description });

/** Tools shipped with the demo harness. Names are stable for the mock and a future model. */
export const EDITOR_TOOLS: readonly ChatTool[] = [
  {
    name: "list_blocks",
    description: "List blocks in document order with id, type, and content.",
    parameters: objectSchema({}),
  },
  {
    name: "insert_block",
    description: "Insert a paragraph. Content streams in while the call is open.",
    parameters: objectSchema({
      afterId: stringField("Insert after this block id. Omit to append."),
      content: stringField("Paragraph text."),
    }, ["content"]),
  },
  {
    name: "update_block",
    description: "Replace a block's text. Content streams into the document as tokens arrive.",
    parameters: objectSchema({
      blockId: stringField("Block to rewrite."),
      content: stringField("Replacement text."),
    }, ["blockId", "content"]),
  },
  {
    name: "append_text",
    description: "Append text to a block, streaming as tokens arrive.",
    parameters: objectSchema({
      blockId: stringField("Block to extend."),
      content: stringField("Text to append."),
    }, ["blockId", "content"]),
  },
  {
    name: "duplicate_block",
    description: "Duplicate a block and its children, inserting the copy after the source.",
    parameters: objectSchema({
      blockId: stringField("Block to duplicate."),
    }, ["blockId"]),
  },
  {
    name: "delete_block",
    description: "Delete a block and its children.",
    parameters: objectSchema({
      blockId: stringField("Block to delete."),
    }, ["blockId"]),
  },
];

/**
 * Chooses a tool from the latest user text.
 *
 * A `[block <id>]` tag selects the target. Words like "duplicate" or "rewrite"
 * pick the tool. Anything else inserts a paragraph so an unspecific prompt
 * does not overwrite existing text.
 *
 * @param input - User text, available tool names, optional focused block, and rng.
 * @returns A plan, or null when no known tool is available.
 */
export function planEditorAction(input: {
  readonly userText: string;
  readonly toolNames: readonly string[];
  readonly focusBlockId?: string;
  readonly rng: Rng;
}): EditorPlan | null {
  const available = new Set(input.toolNames);
  const tagged = /\[block ([^\]]+)\]/.exec(input.userText)?.[1];
  const focus = tagged || input.focusBlockId;
  const lower = input.userText.toLowerCase();
  let tool: string | null = null;
  if (/\blist\b/.test(lower) && available.has("list_blocks")) tool = "list_blocks";
  else if (/\bduplicat/.test(lower) && available.has("duplicate_block")) tool = "duplicate_block";
  else if (/\b(delete|remove)\b/.test(lower) && available.has("delete_block")) tool = "delete_block";
  else if (/\b(rewrite|edit|update|change)\b/.test(lower) && available.has("update_block")) tool = "update_block";
  else if (/\b(append|continue)\b/.test(lower) && available.has("append_text")) tool = "append_text";
  else if (/\b(add|insert|new)\b/.test(lower) && available.has("insert_block")) tool = "insert_block";
  else if (available.has("insert_block")) tool = "insert_block";
  else if (available.has("update_block")) tool = "update_block";
  else return null;

  const writes = tool === "insert_block" || tool === "update_block" || tool === "append_text";
  return {
    tool,
    blockId: tool === "insert_block" || tool === "list_blocks" ? undefined : focus,
    afterId: tool === "insert_block" ? focus : undefined,
    content: writes ? buildPassage(input.rng) : undefined,
  };
}

/** In-progress tool call whose arguments are still streaming. */
export interface LiveToolState {
  name: string;
  argumentsText: string;
  blockId?: string;
  base: string;
  written: string;
  done: boolean;
}

/** @returns An empty accumulator for one tool call. */
export function createLiveTool(): LiveToolState {
  return { name: "", argumentsText: "", base: "", written: "", done: false };
}

/**
 * Applies newly arrived tool-argument text to the document.
 *
 * `update_block`, `append_text`, and `insert_block` write the growing
 * `content` string. Other tools wait until {@link finishTool}.
 *
 * @param state - Accumulator for this call. Updated in place.
 * @param delta - Name and/or the next JSON fragment.
 * @param port - Document that receives the write.
 * @param focusBlockId - Block the user pointed at, when the call omits one.
 * @returns Nothing.
 */
export function pushToolDelta(
  state: LiveToolState,
  delta: { readonly name?: string; readonly argumentsDelta?: string },
  port: AiDocumentPort,
  focusBlockId?: string,
): void {
  if (state.done) return;
  if (delta.name) state.name = delta.name;
  if (delta.argumentsDelta) state.argumentsText += delta.argumentsDelta;
  if (state.name !== "update_block" && state.name !== "append_text" && state.name !== "insert_block") return;
  const content = readJsonStringField(state.argumentsText, "content");
  if (!content?.value) return;

  if (!state.blockId) {
    if (state.name === "insert_block") {
      if (state.argumentsText.includes("\"afterId\"") && !readJsonStringField(state.argumentsText, "afterId")?.closed) return;
      const afterId = readJsonStringField(state.argumentsText, "afterId")?.value || focusBlockId;
      const created = port.insertParagraph(content.value, afterId || undefined);
      state.blockId = created.id;
      state.written = content.value;
      return;
    }
    const idField = readJsonStringField(state.argumentsText, "blockId");
    if (!idField?.closed && !focusBlockId) return;
    const blockId = idField?.closed ? idField.value : focusBlockId;
    if (!blockId) return;
    const existing = port.getBlock(blockId);
    if (!existing) return;
    state.blockId = blockId;
    state.base = state.name === "append_text" ? existing.content : "";
  }

  if (content.value === state.written) return;
  state.written = content.value;
  port.updateContent(state.blockId, state.base + content.value);
}

/** Result returned to the model as a tool message. */
export interface ToolResult {
  readonly ok: boolean;
  readonly summary: string;
  readonly blockId?: string;
}

/**
 * Finishes a tool call. Streaming writes have already landed.
 *
 * @param state - Accumulator for this call.
 * @param port - Document to read or mutate.
 * @param focusBlockId - Fallback block from the user gesture.
 * @returns A short JSON-ready summary.
 */
export function finishTool(
  state: LiveToolState,
  port: AiDocumentPort,
  focusBlockId?: string,
): ToolResult {
  if (!state.done) {
    pushToolDelta(state, {}, port, focusBlockId);
    state.done = true;
  }
  if (state.name === "list_blocks") {
    const blocks = port.listBlocks().map((block) => ({
      id: block.id,
      type: block.type,
      content: block.content.slice(0, 80),
    }));
    return { ok: true, summary: JSON.stringify(blocks) };
  }
  if (state.name === "duplicate_block" || state.name === "delete_block") {
    const blockId = readJsonStringField(state.argumentsText, "blockId")?.value || focusBlockId;
    if (!blockId) return { ok: false, summary: "Missing blockId" };
    if (state.name === "duplicate_block") {
      const copy = port.duplicateBlock(blockId);
      return copy
        ? { ok: true, summary: `Duplicated ${blockId} as ${copy.id}`, blockId: copy.id }
        : { ok: false, summary: `Block ${blockId} was not found` };
    }
    return port.deleteBlock(blockId)
      ? { ok: true, summary: `Deleted ${blockId}`, blockId }
      : { ok: false, summary: `Block ${blockId} was not found` };
  }
  if (!state.blockId) return { ok: false, summary: "No block was edited" };
  return { ok: true, summary: state.written || state.blockId, blockId: state.blockId };
}

/** Mutable record stored by the in-memory port. */
interface MemoryBlock {
  id: string;
  type: string;
  content: string;
  children: MemoryBlock[];
}

/**
 * In-memory document used to test the harness without mounting an editor.
 *
 * `contentWrites` records every `updateContent` value so a test can see the
 * token-sized steps a sync peer would observe.
 */
export interface MemoryDocument extends AiDocumentPort {
  readonly contentWrites: readonly string[];
  seed(block: { id: string; type?: string; content?: string }): void;
}

/** @returns An empty document whose ids are `mem-1`, `mem-2`, and so on. */
export function createMemoryDocument(): MemoryDocument {
  const roots: MemoryBlock[] = [];
  const contentWrites: string[] = [];
  let nextId = 1;

  const find = (id: string): { block: MemoryBlock; list: MemoryBlock[] } | undefined => {
    let found: { block: MemoryBlock; list: MemoryBlock[] } | undefined;
    const search = (blocks: MemoryBlock[]): void => {
      for (const block of blocks) {
        if (block.id === id) {
          found = { block, list: blocks };
          return;
        }
        search(block.children);
        if (found) return;
      }
    };
    search(roots);
    return found;
  };

  const flatten = (blocks: readonly MemoryBlock[], into: AiBlockRecord[]): void => {
    for (const block of blocks) {
      into.push({ id: block.id, type: block.type, content: block.content });
      flatten(block.children, into);
    }
  };

  const clone = (block: MemoryBlock): MemoryBlock => ({
    id: `mem-${nextId++}`,
    type: block.type,
    content: block.content,
    children: block.children.map(clone),
  });

  return {
    contentWrites,
    seed(block) {
      roots.push({
        id: block.id,
        type: block.type ?? "paragraph",
        content: block.content ?? "",
        children: [],
      });
    },
    listBlocks() {
      const blocks: AiBlockRecord[] = [];
      flatten(roots, blocks);
      return blocks;
    },
    getBlock(id) {
      const found = find(id);
      return found ? { id: found.block.id, type: found.block.type, content: found.block.content } : undefined;
    },
    insertParagraph(content, afterId) {
      const block: MemoryBlock = { id: `mem-${nextId++}`, type: "paragraph", content, children: [] };
      if (!afterId) roots.push(block);
      else {
        const anchor = find(afterId);
        const list = anchor?.list ?? roots;
        const index = anchor ? list.indexOf(anchor.block) : -1;
        list.splice(index + 1, 0, block);
      }
      return { id: block.id };
    },
    updateContent(id, content) {
      const found = find(id);
      if (!found) return;
      found.block.content = content;
      contentWrites.push(content);
    },
    duplicateBlock(id) {
      const found = find(id);
      if (!found) return undefined;
      const copy = clone(found.block);
      const index = found.list.indexOf(found.block);
      found.list.splice(index + 1, 0, copy);
      return { id: copy.id };
    },
    deleteBlock(id) {
      const found = find(id);
      if (!found) return false;
      const index = found.list.indexOf(found.block);
      found.list.splice(index, 1);
      return true;
    },
  };
}
