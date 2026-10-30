import type { BlockEditorResourceOwner } from "../extensions/block-editor-resource-owner";
import type { BlockEditorEventType } from "./block-editor-events";
import { BlockInputListeners } from "./block-input-listeners";

/** Observes occurrence focus boundaries and reconciles focus acquired before attachment. */
export class BlockFocusObserver {
  private readonly listeners = new Map<BlockEditorEventType, Set<(event: FocusEvent) => void>>();
  private readonly native = new BlockInputListeners();

  /**
   * Retains focus subscriptions under the controller's resource lifetime.
   *
   * @param owner - Borrowed subscription guard and cleanup registration.
   */
  constructor(private readonly owner: BlockEditorResourceOwner) {
    this.native.register({ type: "focusin", target: "root", capture: false }, (event, root) => {
      this.notify("focus", root, event as FocusEvent);
    });
    this.native.register({ type: "focusout", target: "root", capture: false }, (event, root) => {
      this.notify("blur", root, event as FocusEvent);
    });
  }

  /**
   * Observes focus entering or leaving the attached editor's owned DOM subtree.
   *
   * Nested editor roots are separate focus boundaries. Notifications are synchronous
   * and do not consume input or control propagation.
   * Detachment stops DOM delivery while preserving subscriptions for the next mount.
   *
   * @param type - Whole-editor focus transition to observe.
   * @param listener - Callback receiving the original native focusin/focusout event,
   * or a synthetic focusin when attachment finds focus already inside the root.
   * The synthetic event is delivered directly, has a null target, and is not dispatched to DOM.
   * @returns Idempotent disposer removing only this callback registration.
   * @throws If the editor is destroyed.
   */
  on(type: BlockEditorEventType, listener: (event: FocusEvent) => void): () => void {
    this.owner.assertActive();
    let listeners = this.listeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(type, listeners);
    }
    const callback = (event: FocusEvent) => listener(event);
    listeners.add(callback);
    return this.owner.registerCleanup(() => {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.listeners.delete(type);
      }
    });
  }

  /**
   * Attaches both focus listeners with rollback if either installation fails.
   *
   * @param root - Occurrence root whose focus boundary is observed.
   * @returns Idempotent disposer retaining subscriptions for remount.
   * @throws If native installation or rollback fails.
   */
  attach(root: HTMLElement): () => void {
    return this.native.attach(root);
  }

  /**
   * Reports focus acquired before this attachment installed its native listeners.
   *
   * Called once after the controller publishes the attachment, so observers can
   * read its root. The original focus event is unavailable; the synthetic focusin
   * has a null target and is delivered only to editor observers, without DOM dispatch.
   *
   * @param root - Newly attached editor root to check against the document's active element.
   * @returns Focus observers have been notified if the root or a descendant is active.
   * @throws AggregateError when a focus observer fails.
   * @internal The controller invokes this after attachment and rolls back on failure.
   */
  notifyInitialFocus(root: HTMLElement): void {
    const view = root.ownerDocument.defaultView;
    const active = root.ownerDocument.activeElement;
    if (view && active && this.owns(root, active)) {
      this.notify("focus", root, new view.FocusEvent("focusin"));
    }
  }

  /**
   * Delivers transitions crossing the root boundary to a captured subscriber list.
   *
   * @param type - Editor event associated with this native focus transition or initial reconciliation.
   * @param root - Current DOM attachment.
   * @param event - Native event whose related target may still be inside the editor,
   * or the synthetic initial focusin delivered directly during attachment.
   * @returns Every captured listener has been attempted unless focus stayed within the subtree.
   * @throws AggregateError containing callback failures, reported through native event dispatch
   * for native transitions or propagated to the attachment caller for initial reconciliation.
   */
  private notify(type: BlockEditorEventType, root: HTMLElement, event: FocusEvent): void {
    if ((event.target && !this.owns(root, event.target)) || this.owns(root, event.relatedTarget)) {
      return;
    }
    const errors: unknown[] = [];
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      try {
        listener(event);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Block editor event notification failed");
    }
  }

  /**
   * Tests focus membership without crossing a nested editor boundary.
   *
   * @param root - Observed occurrence root.
   * @param target - Native focus target, related target or current active element.
   * @returns Whether the element belongs directly to this occurrence's subtree.
   */
  private owns(root: HTMLElement, target: EventTarget | null): boolean {
    const ElementType = root.ownerDocument.defaultView?.Element;
    if (!ElementType || !(target instanceof ElementType) || !root.contains(target)) {
      return false;
    }
    const boundary = target.closest("[data-rivto-block-editor]");
    return !boundary || boundary === root;
  }
}
