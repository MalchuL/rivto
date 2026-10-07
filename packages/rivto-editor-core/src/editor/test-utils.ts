import { createRivtoEditor, type EditorRuntime } from "./rivto-editor";
import type { CreateRivtoEditorOptions, RivtoEditorApi } from "./types";
import type { EditorPosition } from "../managers/selection-manager";
import { createCaretSelection, createTextSelection, createStructuralSelection } from "../managers/selection-manager";
import type { Block } from "@chulane/document-model";
import { DocumentModelImpl } from "@chulane/document-model";
import { YjsDoc } from "@chulane/crdt-doc";

type CreateTestEditorOptions = Partial<CreateRivtoEditorOptions>;

/** Test-owned consumer and explicit command API over a shared runtime. */
export interface TestEditor extends RivtoEditorApi {
  readonly runtime: EditorRuntime;
}

/**
 * Core test editor with a local writing block registered.
 *
 * Production hosts / React extensions own writing types; core no longer
 * auto-installs `paragraph`.
 */
export async function createTestEditor(options: CreateTestEditorOptions = {}): Promise<TestEditor> {
  const document = options.document ?? new DocumentModelImpl(new YjsDoc(`rivto-test-${crypto.randomUUID()}`));
  const runtime = createRivtoEditor({ ...options, document });
  const destroy = runtime.destroy.bind(runtime);
  let destroyed = false;
  runtime.destroy = async () => {
    if (destroyed) return;
    destroyed = true;
    await destroy();
    if (!options.document) await document.destroy();
  };
  runtime.blockRegistry.defineBlock({ type: "paragraph", title: "Paragraph" });
  return Object.assign(runtime, { runtime });
}

/**
 * Flattens current document blocks with live UTF-16 lengths.
 * @param editor - Runtime providing the document forest.
 * @returns Ordered `{ id, length }` rows for {@link createTextSelection}.
 */
function orderedLengths(editor: Pick<RivtoEditorApi, "blocks">): { id: string; length: number }[] {
  const ordered: { id: string; length: number }[] = [];
  const visit = (blocks: Block[]): void => blocks.forEach((block) => {
    ordered.push({ id: block.id, length: block.content.length });
    visit(block.children);
  });
  visit(editor.blocks.getBlocks());
  return ordered;
}

/**
 * Builds a caret selection.
 * @param blockId - Caret block.
 * @param offset - UTF-16 caret offset.
 * @returns Canonical one-block empty coverage.
 */
export function testCaret(blockId: string, offset: number) {
  return createCaretSelection(blockId, offset);
}

/**
 * Builds per-block coverage from two directed endpoints against live lengths.
 * @param editor - Runtime providing document order.
 * @param anchor - Gesture start.
 * @param head - Gesture head.
 * @returns Canonical block selection.
 */
export function testRange(editor: Pick<RivtoEditorApi, "blocks">, anchor: EditorPosition, head: EditorPosition) {
  const item = createTextSelection(orderedLengths(editor), anchor, head);
  if (!item) throw new Error("testRange: endpoint block not found");
  return item;
}

export { createStructuralSelection };
