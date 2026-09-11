/**
 * Optional equal-width column layout around ordinary document blocks. Nested
 * blocks keep the shared BlockTree shell; this extension only arranges column
 * shells side by side. Removing a column relocates its children instead of
 * deleting them. Drag, clipboard, snapshots, and undo remain owned by core.
 * @module
 */
import { useCallback, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  createCaretSelection,
  getSelectedBlockIds,
  isStructuralSelection,
  type RivtoEditorApi,
  type EditorBlockInput,
} from "@chulane/rivto";
import { useBlock, useReactEditor } from "../../hooks";
import { BlockElementRefProvider, type BlockWrapperProps } from "../../blocks";
import {
  BUILTIN_KEYMAP,
  focusBlock,
  isEditableKeyboardEvent,
  KEYBOARD_BINDING_IDS,
  readKeyboardSelection,
  shouldDeleteSelection,
  type BlockSlotProps,
  type ReactEditorExtension,
} from "../../managers";
import type { ReactEditor } from "../../types";

export const COLUMNS_BLOCK_TYPE = "columns";
export const COLUMNS_COLUMN_BLOCK_TYPE = "columns-column";
export const COLUMNS_DEFAULT_COUNT = 2;
export const COLUMNS_MIN_COUNT = 1;
export const COLUMNS_MAX_COUNT = 6;

const COLUMNS_CLASS = "rivto-columns";
const COLUMN_CLASS = "rivto-columns-column";
const SETTINGS_CLASS = "rivto-columns-settings";
const PANEL_CLASS = "rivto-columns-settings-panel";
const COUNT_CLASS = "rivto-columns-count";
const DROP_CONTAINER_ATTRIBUTE = "data-block-drop-container";
const EMPTY_COLUMN_MIN_HEIGHT = "120px";

const COLUMNS_STYLES = `
[data-block-type="${COLUMNS_BLOCK_TYPE}"],
[data-block-type="${COLUMNS_COLUMN_BLOCK_TYPE}"] {
  min-width: 0;
  max-width: 100%;
  /* Match root writing blocks: no extra nest indent or handle gutter. */
  padding-left: 0;
  padding-right: 0;
}
[data-block-type="${COLUMNS_BLOCK_TYPE}"] > .page-block-row .${COLUMNS_CLASS} {
  display: none;
}
[data-block-type="${COLUMNS_BLOCK_TYPE}"] > .page-block-children {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  margin: 4px 0;
}
[data-block-type="${COLUMNS_BLOCK_TYPE}"] > .page-block-children > .page-block {
  flex: 1 1 0;
  min-width: 0;
  max-width: 100%;
  overflow: visible;
}
[data-block-type="${COLUMNS_BLOCK_TYPE}"] .page-block-row::before {
  /* Clip the page-wide hover slab so one lane cannot steal clicks from another. */
  inset: 0;
  width: auto;
}
[data-block-type="${COLUMNS_COLUMN_BLOCK_TYPE}"] > .page-block-children {
  margin: 0;
  padding: 0;
  min-height: ${EMPTY_COLUMN_MIN_HEIGHT};
}
[data-block-type="${COLUMNS_COLUMN_BLOCK_TYPE}"]:has(> .page-block-children) > .page-block-row {
  display: none;
}
[data-block-type="${COLUMNS_BLOCK_TYPE}"] > .page-block-row .rivto-slot[data-slot-position="right"] {
  left: auto;
  right: 0;
  transform: translateY(-50%);
}
.${COLUMN_CLASS} {
  min-height: ${EMPTY_COLUMN_MIN_HEIGHT};
}
.${SETTINGS_CLASS} { position: relative; display: inline-flex; }
.${SETTINGS_CLASS} > button {
  width: 30px;
  height: 30px;
  border: 1px solid #dcdfe4;
  border-radius: 6px;
  background: white;
  color: #44546f;
  cursor: pointer;
}
.${SETTINGS_CLASS} > button:focus-visible { outline: 2px solid var(--rivto-accent, #6c5ce7); outline-offset: 2px; }
.${PANEL_CLASS} {
  position: absolute;
  top: 36px;
  right: 0;
  z-index: 20;
  width: 220px;
  padding: 16px;
  background: white;
  border: 1px solid #dcdfe4;
  border-radius: 10px;
  box-shadow: 0 8px 24px #091e4226;
}
.${COUNT_CLASS} {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}
.${COUNT_CLASS} button {
  width: 28px;
  height: 28px;
  border: 1px solid #dcdfe4;
  border-radius: 6px;
  background: white;
  cursor: pointer;
}
.${COUNT_CLASS} output { font-variant-numeric: tabular-nums; min-width: 1.5ch; text-align: center; }
`;

