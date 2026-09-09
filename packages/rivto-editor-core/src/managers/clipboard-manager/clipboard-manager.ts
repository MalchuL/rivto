/**
 * Copies whole-block forests and pastes them transactionally. Single-block text
 * editing is an explicit clipboard case: ranges arrive as inputs and resulting
 * carets are returned to the host, never stored in the block selection manager.
 */
import type { EditorRuntime } from "../../editor/rivto-editor";
import type { EditorPosition, EditorSelection, TextRange } from "../../editor/types";
import type { BlockPastePlacement, ClipboardBundle, ClipboardPasteInput } from "./types";
import { remapClipboardBundle, cloneSelectedTopLevelSubtrees, validateClipboardBundle,
  type ClipboardIdReusePolicy } from "./utils";

/** Resolved first-child destination for structural paste. */
interface ResolvedBlockPastePlacement extends BlockPastePlacement {
  /** Existing child before which pasted roots are moved. */
  readonly beforeChildId?: string;
}

/** Framework-neutral clipboard operations over blocks and explicit text targets. */
export class ClipboardManager {
  /**
   * Creates the clipboard owner.
   * @param editor - Runtime providing document operations and history.
   */
  constructor(private readonly editor: EditorRuntime) {}

  /**
   * Copies selected subtrees without filling gaps or changing their identities.
   * @param selection - Optional block selection override.
   * @returns Detached portable data, or undefined without selected blocks.
   */
  copy(selection?: EditorSelection): ClipboardBundle | undefined {
    const range = this.editor.selection.normalize(selection);
    return range ? { version: 4, blocks: cloneSelectedTopLevelSubtrees(
      this.editor.blocks.getBlocks(), range,
    ) } : undefined;
  }

  /**
   * Copies selected characters of one block, excluding its children.
   * @param range - Explicit editing range within a single block.
   * @returns Partial-text bundle, or undefined for a caret.
   */
  copyText(range: TextRange): ClipboardBundle | undefined {
    const { block, start, end } = this.textTarget(range);
    return start === end ? undefined : {
      version: 4, startsWithText: true,
      blocks: [{ ...block, content: block.content.slice(start, end), children: [] }],
    };
  }

  /**
   * Copies and removes selected block subtrees as one undoable action.
   * @returns Copied forest, or undefined without selected blocks.
   */
  cut(): ClipboardBundle | undefined {
    const bundle = this.copy();
    if (bundle) this.editor.selection.delete();
    return bundle;
  }

  /**
   * Pastes structured blocks or plain text using an explicit editing target.
   * Whole-block bundles remain structural; partial-text bundles and plain text
   * replace the supplied text range. Plain-text paste can preserve newlines.
   * @param input - Clipboard flavors, placement and optional single-block range.
   * @returns Resulting text caret, or undefined for structural/no-op paste.
   */
  paste(input: ClipboardPasteInput = {}): EditorPosition | undefined {
    let bundle: ClipboardBundle | undefined;
    try {
      const candidate = input.bundle ?? (input.structured ? JSON.parse(input.structured) as unknown : undefined);
      if (candidate !== undefined) {
        validateClipboardBundle(candidate);
        bundle = candidate;
      }
    } catch {
      bundle = undefined;
    }
    // Validate text endpoints before opening a transaction: transactions do not roll back.
    const target = input.textTarget ? this.textTarget(input.textTarget) : undefined;
    let caret: EditorPosition | undefined;
    this.editor.batchUpdates(() => {
      if (bundle) {
        if (!bundle.blocks.length) return;
        if (target && bundle.startsWithText === true && input.mergeText !== false) {
          const first = bundle.blocks[0]!;
          const remapped = remapClipboardBundle(bundle, target.block.id, this.idReusePolicy());
          const prefix = target.block.content.slice(0, target.start);
          const suffix = target.block.content.slice(target.end);
          this.editor.document.blocks.setBlockText(target.block.id,
            prefix + first.content + (remapped.blocks.length ? "" : suffix));
          remapped.firstChildren.forEach((child) => {
            const id = this.editor.document.blocks.insertBlock(child, target.block.id);
            this.editor.document.blocks.moveBlock(id, target.block.id, "inside");
          });
          caret = { blockId: target.block.id, offset: prefix.length + first.content.length };
          remapped.blocks.forEach((block, index) => {
            const last = index === remapped.blocks.length - 1;
            const id = this.editor.document.blocks.insertBlock({ ...block,
              content: (block.content ?? "") + (last ? suffix : ""),
            }, caret!.blockId);
            caret = { blockId: id, offset: block.content?.length ?? 0 };
          });
        } else {
          const current = this.editor.selection.get();
          const range = this.editor.selection.normalize(current);
          // A selected parent owns placement even when focus ends on its child.
          const multiAfterId = range && range.blocks.length > 1
            ? cloneSelectedTopLevelSubtrees(this.editor.blocks.getBlocks(), range).at(-1)?.id
            : undefined;
          const afterId = multiAfterId ?? current.at(-1)?.focusBlockId ?? target?.block.id;
          const placement = input.placement && !multiAfterId ? input.placement : { afterId };
          this.insertBundleAsBlocks(bundle, {
            ...placement,
            beforeChildId: placement.parentId && placement.afterId === null
              ? this.editor.blocks.getChildIds(placement.parentId)[0] : undefined,
          });
        }
      } else if (input.text) {
        if (!input.defaultBlockType) throw new Error("clipboard.paste requires defaultBlockType for plain-text paste");
        const prepared = this.editor.blocksRegistry.prepare({ type: input.defaultBlockType });
        const lines = input.preserveNewlines ? [input.text] : input.text.split(/\r\n?|\n/);
        const suffix = target ? target.block.content.slice(target.end) : "";
        let previous = target?.block.id ?? this.copy()?.blocks.at(-1)?.id;
        lines.forEach((line, index) => {
          const last = index === lines.length - 1;
          let offset = line.length;
          if (target && index === 0) {
            const prefix = target.block.content.slice(0, target.start);
            this.editor.document.blocks.setBlockText(target.block.id, prefix + line + (last ? suffix : ""));
            offset += prefix.length;
          } else {
            previous = this.editor.document.blocks.insertBlock({ ...prepared,
              content: line + (last ? suffix : ""),
            }, previous);
          }
          caret = { blockId: previous!, offset };
        });
      }
      if (caret) this.editor.selection.clear();
    });
    return caret;
  }

