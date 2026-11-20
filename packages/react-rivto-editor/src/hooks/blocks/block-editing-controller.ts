import type { BlockEditableText } from "./types";

/** Owns composition policy and content updates for one editable block. */
export class BlockEditingController {
  private target?: BlockEditableText;
  private syncedIdentity?: object;
  private composing = false;

  /**
   * Retains the document operation without installing browser input.
   *
   * @param setContent - Commits complete plain text to the owning block.
   */
  constructor(private readonly setContent: (content: string) => void) {}

  /**
   * Borrows an editable for its current occurrence attachment.
   *
   * Cleanup releases only this binding and cancels its local composition state.
   *
   * @param target - Root-owned editable text capability.
   * @returns Idempotent cleanup that cannot detach a later target.
   */
  attach(target: BlockEditableText): () => void {
    this.target = target;
    this.composing = false;
    return () => {
      if (this.target === target) {
        this.target = undefined;
        this.composing = false;
      }
    };
  }

  /**
   * Reconciles external text before paint unless composition owns the editable.
   *
   * A newly mounted editable has no live selection to preserve. Avoid a
   * document selection read for every block mounted by a large tree move.
   *
   * @param content - Current document text to render.
   * @returns The attached host reflects the text when no composition is active.
   * @throws Propagates browser text and selection failures.
   */
  synchronize(content: string): void {
    const target = this.target;
    if (!target || this.composing) {
      return;
    }
    const identity = target.getIdentity();
    if (target.synchronize(content, this.syncedIdentity === identity)) {
      this.syncedIdentity = identity;
    }
  }

  /**
   * Checks whether input belongs to the currently attached editable.
   *
   * @param identity - Opaque identity captured during the input delivery.
   * @returns False for a different host or an ended occurrence attachment.
   * @throws Propagates Root ownership checks.
   */
  acceptsInput(identity: object): boolean {
    const target = this.target;
    return Boolean(
      target && target.getIdentity() === identity && target.isCurrent() && this.target === target,
    );
  }

  /**
   * Persists completed browser input outside an active composition.
   *
   * @param identity - Opaque identity of the editable receiving this input.
   * @returns The current host text is committed when it matches the attached target.
   * @throws Propagates browser text reads and document update failures.
   */
  onInput(identity: object): void {
    if (!this.composing && this.acceptsInput(identity)) {
      this.commit(identity);
    }
  }

  /**
   * Lets the matching editable's IME own its text until composition ends.
   *
   * @param identity - Opaque identity of the editable receiving composition.
   * @returns Synchronization is deferred for the matching attached target.
   */
  onCompositionStart(identity: object): void {
    if (this.acceptsInput(identity)) {
      this.composing = true;
    }
  }

  /**
   * Commits the matching editable's final composition text once.
   *
   * @param identity - Opaque identity of the editable completing composition.
   * @returns Composition ends and current text is committed for the matching target.
   * @throws Propagates browser text reads and document update failures.
   */
  onCompositionEnd(identity: object): void {
    if (!this.acceptsInput(identity)) {
      return;
    }
    this.composing = false;
    this.commit(identity);
  }

  /**
   * Commits complete text only from the currently attached editable.
   *
   * @param identity - Opaque identity supplied by the input adapter.
   * @returns Current text is committed when the matching host remains available.
   * @throws Propagates browser text reads and document update failures.
   */
  private commit(identity: object): void {
    const target = this.target;
    if (!target || target.getIdentity() !== identity) {
      return;
    }
    const text = target.readText();
    if (text !== undefined && this.target === target) {
      // ponytail: composition commits whole plain text; use beforeinput deltas if
      // concurrent character-level IME merging becomes a demonstrated need.
      this.setContent(text);
    }
  }
}
