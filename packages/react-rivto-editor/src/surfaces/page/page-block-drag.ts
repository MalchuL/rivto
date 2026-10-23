import { createStructuralSelection, type EditorBlock } from "@chulane/rivto";
import {
  BlockDragRouter,
  type BlockDragAdapter,
  type BlockDragPreviewRow,
  type BlockDropDestination,
  type BlockDragTargetScope,
  type BlockOutlineDropTargets,
  type ResolvedBlockDropTarget,
} from "@chulane/rivto-page";
import type { CrossDocumentBlockPanel } from "../../extensions/block-drag/cross-document/panel";
import { CrossDocumentBlockTransfer } from "../../extensions/built-ins/clipboard/cross-document-block-transfer";
import { crossDocumentPageRootControllers } from "../../extensions/block-drag/cross-document/target";
import type { CrossDocumentPageRootController } from "../../extensions/block-drag/types";
import { PageDragOccurrence } from "./page-drag-occurrence";

/** One borrowed child-ID list in a bounded preview traversal; no descendants are copied. */
interface PagePreviewCursor {
  readonly ids: readonly string[];
  readonly depth: number;
  index: number;
}

/** Validated translation into the existing grouped command's anchor syntax. */
interface PageBlockMove {
  readonly targetId: string | null;
  readonly receiver: CrossDocumentBlockPanel;
  readonly position: "before" | "after" | "inside";
}

/** Validates live Page destinations against panel access and host movement rules. */
export class PageBlockDrag implements BlockDragAdapter {
  private occurrence: PageDragOccurrence | undefined;
  private router: BlockDragRouter<CrossDocumentPageRootController> | undefined;
  /**
   * Borrows the panel's model boundary without storing selection or attaching input.
   *
   * @param panel - Source occurrence and bounded grouped commands.
   * @param outerEdgeDropZone - Nested receiving edge zone in viewport pixels; defaults to eight.
   */
  constructor(
    private readonly panel: CrossDocumentBlockPanel,
    private readonly outerEdgeDropZone = 8,
  ) {}

  /**
   * Registers one receiving Page attachment shared by both surface implementations.
   *
   * @param root - Mounted occurrence root; registration identity survives only this attachment.
   * @param targets - Local canonical geometry, borrowed without another input installation.
   * @returns Disposer releasing this exact registry entry and foreign feedback.
   * @throws If already attached or registration cleanup fails.
   */
  attach(root: HTMLElement, targets: Pick<BlockOutlineDropTargets, "resolve">): () => void {
    if (this.occurrence) {
      throw new Error("Page drag is already attached");
    }
    const occurrence = new PageDragOccurrence(this.panel, root, targets);
    this.occurrence = occurrence;
    this.router = new BlockDragRouter(
      root,
      crossDocumentPageRootControllers,
      targets,
      this,
      this.outerEdgeDropZone,
    );
    return () => {
      if (this.occurrence === occurrence) {
        this.occurrence = undefined;
        this.router = undefined;
      }
      occurrence.destroy();
    };
  }

  /**
   * Routes one native hit through the shared Page and Edgeless receiving registry.
   *
   * @param x - Viewport pointer X in CSS pixels.
   * @param y - Viewport pointer Y in CSS pixels.
   * @param excluded - Captured roots in the source model, including unmounted selection.
   * @param nativeHit - Current uncaptured native hit; otherwise geometry is refreshed once.
   * @returns Local or scoped foreign target, or undefined outside a registered destination.
   */
  resolve(
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
    nativeHit?: Element,
  ): ResolvedBlockDropTarget | undefined {
    return this.router?.resolve(x, y, excluded, nativeHit);
  }

  /**
   * Converts a foreign host's accepted placement into canonical Page geometry.
   *
   * Source snapshots and document identity stay in the host. Both writing pages
   * and canvas receivers supply the same canonical Page geometry.
   *
   * @param receiver - Current registered receiving host.
   * @param x - Viewport X in CSS pixels.
   * @param y - Viewport Y in CSS pixels.
   * @param excluded - Captured source model roots.
   * @param hit - Current uncaptured native hit supplied by Page routing.
   * @param nestedBoundary - Whether the pointer crossed a nested receiving edge.
   * @returns Accepted geometry, or undefined when the receiving host rejects the drop.
   * @throws Propagates source reads, receiving policy, and DOM lookup failures.
   */
  resolveForeign(
    receiver: CrossDocumentPageRootController,
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
    hit: Element | undefined,
    nestedBoundary: boolean,
  ): ResolvedBlockDropTarget | undefined {
    const sources = [...excluded].flatMap((id) => {
      const block = this.panel.blocks.getBlock(id);
      return block ? [block] : [];
    });
    const placement = receiver.resolvePlacement(
      x,
      y,
      sources,
      this.panel.document.getDocument().id,
      hit,
      nestedBoundary,
    );
    return placement ?? undefined;
  }