  /**
   * Validates and orders one explicit text editing range.
   * @param range - Single-block UTF-16 endpoints.
   * @returns Detached block and ascending character offsets.
   * @throws When endpoints are missing, out of bounds, or span blocks.
   */
  private textTarget(range: TextRange) {
    const block = range?.anchor && this.editor.blocks.getBlock(range.anchor.blockId);
    if (!block || !range.head || range.anchor.blockId !== range.head.blockId ||
      ![range.anchor.offset, range.head.offset].every((offset) =>
        Number.isInteger(offset) && offset >= 0 && offset <= block.content.length)) {
      throw new Error("Text clipboard ranges must stay inside one existing block");
    }
    return { block, start: Math.min(range.anchor.offset, range.head.offset),
      end: Math.max(range.anchor.offset, range.head.offset) };
  }

  /**
   * Inserts a complete structured bundle without merging its first root.
   *
   * The resulting selection contains every pasted root; each root already
   * carries its complete nested subtree.
   *
   * @param bundle - Portable structured data to remap and insert.
   * @param placement - Optional sibling or first-child structural destination.
   */
  private insertBundleAsBlocks(
    bundle: ClipboardBundle,
    placement: ResolvedBlockPastePlacement = {},
  ): void {
    const remapped = remapClipboardBundle(bundle, undefined, this.idReusePolicy());
    const insertedIds: string[] = [];
    this.editor.document.transact(() => {
      let previous = placement.afterId;
      // Insert blocks after the afterId.
      remapped.blocks.forEach((block) => {
        previous = this.editor.document.blocks.insertBlock(block, previous ?? undefined);
        insertedIds.push(previous);
      });
      // Move blocks before the beforeChildId if it exists.
      if (placement.beforeChildId && insertedIds.length) {
        this.editor.blocks.moveBlocks(insertedIds, placement.beforeChildId, "before");
      } else if (placement.parentId && placement.afterId === null && insertedIds.length) {
        // Move blocks inside the parent (Appends to the parent)
        this.editor.blocks.moveBlocks(insertedIds, placement.parentId, "inside");
      }
    });
    // Set selection to the inserted blocks.
    if (insertedIds.length) {
      this.editor.selection.set([{
        type: "block",
        blockIds: insertedIds,
        anchorBlockId: insertedIds[0]!,
        focusBlockId: insertedIds.at(-1)!,
      }]);
    }
  }

  /**
   * Builds the destination ID-reuse policy for one paste.
   *
   * An original clipboard ID survives paste only while no live block
   * holds it. Cut releases the source IDs, so cut+paste restores the exact
   * same identities; copy+paste sees the originals still in use and remints.
   *
   * @returns Predicates resolving ID availability against the live document.
   */
  private idReusePolicy(): ClipboardIdReusePolicy {
    return {
      canReuseBlockId: (id) => !this.editor.document.blocks.hasBlock(id),
    };
  }

}
