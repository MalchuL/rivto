import {
  BlockDropReceiver,
  type BlockDropTargetsApi,
  type BlockDropAcceptance,
  type BlockDragTargetScope,
  type BlockDragHit,
  type ResolvedBlockDropTarget,
} from "@chulane/rivto-page";
import type { EditorBlock } from "@chulane/rivto";
import type { InputRegion } from "@chulane/rivto-root";
import type { PageDragRoot } from "./types";
import type { PanelInputRegistration } from "../../panels/types";
import type { CrossDocumentBlockPanel } from "../../extensions/block-drag/cross-document/panel";
import { crossDocumentPageRootControllers } from "../../extensions/block-drag/cross-document/target";

/** One registered Page receiving attachment, shared by writing-page and canvas sources. */
export class PageDragOccurrence implements BlockDragTargetScope {
  readonly region: InputRegion;
  readonly #receiver: BlockDropReceiver<PageDragOccurrence>;
  readonly #targets: Pick<BlockDropTargetsApi, "resolve">;
  readonly #panel: CrossDocumentBlockPanel;
  readonly #root: Pick<PageDragRoot, "focus" | "isAttached">;
  readonly #inputRegistration: PanelInputRegistration;

  /**
   * Reads the host panel from a receiver already validated by the registry.
   *
   * @param occurrence - Current registered receiving occurrence.
   * @returns Its borrowed host panel, or undefined after the registration expires.
   * @throws Propagates occurrence and input registration checks.
   */
  static getPanel(occurrence: PageDragOccurrence): CrossDocumentBlockPanel | undefined {
    return occurrence.isCurrent() ? occurrence.#panel : undefined;
  }

  /**
   * Registers this exact mounted receiving occurrence and owns its detach notifications.
   *
   * The source gesture owns feedback for an accepted foreign target.
   *
   * @param reactPanel - Borrowed model commands and receiving behavior policy.
   * @param targets - Local Page geometry; foreign lookup stays with the source owner.
   * @param inputRoot - Current occurrence capability owning the receiving registration.
   * @param inputRegistration - Routing lifetime that owns the receiving occurrence.
   * @throws If the Root has no current surface identity or registration fails.
   */
  constructor(
    reactPanel: CrossDocumentBlockPanel,
    targets: Pick<BlockDropTargetsApi, "resolve">,
    inputRoot: PageDragRoot,
    inputRegistration: PanelInputRegistration,
  ) {
    const identity = inputRoot.getElementIdentity?.();
    if (!identity || !inputRegistration.isCurrent(inputRoot)) {
      throw new Error("Page drag requires an attached Root identity");
    }
    this.#panel = reactPanel;
    this.#targets = targets;
    this.#root = inputRoot;
    this.#inputRegistration = inputRegistration;
    this.#receiver = new BlockDropReceiver(inputRoot, this, crossDocumentPageRootControllers);
    try {
      const region = inputRoot.captureRegionByIdentity(identity, () => this.isCurrent());
      if (!region || !this.isCurrent()) {
        throw new Error("Page drag Root ended during registration");
      }
      this.region = region;
    } catch (error) {
      try {
        this.#receiver.destroy();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Page drag registration failed");
      }
      throw error;
    }
  }

  /**
   * Requests focus only while this exact receiving registration remains current.
   *
   * A replacement may reuse the same DOM root before this receiver is destroyed.
   *
   * @returns Focus is requested without scrolling when this receiver is current and connected.
   * @throws Propagates browser focus failures.
   */
  focus(): void {
    if (this.isCurrent()) {
      this.#root.focus();
    }
  }

  /**
   * Checks the receiving registry and the input routing lifetime together.
   *
   * @returns False after removal, replacement, disconnection, or input expiration.
   * @throws Propagates delegated attachment and registration checks.
   */
  isCurrent(): boolean {
    return (
      this.#receiver.active &&
      this.#inputRegistration.isCurrent(this.#root) &&
      crossDocumentPageRootControllers.getCurrent(this) === this &&
      this.#inputRegistration.isCurrent(this.#root) &&
      this.#receiver.active
    );
  }

  /**
   * Subscribes a foreign source to release of this exact receiving attachment.
   *
   * @param listener - Cancellation callback; invoked immediately if the registration is already stale.
   * @returns Disposer removing only this listener, without releasing the occurrence.
   * @throws Propagates registration checks and cancellation failures.
   */
  onDetach(listener: () => void): () => void {
    let notified = false;
    /**
     * Notifies the source at most once across stale checks and receiver destruction.
     *
     * @returns The source has been offered cancellation when not previously notified.
     * @throws Propagates the source's cancellation failure.
     */
    const notify = () => {
      if (!notified) {
        notified = true;
        listener();
      }
    };
    if (!this.isCurrent()) {
      notify();
      return () => {};
    }
    const release = this.#receiver.onDetach(notify);
    try {
      if (!this.isCurrent()) {
        release();
        notify();
      }
    } catch (error) {
      release();
      throw error;
    }
    return release;
  }

  /**
   * Resolves a foreign source using the same canonical Page geometry as local dragging.
   *
   * Identical IDs are excluded only when documents are identical. The canonical
   * Page target is returned directly, without a second placement representation
   * or hierarchy inferred from display IDs.
   *
   * @param occurrence - Registered receiving occurrence used to resolve geometry and policy.
   * @param x - Viewport pointer X in CSS pixels.
   * @param y - Viewport pointer Y in CSS pixels.
   * @param sources - Live detached roots from the source occurrence, including selected subtrees not mounted.
   * @param sourceDocumentId - Actual source model identity, independent of DOM occurrence.
   * @param hit - Optional current hit from the source; omitted when the receiver must hit-test afresh.
   * @returns Current receiving placement, or null when detached, unavailable or forbidden.
   */
  static resolvePlacement(
    occurrence: PageDragOccurrence,
    x: number,
    y: number,
    sources: readonly EditorBlock[],
    sourceDocumentId: string,
    hit?: BlockDragHit,
  ): ResolvedBlockDropTarget | null {
    if (!occurrence.isCurrent()) {
      return null;
    }
    const excluded =
      sourceDocumentId === occurrence.#panel.document.getDocument().id
        ? new Set(sources.map(({ id }) => id))
        : new Set<string>();
    const accepts: BlockDropAcceptance = (destination) =>
      occurrence.isCurrent() &&
      occurrence.#panel.editor.blockBehaviors.canMove({
        sources,
        destination: {
          parentId: destination.parentId,
          beforeId: destination.kind === "between" ? (destination.nextId ?? undefined) : undefined,
        },
      });
    const target = occurrence.#targets.resolve(x, y, excluded, hit, accepts);
    if (!target || !occurrence.isCurrent()) {
      return null;
    }
    return target;
  }

  /**
   * Removes only this registry identity and notifies every subscribed foreign source.
   *
   * Each source remains responsible for releasing its own gesture feedback.
   *
   * @returns The attachment is disposed and all cleanup callbacks have been attempted.
   * @throws AggregateError after attempting every cleanup if any callback or DOM write fails.
   */
  destroy(): void {
    this.#receiver.destroy();
  }
}
