import {
  BlockDropReceiver,
  type BlockDropTargetsApi,
  type BlockDropAcceptance,
  type ResolvedBlockDropTarget,
} from "@chulane/rivto-page";
import type { EditorBlock } from "@chulane/rivto";
import type { CrossDocumentPageRootController } from "../../extensions/block-drag/types";
import type { CrossDocumentBlockPanel } from "../../extensions/block-drag/cross-document/panel";
import { crossDocumentPageRootControllers } from "../../extensions/block-drag/cross-document/target";

/** One registered Page receiving attachment, shared by writing-page and canvas sources. */
export class PageDragOccurrence implements CrossDocumentPageRootController {
  private readonly receiver: BlockDropReceiver<CrossDocumentPageRootController>;

  /**
   * Registers this exact mounted receiving occurrence and owns its foreign feedback.
   *
   * @param reactPanel - Borrowed model commands and receiving behavior policy.
   * @param root - Borrowed DOM root; registry identity distinguishes attachments even when it is reused.
   * @param targets - Local Page geometry; foreign lookup stays with the source owner.
   */
  constructor(
    readonly reactPanel: CrossDocumentBlockPanel,
    readonly root: HTMLElement,
    readonly targets: Pick<BlockDropTargetsApi, "resolve">,
  ) {
    this.receiver = new BlockDropReceiver(this, crossDocumentPageRootControllers);
  }

  /**
   * Subscribes a foreign source to release of this exact receiving attachment.
   *
   * @param listener - Cancellation callback; invoked immediately if already disposed.
   * @returns Disposer removing only this listener, without releasing the occurrence.
   */
  onDetach(listener: () => void): () => void {
    return this.receiver.onDetach(listener);
  }

  /**
   * Resolves a foreign source using the same canonical Page geometry as local dragging.
   *
   * Identical IDs are excluded only when documents are identical. The canonical
   * Page target is returned directly, without a second placement representation
   * or hierarchy inferred from display IDs.
   *
   * @param x - Viewport pointer X in CSS pixels.
   * @param y - Viewport pointer Y in CSS pixels.
   * @param sources - Live detached roots from the source occurrence.
   * @param sourceDocumentId - Source model identity, independent of DOM occurrence.
   * @param nativeHit - Optional current native hit from the source's resolution.
   * @returns Current receiving placement, or null when detached, unavailable or forbidden.
   */
  resolvePlacement(
    x: number,
    y: number,
    sources: readonly EditorBlock[],
    sourceDocumentId: string,
    nativeHit?: Element,
  ): ReturnType<CrossDocumentPageRootController["resolvePlacement"]> {
    if (!this.receiver.active || !this.root.isConnected) {
      return null;
    }
    const excluded =
      sourceDocumentId === this.reactPanel.document.getDocument().id
        ? new Set(sources.map(({ id }) => id))
        : new Set<string>();
    const accepts: BlockDropAcceptance = (destination) =>
      this.reactPanel.editor.blockBehaviors.canMove({
        sources,
        destination: {
          parentId: destination.parentId,
          beforeId: destination.kind === "between" ? (destination.nextId ?? undefined) : undefined,
        },
      });
    const target = this.targets.resolve(x, y, excluded, nativeHit, accepts);
    if (!target) {
      return null;
    }
    return target;
  }

  /**
   * Removes only this registry identity, releases feedback and notifies every foreign source.
   *
   * @returns The attachment is disposed and all cleanup callbacks have been attempted.
   * @throws AggregateError after attempting every cleanup if any callback or DOM write fails.
   */
  destroy(): void {
    this.receiver.destroy();
  }
}