/**
 * Rejects counts that would create an empty or overflowing column board.
 * @param value - Requested column count.
 * @returns The accepted integer in the supported range.
 */
function columnCount(value: number): number {
  if (!Number.isInteger(value) || value < COLUMNS_MIN_COUNT || value > COLUMNS_MAX_COUNT) {
    throw new Error(`Columns count must be an integer from ${COLUMNS_MIN_COUNT} to ${COLUMNS_MAX_COUNT}`);
  }
  return value;
}

/**
 * Creates one column shell, optionally seeded with a writing block.
 *
 * @param writingBlock - Nested default writing block; omitted for an empty lane.
 * @returns Portable column input.
 */
function createColumnInput(writingBlock?: EditorBlockInput): EditorBlockInput {
  return {
    type: COLUMNS_COLUMN_BLOCK_TYPE,
    content: "",
    children: writingBlock ? [structuredClone(writingBlock)] : [],
  };
}

/**
 * Creates a headerless column board with equally sized columns.
 *
 * @param count - Initial column count; defaults to two.
 * @param writingBlock - Seeded writing block cloned into every lane.
 * @returns Portable board subtree inserted through the ordinary block manager.
 */
export function createColumnsBlockInput(
  count = COLUMNS_DEFAULT_COUNT,
  writingBlock?: EditorBlockInput,
): EditorBlockInput {
  return {
    type: COLUMNS_BLOCK_TYPE,
    content: "",
    children: Array.from({ length: columnCount(count) }, () => createColumnInput(writingBlock)),
  };
}

/**
 * Moves nested blocks out of columns that are about to disappear.
 *
 * Remaining sibling columns receive the children, appended in source order.
 * When every column of a board is removed, children are placed after the board
 * so they stay in the document instead of being deleted with the shells.
 *
 * @param editor - Core editor owning the block tree.
 * @param columnIds - Column identifiers whose children must survive.
 * @returns Nothing; callers delete the empty shells afterwards.
 */
export function relocateColumnContents(editor: RivtoEditorApi, columnIds: readonly string[]): void {
  const unique = [...new Set(columnIds)].filter((id) => editor.blocks.getBlock(id)?.type === COLUMNS_COLUMN_BLOCK_TYPE);
  unique.forEach((id) => {
    const parentId = editor.blocks.getParentId(id);
    const parent = parentId ? editor.blocks.getBlock(parentId) : undefined;
    if (!parentId || parent?.type !== COLUMNS_BLOCK_TYPE) return;
    const keep = parent.children.filter((child) => child.type === COLUMNS_COLUMN_BLOCK_TYPE && !unique.includes(child.id));
    const childIds = editor.blocks.getBlock(id)?.children.map((child) => child.id) ?? [];
    if (!childIds.length) return;
    if (keep.length) editor.blocks.moveBlocks(childIds, keep.at(-1)!.id, "inside");
    else editor.blocks.moveBlocks(childIds, parentId, "after");
  });
}

/**
 * Changes how many column shells a board owns, relocating nested blocks first.
 * @param runtime - Active React editor runtime.
 * @param blockId - Columns board identifier.
 * @param count - Desired column count in the supported range.
 * @returns Whether the board existed and the count could be applied.
 */
