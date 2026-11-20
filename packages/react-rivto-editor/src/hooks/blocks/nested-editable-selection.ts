import type { EditableTextSelectionPointer, InputRegion, InputRoot } from "@chulane/rivto-root";
import type { NestedSelectionPanel, NestedSelectionSession } from "./types";

/** Owns the lifetime of a nested editable selection borrowed from one Root. */
export class NestedEditableSelection {
  private current?: NestedSelectionSession;
  private revision = 0;

  /**
   * Borrows panel availability without owning the panel or its Root.
   *
   * @param panel - Current occurrence and its availability subscription.
   */
  constructor(private readonly panel: NestedSelectionPanel) {}

  /**
   * Starts a selection and releases it when its exact occurrence changes.
   *
   * A rejected hit leaves any earlier gesture untouched. A reentrant start or
   * Root replacement cancels the new gesture before it can be retained.
   *
   * @param root - Exact occurrence captured for this pointer delivery.
   * @param region - Editable region borrowed from that occurrence.
   * @param input - Copied pointer data and synchronous default cancellation.
   * @returns An accepted gesture is retained until completion or cleanup.
   * @throws Propagates gesture setup, subscription, and cleanup failures.
   */
  start(
    root: Pick<InputRoot, "isAttached">,
    region: Pick<InputRegion, "beginEditableTextSelection">,
    input: EditableTextSelectionPointer,
  ): void {
    const revision = ++this.revision;
    const session: NestedSelectionSession = { root, finished: false };
    const cancel = region.beginEditableTextSelection(input, () => this.finish(session));
    session.cancel = cancel;
    if (!cancel || session.finished) {
      return;
    }
    try {
      this.current?.cancel?.();
      if (this.revision !== revision || !this.isCurrent(session)) {
        cancel();
        return;
      }
      this.current = session;
      session.unsubscribe = this.panel.subscribeAvailability(() => {
        if (!this.isCurrent(session)) {
          cancel();
        }
      });
      if (session.finished) {
        session.unsubscribe();
        session.unsubscribe = undefined;
      } else if (!this.isCurrent(session)) {
        cancel();
      }
    } catch (error) {
      try {
        cancel();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Nested selection setup failed");
      }
      throw error;
    }
  }

  /**
   * Cancels the retained selection and releases its availability subscription.
   *
   * @returns No gesture remains owned by this instance.
   * @throws Propagates gesture cleanup failures.
   */
  destroy(): void {
    this.revision += 1;
    this.current?.cancel?.();
    this.current = undefined;
  }

  /**
   * Checks the exact occurrence before retaining or continuing a gesture.
   *
   * @param session - Gesture whose Root must remain current.
   * @returns Whether the originating Root still belongs to the panel.
   * @throws Propagates occurrence ownership failures.
   */
  private isCurrent(session: NestedSelectionSession): boolean {
    return (
      session.root.isAttached() &&
      this.panel.inputRoot === session.root &&
      session.root.isAttached()
    );
  }

  /**
   * Releases the panel subscription after Root ends a gesture.
   *
   * @param session - Gesture whose local resources are being withdrawn.
   * @returns Its availability subscription is released exactly once.
   * @throws Propagates subscription cleanup failures.
   */
  private finish(session: NestedSelectionSession): void {
    session.finished = true;
    if (this.current === session) {
      this.current = undefined;
    }
    const unsubscribe = session.unsubscribe;
    session.unsubscribe = undefined;
    unsubscribe?.();
  }
}
