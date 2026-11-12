import type { EditorBlockNode, PanelAPI } from "@chulane/rivto";
import type { BlockEditorNodePatch, BlockListType } from "@chulane/rivto-page";
import { BLOCK_BACKGROUND_COLORS } from "./background-colors";
import type { SharedSpace } from "../managers/extensions/shared-space";

/** Shared runtime value for translating block decorations at the Page boundary. */
export const PAGE_BLOCK_DECORATIONS_KEY = "rivto.page.block-decorations";

/** Structural decorations read from one persisted block. */
export interface PageBlockDecorations {
  /** Recognized list decoration, or undefined when there is none. */
  readonly listType?: BlockListType;
  /** Whether the host considers the block's checkbox checked. */
  readonly checked: boolean;
  /** Stored collapse presentation; structural visibility is resolved by block behaviors. */
  readonly collapsed: boolean;
  /** CSS color expression used for the block's background. */
  readonly color: string;
}

/** Property writes and removals produced by a Page decoration update. */
export interface PageBlockDecorationUpdate {
  /** List properties to merge into the existing block. */
  readonly listProps: Record<string, unknown>;
  /** Existing list-property keys to remove after validation. */
  readonly removals: readonly string[];
}

/** Translates between Page decorations and the host's persisted block properties. */
export interface PageBlockDecorationAdapter {
  /**
   * Reads the decorations displayed by Page.
   *
   * @param block - Current detached block node.
   * @returns List, checkbox, and background presentation for the node.
   */
  readonly read: (block: EditorBlockNode) => PageBlockDecorations;
  /**
   * Translates a Page update to host list-property writes and removals.
   *
   * The caller validates the resulting complete properties before batching writes.
   *
   * @param patch - Page's requested structural decoration changes.
   * @returns Properties to set and keys to remove.
   * @throws If a requested decoration is unsupported.
   */
  readonly prepare: (patch: BlockEditorNodePatch) => PageBlockDecorationUpdate;
}

/** Document-level validation borrowed by a block decoration update. */
export interface PageBlockDecorationDocument {
  /** Prepares complete list properties before any writes. */
  readonly blockListProps: Pick<PanelAPI["document"]["blockListProps"], "prepare">;
}

/** Shared-space lookup borrowed by a decoration update. */
export interface PageBlockDecorationExtensions {
  /** Looks up the adapter without owning its lifetime. */
  readonly shared: Pick<SharedSpace, "getValue">;
}

/** Editor capabilities borrowed by a decoration update. */
export interface PageBlockDecorationEditor {
  /** Supplies the editor's shared decoration adapter. */
  readonly extensions: PageBlockDecorationExtensions;
}

/** Panel operations borrowed while applying a decoration update. */
export interface PageBlockDecorationPanel {
  /** Editor-owned shared adapter lookup. */
  readonly editor: PageBlockDecorationEditor;
  /** Bounded block reads and list-property mutations. */
  readonly blocks: Pick<PanelAPI["blocks"], "getBlockNode" | "updateBlock" | "deleteListProps">;
  /** Document-level list-property validation. */
  readonly document: PageBlockDecorationDocument;
  /** Batches writes through the panel's document owner. */
  readonly batchUpdates: PanelAPI["batchUpdates"];
}

/**
 * Applies a shared decoration update through a panel's bounded document operations.
 *
 * The complete candidate is validated before writes and removals are batched,
 * preserving unrelated properties. Nested callers share their surrounding batch.
 *
 * @param panel - Panel supplying the current adapter and bounded operations.
 * @param blockId - Existing block within the panel's editable boundary.
 * @param patch - Structural decoration changes interpreted by the adapter.
 * @returns The validated update and its synchronous notifications have completed.
 * @throws If the block is inaccessible, the adapter is absent or rejects the patch, or validation fails.
 */
export function updatePageBlockDecorations(
  panel: PageBlockDecorationPanel,
  blockId: string,
  patch: BlockEditorNodePatch,
): void {
  const node = panel.blocks.getBlockNode(blockId);
  if (!node) {
    throw new Error(`Block ${blockId} is outside the Page panel`);
  }
  const adapter = panel.editor.extensions.shared
    .getValue<PageBlockDecorationAdapter>(PAGE_BLOCK_DECORATIONS_KEY)
    ?.get();
  if (!adapter) {
    throw new Error("Page block decoration adapter is unavailable");
  }
  const { listProps, removals } = adapter.prepare(patch);
  const candidate = { ...node.listProps, ...listProps };
  panel.document.blockListProps.prepare(candidate);
  for (const key of removals) {
    delete candidate[key];
  }
  panel.document.blockListProps.prepare(candidate);
  panel.batchUpdates(() => {
    if (Object.keys(listProps).length) {
      panel.blocks.updateBlock(blockId, { listProps });
    }
    if (removals.length) {
      panel.blocks.deleteListProps(blockId, removals);
    }
  });
}

/**
 * Narrows host list metadata to Page's supported structural list modes.
 *
 * @param value - Opaque persisted list annotation.
 * @returns Supported list mode, or undefined for no recognized list decoration.
 */
function readListType(value: unknown): BlockListType | undefined {
  switch (value) {
    case "list":
    case "checkbox":
    case "numbered_list":
    case "start_numbered_list":
    case "continue_numbered_list":
      return value;
    default:
      return undefined;
  }
}

/** Default translation of Page decorations to the built-in persisted properties. */
export const defaultPageBlockDecorationAdapter: PageBlockDecorationAdapter = {
  /**
   * Reads built-in list state and resolves palette tokens to host CSS variables.
   *
   * @param block - Current detached block node.
   * @returns Presentation with transparent background when no color is stored.
   */
  read(block) {
    const background = block.listProps.backgroundColor;
    return {
      listType: readListType(block.listProps.type),
      checked: block.listProps.checked === true,
      collapsed: block.listProps.collapsed === true,
      color:
        typeof background === "string" && background
          ? `var(--rivto-block-${background})`
          : "transparent",
    };
  },
  /**
   * Translates Page decoration changes to the built-in list-property format.
   *
   * @param patch - Requested Page decoration changes.
   * @returns Detached values to set and keys to remove.
   * @throws If the requested background is not a supported palette expression.
   */
  prepare(patch) {
    const listProps: Record<string, unknown> = {};
    const removals: string[] = [];
    if (patch.listType === null) {
      removals.push("type");
    } else if (patch.listType !== undefined) {
      listProps.type = patch.listType;
    }
    if (patch.checked !== undefined) {
      listProps.checked = patch.checked;
    }
    if (patch.collapsed !== undefined) {
      listProps.collapsed = patch.collapsed;
    }
    if (patch.color === null) {
      removals.push("backgroundColor");
    } else if (patch.color !== undefined) {
      const color = BLOCK_BACKGROUND_COLORS.find(
        (value) => value && `var(--rivto-block-${value})` === patch.color,
      );
      if (!color) {
        throw new Error("Unsupported Page background color");
      }
      listProps.backgroundColor = color;
    }
    return { listProps, removals };
  },
};
