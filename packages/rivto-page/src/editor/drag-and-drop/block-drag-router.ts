import type { BlockDropTargetsApi } from "./types";
import type { DropSurfaceRegistry } from "./drop-surface-registry";
import type {
  BlockDragTargetScope,
  BlockDropAcceptance,
  ResolvedBlockDropTarget,
  BlockForeignDropResolver,
} from "./types";
import type { BlockDragHit } from "./types";
import type { InputDocument, InputRegion, InputRoot } from "@chulane/rivto-root";

/** Routes one source's captured hits across registered Page and other receiving surfaces. */
export class BlockDragRouter<T extends BlockDragTargetScope> {
  /**
   * Borrows an attached source, geometry resolver and host foreign-drop conversion.
   *
   * The attachment owner releases this router with its source; it owns no listeners.
   *
   * @param root - Exact source occurrence capability, never a document identity.
   * @param source - Borrowed region bound to the same root and exact source registration.
   * @param registry - Shared receiver lookup without registration or teardown access.
   * @param targets - Local canonical geometry resolution.
   * @param foreign - Host policy and optional legacy receiving-contract conversion.
   */
  constructor(
    private readonly root: Pick<InputRoot, "captureDocument">,
    private readonly source: InputRegion,
    private readonly registry: Pick<DropSurfaceRegistry<T>, "resolve">,
    private readonly targets: Pick<BlockDropTargetsApi, "resolve">,
    private readonly foreign: BlockForeignDropResolver<T>,
  ) {}

  /**
   * Resolves a local or foreign destination from one current captured hit.
   *
   * Disconnected or replaced source registrations cannot resolve. Foreign results carry the registered
   * receiver identity so commit can revalidate it and gestures can observe detach.
   *
   * @param x - Viewport X in CSS pixels.
   * @param y - Viewport Y in CSS pixels.
   * @param excluded - Captured source roots, including unmounted selected blocks.
   * @param hitHint - Optional connected hit in the source's browser document.
   * @param accepts - Optional local-source permission check; foreign receivers supply their own policy.
   * @returns Scoped target, or undefined outside an eligible destination.
   * @throws Propagates source ownership, browser geometry and host policy failures.
   */
  resolve(
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
    hitHint?: BlockDragHit,
    accepts?: BlockDropAcceptance,
  ): ResolvedBlockDropTarget | undefined {
    const document = this.root.captureDocument();
    if (!document || !this.isCurrent(document)) {
      return;
    }
    const hit = document.captureHit(x, y, hitHint);
    try {
      if (!this.isCurrent(document)) {
        return;
      }
      const receiver = this.registry.resolve(hit);
      if (!this.isCurrent(document)) {
        return;
      }
      if (receiver) {
        const local = receiver.region.isSame(this.source);
        if (!this.isCurrent(document)) {
          return;
        }
        if (!local) {
          const target = this.foreign.resolveForeign(receiver, x, y, excluded, hit);
          return target && this.isCurrent(document) ? { ...target, scope: receiver } : undefined;
        }
      }
      const target = this.targets.resolve(x, y, excluded, hit, accepts);
      return this.isCurrent(document) ? target : undefined;
    } finally {
      if (hit !== hitHint) {
        hit?.release();
      }
    }
  }

  /**
   * Checks the original source region and its current browser connectivity.
   *
   * @param document - Root capability for the document captured at the start of resolution.
   * @returns False after the source is disconnected, moved, replaced, or released.
   * @throws Propagates attachment ownership and browser lookup failures.
   */
  private isCurrent(document: InputDocument): boolean {
    if (!document.isCurrent()) {
      return false;
    }
    const current = this.source.isSame(this.source);
    // The ownership check can synchronously disconnect or move the source.
    return current && document.isCurrent();
  }
}
