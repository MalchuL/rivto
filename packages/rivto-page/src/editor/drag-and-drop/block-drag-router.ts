import type { BlockDropTargetsApi } from "./types";
import type { DropSurfaceRegistry } from "./drop-surface-registry";
import type { BlockDragTargetScope, BlockDropAcceptance, ResolvedBlockDropTarget } from "./types";

/** Host conversion of a foreign receiver's geometry and semantic acceptance. */
export interface BlockForeignDropResolver<T extends BlockDragTargetScope> {
  /**
   * Resolves a foreign receiver without repeating native hit testing.
   *
   * @param receiver - Live receiving identity selected by the shared registry.
   * @param x - Viewport X in CSS pixels.
   * @param y - Viewport Y in CSS pixels.
   * @param excluded - Source root IDs; their document meaning remains with the host.
   * @param hit - Current native hit, if any.
   * @returns Accepted canonical geometry, or undefined when the host rejects this drop.
   */
  resolveForeign(
    receiver: T,
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
    hit: Element | undefined,
  ): ResolvedBlockDropTarget | undefined;
}

/** Routes one source's native hits across registered Page and other receiving surfaces. */
export class BlockDragRouter<T extends BlockDragTargetScope> {
  /**
   * Borrows an attached source, geometry resolver and host foreign-drop conversion.
   *
   * The attachment owner releases this router with its source; it owns no listeners.
   *
   * @param root - Exact source occurrence, never a document identity.
   * @param registry - Shared native routing capability without registration or teardown access.
   * @param targets - Local canonical geometry resolution.
   * @param foreign - Host policy and optional legacy receiving-contract conversion.
   */
  constructor(
    private readonly root: HTMLElement,
    private readonly registry: Pick<DropSurfaceRegistry<T>, "resolve">,
    private readonly targets: Pick<BlockDropTargetsApi, "resolve">,
    private readonly foreign: BlockForeignDropResolver<T>,
  ) {}

  /**
   * Resolves a local or foreign destination from one current native hit.
   *
   * Disconnected sources cannot resolve. Foreign results carry the registered
   * receiver identity so commit can revalidate it and gestures can observe detach.
   *
   * @param x - Viewport X in CSS pixels.
   * @param y - Viewport Y in CSS pixels.
   * @param excluded - Captured source roots, including unmounted selected blocks.
   * @param nativeHit - Optional connected hit in the source's browser document.
   * @param accepts - Optional local-source permission check; foreign receivers supply their own policy.
   * @returns Scoped target, or undefined outside an eligible destination.
   * @throws Propagates browser geometry and host policy failures.
   */
  resolve(
    x: number,
    y: number,
    excluded: ReadonlySet<string>,
    nativeHit?: Element,
    accepts?: BlockDropAcceptance,
  ): ResolvedBlockDropTarget | undefined {
    if (!this.root.isConnected) {
      return;
    }
    const document = this.root.ownerDocument;
    const hit =
      nativeHit?.isConnected && nativeHit.ownerDocument === document
        ? nativeHit
        : (document.elementFromPoint(x, y) ?? undefined);
    const receiver = this.registry.resolve(this.root, { x, y }, hit);
    if (!receiver || receiver.root === this.root) {
      return this.targets.resolve(x, y, excluded, hit, accepts);
    }
    const target = this.foreign.resolveForeign(receiver, x, y, excluded, hit);
    return target ? { ...target, scope: receiver } : undefined;
  }
}