export function setColumnsCount(runtime: ReactEditor, blockId: string, count: number): boolean {
  const board = runtime.editor.blocks.getBlock(blockId);
  if (board?.type !== COLUMNS_BLOCK_TYPE || !Number.isFinite(count)) return false;
  const next = Math.max(COLUMNS_MIN_COUNT, Math.min(COLUMNS_MAX_COUNT, Math.round(count)));
  const columns = board.children.filter((child) => child.type === COLUMNS_COLUMN_BLOCK_TYPE);
  if (next === columns.length) return true;
  runtime.editor.batchUpdates(() => {
    runtime.blocks.updateBlock(board.id, { listProps: { collapsed: false } });
    if (next > columns.length) {
      let afterId = columns.at(-1)?.id ?? board.id;
      for (let index = columns.length; index < next; index += 1) {
        const insertedId = runtime.blocks.insertBlock({
          type: COLUMNS_COLUMN_BLOCK_TYPE,
          content: "",
          children: [runtime.createDefaultBlock()],
        }, afterId);
        if (!columns.length && index === columns.length) {
          runtime.editor.blocks.moveBlocks([insertedId], board.id, "inside");
        }
        afterId = insertedId;
      }
      return;
    }
    const removed = columns.slice(next);
    relocateColumnContents(runtime.editor, removed.map((column) => column.id));
    runtime.editor.blocks.removeBlocks(removed.map((column) => column.id));
  });
  return true;
}

/**
 * Inserts a default writing block into an empty column and focuses it.
 * @param runtime - Active React editor runtime.
 * @param columnId - Empty column that should receive the new block.
 * @returns Nothing; the shared tree mounts the writing block.
 */
function insertWritingBlock(runtime: ReactEditor, columnId: string): void {
  let blockId = "";
  runtime.editor.batchUpdates(() => {
    runtime.blocks.updateBlock(columnId, { listProps: { collapsed: false } });
    blockId = runtime.blocks.insertBlock(runtime.createDefaultBlock(), columnId);
    runtime.editor.blocks.moveBlocks([blockId], columnId, "inside");
    runtime.selection.set(createCaretSelection(blockId, 0));
  });
  requestAnimationFrame(() => {
    const root = runtime.events.getRoot();
    if (root) focusBlock(root, blockId, 0);
  });
}

/**
 * Occupies the board content slot without a title or other header chrome.
 * @param _props - Identity of the persisted board; content is intentionally empty.
 * @returns Hidden marker so the shared tree can still mount a content slot.
 */
export function Columns(_props: { readonly blockId: string }) {
  return <div className={COLUMNS_CLASS} />;
}

/**
 * Marks an empty column as a click-to-start writing target.
 * @param props - Identity of the persisted column.
 * @returns Empty-lane control; drop and sort markers live on the column shell.
 */
function ColumnsColumn({ blockId }: { readonly blockId: string }) {
  const runtime = useReactEditor();
  const { block } = useBlock(blockId);
  const empty = (block?.children.length ?? 0) === 0;
  /**
   * Creates the first writing block when the column has no nested content.
   * @param event - Click or keyboard activation of the empty column.
   * @returns Nothing; insertion is a single undo step.
   */
  const startWriting = (event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => {
    if (!empty || event.defaultPrevented) return;
    if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    insertWritingBlock(runtime, blockId);
  };
  return (
    <div
      className={COLUMN_CLASS}
      tabIndex={empty ? 0 : -1}
      role={empty ? "button" : undefined}
      aria-label="Column"
      onClick={startWriting}
      onKeyDown={startWriting}
    />
  );
}

/**
 * Places the drop-container marker on the column BlockView so it survives row hide.
 *
 * The lane does not set a sort axis. Children keep the page outline drop
 * policy (gap line, indent, nest). The marker only makes an empty lane a
 * valid drop target.
 *
 * @param props - Current column snapshot and remaining decorator chain.
 * @returns Ref provider, or the unchanged subtree for other block types.
 */
function ColumnsColumnShell({ block, children }: BlockWrapperProps) {
  const attach = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    element.setAttribute(DROP_CONTAINER_ATTRIBUTE, "");
  }, []);
  if (block.type !== COLUMNS_COLUMN_BLOCK_TYPE) return children;
  return <BlockElementRefProvider elementRef={attach}>{children}</BlockElementRefProvider>;
}

/**
 * Provides the right-side control that changes how many columns the board owns.
 * @param props - Live board snapshot.
 * @returns Settings button and count panel.
 */
