import { Listeners } from "@chulane/rivto-utils";
import { createContext, useMemo, type ReactNode } from "react";
import type { BlockEditorBlocks } from "../../adapter/types";
import type { BlockChildPlacement } from "../components/block-layout/block-item-context";
import { useBlockEditorController } from "../hooks/use-block-editor-controller";

/** Occurrence-local canonical neighbors with stable identity for unchanged roots. */
class BlockRootPlacementStore {
  private placements = new Map<string, BlockChildPlacement>();
  /** Placement subscribers keyed by canonical root block ID. */
  private readonly listeners = new Listeners<Record<string, void>>();
  private release: (() => void) | undefined;

  /**
   * Captures one initial root snapshot without attaching model listeners during render.
   *
   * @param blocks - Borrowed root-order reads and addressed-list subscription.
   */
  constructor(
    private readonly blocks: Pick<BlockEditorBlocks, "getRootIds" | "subscribeBlockIds">,
  ) {
    this.refresh();
  }

  /**
   * Reads one stable canonical placement without rereading the complete root list.
   *
   * @param blockId - Canonical root identity.
   * @returns Placement, or undefined for nonroots and deleted blocks.
   */
  get(blockId: string): BlockChildPlacement | undefined {
    return this.placements.get(blockId);
  }

  /**
   * Shares one model listener among mounted roots and releases it after the last unmount.
   *
   * Only readers whose canonical neighbors changed are notified. Subscribers
   * compare their own addressed snapshots; unchanged neighbors retain
   * identity and do not rerender when unrelated roots move. Subscription refreshes
   * the snapshot to cover changes between render and commit, including StrictMode.
   *
   * @param blockId - Root whose canonical neighbors this reader observes.
   * @param listener - React snapshot invalidation callback for that mounted root.
   * @returns Disposer releasing that listener and the unused shared model subscription.
   */
  subscribe = (blockId: string, listener: () => void): (() => void) => {
    const unsubscribe = this.listeners.subscribe(blockId, listener);
    if (!this.release) {
      this.release = this.blocks.subscribeBlockIds(() => this.refresh());
      this.refresh();
    }
    return () => {
      unsubscribe();
      if (!this.listeners.size) {
        this.release?.();
        this.release = undefined;
      }
    };
  };

  /**
   * Publishes actual root neighbors while reusing every unchanged placement object.
   *
   * Projected children retain their own parent subscription; display order never
   * invents a canonical parent. No DOM or geometry state enters this snapshot.
   *
   * @returns Current root neighbors are indexed and mounted readers are notified.
   */
  private refresh(): void {
    const roots = this.blocks.getRootIds() ?? [];
    const placements = new Map<string, BlockChildPlacement>();
    roots.forEach((blockId, index) => {
      const previousId = roots[index - 1] ?? null;
      const nextId = roots[index + 1] ?? null;
      const old = this.placements.get(blockId);
      placements.set(
        blockId,
        old?.previousId === previousId && old.nextId === nextId
          ? old
          : { blockId, parentId: null, previousId, nextId },
      );
    });
    const previous = this.placements;
    this.placements = placements;
    for (const blockId of this.listeners.keys()) {
      if (previous.get(blockId) !== placements.get(blockId)) {
        this.listeners.emit(blockId);
      }
    }
  }
}

/** Actual root placement snapshots; provider identity stays stable across root moves. */
export const BlockRootPlacementContext = createContext<Pick<
  BlockRootPlacementStore,
  "get" | "subscribe"
> | null>(null);

/** Existing occurrence contents borrowing one shared canonical root subscription. */
interface BlockRootPlacementsProps {
  readonly children: ReactNode;
}

/**
 * Shares addressed canonical placements without propagating root-list changes through React context.
 *
 * Display IDs remain independent: a projected root still reads its real parent.
 * Mounted roots share one model subscription; the last unmount releases it. Stable
 * placement identity prevents unrelated roots from rendering during a sibling move.
 * Nested occurrences receive independent stores, without another DOM element.
 *
 * @param props - Existing view subtree, rendered without another DOM element.
 * @param props.children - Root items borrowing the shared canonical placements.
 * @returns An occurrence-local placement context with no persisted or geometric state.
 * @throws If outside BlockEditor or delegated model reads/subscriptions fail.
 */
export function BlockRootPlacements({ children }: BlockRootPlacementsProps) {
  const { blocks } = useBlockEditorController().adapter;
  const placements = useMemo(() => new BlockRootPlacementStore(blocks), [blocks]);
  return (
    <BlockRootPlacementContext.Provider value={placements}>
      {children}
    </BlockRootPlacementContext.Provider>
  );
}