  /**
   * Reads only a prefix of visible nodes for the gesture's detached text preview.
   *
   * Traversal retains child-ID lists rather than copying or flattening subtrees.
   * Missing nodes consume the read budget; collapsed or behavior-hidden children
   * are skipped. Content is truncated before returning and no omitted nodes are counted.
   *
   * @param ids - Captured roots in selection order, independent of DOM mounting.
   * @param limit - Positive integer node-read budget; invalid values return no rows.
   * @returns At most limit inert text rows with relative depth; no subscriptions are created.
   * @throws Delegated model and child-visibility failures propagate to gesture cancellation.
   */
  getPreview(ids: readonly string[], limit: number): readonly BlockDragPreviewRow[] {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      return [];
    }
    const rows: BlockDragPreviewRow[] = [];
    const stack: PagePreviewCursor[] = [{ ids, depth: 0, index: 0 }];
    let reads = 0;
    while (stack.length && reads < limit) {
      const cursor = stack[stack.length - 1]!;
      const id = cursor.ids[cursor.index++];
      if (id === undefined) {
        stack.pop();
        continue;
      }
      reads += 1;
      const node = this.panel.blocks.getBlockNode(id);
      if (!node) {
        continue;
      }
      rows.push({ text: (node.content || node.type).slice(0, 240), depth: cursor.depth });
      if (
        reads < limit &&
        node.childIds.length &&
        this.panel.editor.blockBehaviors.childrenVisible(node)
      ) {
        stack.push({ ids: node.childIds, depth: cursor.depth + 1, index: 0 });
      }
    }
    return rows;
  }

  /**
   * Checks current sources, destination adjacency, panel boundaries and semantic policy.
   *
   * @param ids - Captured roots, including roots outside the mounted viewport.
   * @param destination - Actual parent and insertion neighbors, never display-root IDs.
   * @param scope - Foreign receiving attachment; omitted for the source occurrence.
   * @returns Whether a current command destination exists and host policy permits it.
   */
  canMove(
    ids: readonly string[],
    destination: BlockDropDestination,
    scope?: BlockDragTargetScope,
  ): boolean {
    return this.resolveMove(ids, destination, scope) !== undefined;
  }

  /**
   * Revalidates the destination and commits the group through the panel command.
   *
   * Core canonicalizes source order, excludes selected descendants and validates
   * the complete group before writing. Selection is published only after success.
   *
   * @param ids - Captured source identities; sources must still belong to this panel.
   * @param destination - Current canonical destination to validate again.
   * @param scope - Foreign receiving attachment whose registration must remain current.
   * @returns False for a stale or forbidden destination; true after the move.
   * @throws Propagates model validation and transaction failures without publishing selection.
   */
  moveBlocks(
    ids: readonly string[],
    destination: BlockDropDestination,
    scope?: BlockDragTargetScope,
  ): boolean {
    const move = this.resolveMove(ids, destination, scope);
    if (!move) {
      return false;
    }
    const receiver = move.receiver;
    if (receiver === this.panel) {
      this.panel.blocks.moveBlocks(ids, move.targetId, move.position);
    } else if (receiver.document.getDocument() === this.panel.document.getDocument()) {
      this.panel.document.blocks.moveBlocks([...ids], move.targetId, move.position);
    } else {
      new CrossDocumentBlockTransfer(this.panel, receiver).move(ids, move);
    }
    if (receiver !== this.panel) {
      this.panel.selection.clear();
    }
    const selected = new Set(ids);
    const siblings =
      destination.parentId === null
        ? receiver.blocks.getRootIds()
        : receiver.document.blocks.getChildIds(destination.parentId);
    receiver.selection.set(createStructuralSelection(siblings.filter((id) => selected.has(id))));
    return true;
  }

  /**
   * Reads addressed sources and the receiving sibling list before choosing an anchor.
   *
   * Null parents denote real document roots. A bounded panel cannot escape its
   * hidden root. Selected roots are removed from neighbor checks, matching the
   * list that will remain after their removal. Destination reads do not scan the
   * document recursively. Foreign moves additionally check every captured source
   * subtree identity for collisions in the receiving document.
   *
   * @param ids - Sources to validate without mutation.
   * @param destination - Canonical Page destination.
   * @param scope - Receiving attachment identity, or undefined for local movement.
   * @returns Command translation, or undefined for invalid and anchorless no-op moves.
   */
  private resolveMove(
    ids: readonly string[],
    destination: BlockDropDestination,
    scope?: BlockDragTargetScope,
  ): PageBlockMove | undefined {
    const entry = scope && crossDocumentPageRootControllers.get(scope.root);
    if (scope && (entry !== scope || !scope.root.isConnected)) {
      return;
    }
    const receiver = entry?.reactPanel ?? this.panel;
    const sameDocument = receiver.document.getDocument() === this.panel.document.getDocument();
    const { blocks, rootBlockId } = receiver;
    if (!ids.length || ids.some((id) => !this.panel.blocks.canRemove(id))) {
      return;
    }
    const parent = destination.parentId;
    if (
      parent === null
        ? rootBlockId !== undefined
        : parent !== rootBlockId && !blocks.hasBlock(parent)
    ) {
      return;
    }
    const selected = new Set(sameDocument ? ids : []);
    for (
      let ancestor = parent;
      ancestor !== null;
      ancestor = receiver.document.blocks.getParentId(ancestor) ?? null
    ) {
      if (selected.has(ancestor)) {
        return;
      }
    }
    const siblings = (
      parent === null ? blocks.getRootIds() : receiver.document.blocks.getChildIds(parent)
    ).filter((id) => !selected.has(id));
    if (!this.isCurrentGap(destination, siblings)) {
      return;
    }
    const sources = ids.flatMap((id) => {
      const block = this.panel.blocks.getBlock(id);
      return block ? [block] : [];
    });
    const beforeId = destination.kind === "between" ? (destination.nextId ?? undefined) : undefined;
    if (
      sources.length !== ids.length ||
      (!sameDocument && this.hasIdentityConflict(sources, receiver)) ||
      !receiver.editor.blockBehaviors.canMove({
        sources,
        destination: { parentId: parent, beforeId },
      })
    ) {
      return;
    }
    if (beforeId) {
      return { targetId: beforeId, position: "before", receiver };
    }
    if (parent !== null) {
      return { targetId: parent, position: "inside", receiver };
    }
    const last = siblings.at(-1);
    if (last) {
      return { targetId: last, position: "after", receiver };
    }
    return sameDocument ? undefined : { targetId: null, position: "after", receiver };
  }

  /**
   * Rejects duplicate subtree identities before offering a foreign-document drop.
   *
   * @param sources - Current detached source roots already read for semantic permission.
   * @param receiver - Destination model queried by stable ID, independently of its viewport.
   * @returns Whether any source identity is already present in the destination document.
   */
  private hasIdentityConflict(
    sources: readonly EditorBlock[],
    receiver: CrossDocumentBlockPanel,
  ): boolean {
    const pending = [...sources];
    while (pending.length) {
      const block = pending.pop()!;
      if (receiver.document.blocks.hasBlock(block.id)) {
        return true;
      }
      for (const child of block.children) {
        pending.push(child);
      }
    }
    return false;
  }

  /**
   * Rejects stale neighbors rather than silently moving into a different gap.
   *
   * @param destination - Append or exact sibling-gap destination.
   * @param siblings - Current receiving siblings excluding moving roots.
   * @returns Whether the supplied neighbors remain adjacent in this list.
   */
  private isCurrentGap(destination: BlockDropDestination, siblings: readonly string[]): boolean {
    if (destination.kind === "inside") {
      return true;
    }
    const index =
      destination.previousId === null ? 0 : siblings.indexOf(destination.previousId) + 1;
    return (
      (destination.previousId === null || index > 0) &&
      (siblings[index] ?? null) === destination.nextId
    );
  }
}
