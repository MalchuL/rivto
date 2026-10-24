import type { BlockEditorBlocks, BlockEditorSelection } from "../../adapter/types";

/** Navigates displayed block roots independently of their surface-specific mounting. */
export abstract class BlockNavigation {
  private readonly rootIndices = new Map<string, number>();
  private sourceRoots: readonly string[] | undefined;
  private selectableIds: readonly string[] | undefined;
  private displayedRoots: readonly string[] = [];

  /**
   * Borrows hierarchy and displayed selection order without acquiring subscriptions.
   *
   * @param blocks - Root order and parent lookup within this occurrence.
   * @param selection - Model-backed displayed order and text metadata, including offscreen blocks.
   */
  constructor(
    private readonly blocks: Pick<BlockEditorBlocks, "getBlockIds" | "getParentId">,
    readonly selection: Pick<BlockEditorSelection, "getSelectableBlockIds" | "getTextLength">,
  ) {}

  /**
   * Mounts requested blocks through the concrete surface's owning view.
   *
   * @param blockIds - Model identities requiring synchronous DOM availability.
   * @returns Expanded endpoints have been offered to the surface for mounting.
   */
  abstract mountBlocks(blockIds: readonly string[]): void;

  /**
   * Mounts the neighboring display root using cached displayed order and current ancestry.
   *
   * Rebuilding the host selectable order may visit expanded descendants after a
   * document change. Once cached, neighbor resolution only walks the current
   * block ancestry and indexes the displayed roots.
   *
   * @param blockId - Current endpoint, including a nested block.
   * @param direction - Previous root for -1, next root for 1.
   * @returns Both roots are mounted when the requested neighbor exists.
   * @throws Propagates model reads and delegated mounting failures.
   */
  mountAdjacentBlocks(blockId: string, direction: -1 | 1): void {
    const blocks = this.blocks;
    const roots = this.getDisplayedRoots();
    let id: string | undefined = blockId;
    let index = this.rootIndices.get(id) ?? -1;
    while (index < 0 && id) {
      id = blocks.getParentId(id);
      if (id) {
        index = this.rootIndices.get(id) ?? -1;
      }
    }
    const neighbor = index < 0 ? undefined : roots[index + direction];
    if (id && neighbor) {
      this.mountBlocks([id, neighbor]);
    }
  }

  /**
   * Mounts the page edge entered from another displayed occurrence.
   *
   * @param direction - -1 enters the last root; 1 enters the first.
   * @returns The edge root is mounted and revealed; empty pages do nothing.
   * @throws Propagates model reads and delegated mounting failures.
   */
  mountFirstOrLastBlock(direction: -1 | 1): void {
    const roots = this.getDisplayedRoots();
    const id = direction < 0 ? roots.at(-1) : roots[0];
    if (id) {
      this.mountBlocks([id]);
    }
  }

  /**
   * Filters canonical roots by the active surface's model-backed displayed order.
   *
   * Stable source arrays reuse the previous result, avoiding repeated scans during navigation.
   *
   * @returns Displayed roots, retaining offscreen roots and excluding hidden separators.
   */
  private getDisplayedRoots(): readonly string[] {
    const roots = this.blocks.getBlockIds();
    const selectable = this.selection.getSelectableBlockIds();
    if (roots !== this.sourceRoots || selectable !== this.selectableIds) {
      const ids = new Set(selectable);
      this.displayedRoots = roots.filter((id) => ids.has(id));
      this.rootIndices.clear();
      this.displayedRoots.forEach((id, index) => this.rootIndices.set(id, index));
      this.sourceRoots = roots;
      this.selectableIds = selectable;
    }
    return this.displayedRoots;
  }
}