function ColumnsControls({ block }: BlockSlotProps) {
  const runtime = useReactEditor();
  const [open, setOpen] = useState(false);
  const count = block.children.filter((child) => child.type === COLUMNS_COLUMN_BLOCK_TYPE).length;
  return (
    <div className={SETTINGS_CLASS}>
      <button type="button" aria-label="Columns settings" aria-expanded={open} onClick={() => setOpen(!open)}>⚙</button>
      {open && (
        <div className={PANEL_CLASS} role="group" aria-label="Column count">
          <strong>Columns</strong>
          <div className={COUNT_CLASS}>
            <button type="button" aria-label="Remove column" disabled={count <= COLUMNS_MIN_COUNT}
              onClick={() => setColumnsCount(runtime, block.id, count - 1)}>-</button>
            <output aria-live="polite">{count}</output>
            <button type="button" aria-label="Add column" disabled={count >= COLUMNS_MAX_COUNT}
              onClick={() => setColumnsCount(runtime, block.id, count + 1)}>+</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Supplies extension-local CSS without changing the shared package stylesheet.
 * @returns One scoped style element owned by the extension lifecycle.
 */
function ColumnsStyles() {
  return <style>{COLUMNS_STYLES}</style>;
}

/**
 * Relocates nested blocks before a structural delete removes column shells.
 * @param reactEditor - Runtime whose selection deletion must preserve column contents.
 * @returns Nothing; the binding is owned by the extension lifecycle.
 */
function registerColumnDeletion(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  reactEditor.keyboard.register({
    id: "block.columns.relocate-on-delete",
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.selectionDelete],
    priority: 20,
    when: ({ selection, raw: event, blockId }) => {
      const root = reactEditor.events.getRoot();
      if (!root) return false;
      const editableEvent = isEditableKeyboardEvent(event);
      const current = editableEvent
        ? readKeyboardSelection(reactEditor.selection, editor, blockId)
        : selection;
      if (!shouldDeleteSelection(current) || !current || !isStructuralSelection(current)) return false;
      return getSelectedBlockIds(current).some((id) => editor.blocks.getBlock(id)?.type === COLUMNS_COLUMN_BLOCK_TYPE);
    },
  }, () => {
    const current = reactEditor.selection.get();
    if (!current) return false;
    const columnIds = getSelectedBlockIds(current).filter((id) => editor.blocks.getBlock(id)?.type === COLUMNS_COLUMN_BLOCK_TYPE);
    editor.batchUpdates(() => {
      relocateColumnContents(editor, columnIds);
      reactEditor.selection.delete();
    });
    return true;
  });
}

/**
 * Registers headerless columns presentation and a slash insertion action.
 * @returns Extension whose registrations are removed with the runtime.
 */
export function columnsExtension(): ReactEditorExtension {
  return {
    id: "block.columns",
    setup: (runtime) => {
      runtime.extensions.mount(ColumnsStyles);
      runtime.blocks.register({
        definition: { type: COLUMNS_BLOCK_TYPE, title: "Columns" },
        render: Columns,
      });
      runtime.blocks.register({
        definition: { type: COLUMNS_COLUMN_BLOCK_TYPE, title: "Column", allowedParents: [COLUMNS_BLOCK_TYPE] },
        render: ColumnsColumn,
      });
      runtime.surfaces.registerBlockSlot({
        position: "right",
        component: ColumnsControls,
        when: ({ block }) => block.type === COLUMNS_BLOCK_TYPE,
      });
      runtime.surfaces.registerBlockWrapper("block", ColumnsColumnShell);
      runtime.surfaces.registerBlockWrapper("edgeless", ColumnsColumnShell);
      runtime.slashCommands.register({
        id: "block.columns.insert",
        title: "Columns",
        group: "Insert",
        keywords: ["layout", "split", "grid"],
        execute: ({ blockId }) => {
          runtime.blocks.insertBlock(
            createColumnsBlockInput(COLUMNS_DEFAULT_COUNT, runtime.createDefaultBlock()),
            blockId,
          );
        },
      });
      registerColumnDeletion(runtime);
    },
  };
}
