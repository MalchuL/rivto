import type { BlockEditorResourceOwner } from "../extensions/block-editor-resource-owner";

/** Whole-editor focus transitions; movement between descendants emits neither event. */
export type BlockEditorEventType = "focus" | "blur";

/** Observable whole-editor focus transitions, independent of document updates. */
export interface BlockEditorEventsApi {
  /**
   * Observes focus entering or leaving the attached editor's entire DOM subtree.
   *
   * Internal focus moves emit neither transition. View detachment stops DOM
   * delivery; subscriptions remain installed until disposed or the editor ends.
   * Observers do not consume input or replace behavior/keyboard dispatch.
   *
   * @param type - Whole-editor focus transition to observe.
   * @param listener - Callback receiving the original native focusin/focusout event,
   * or a synthetic focusin when attachment finds focus already inside the root.
   * The synthetic event is delivered directly, has a null target, and is not dispatched to DOM.
   * @returns Idempotent disposer removing this individual subscription.
   * @throws If the editor is destroyed.
   */
  on(type: BlockEditorEventType, listener: (event: FocusEvent) => void): () => void;
}

/** Observes DOM focus transitions without subscribing to document or registry changes. */
export class BlockEditorEvents implements BlockEditorEventsApi {
  private readonly listeners = new Map<BlockEditorEventType, Set<(event: FocusEvent) => void>>();

  /**
   * Binds event subscriptions to the editor and synchronous extension scopes.
   *
   * @param owner - Resource owner releasing subscriptions when their extension ends.
   */
  constructor(private readonly owner: BlockEditorResourceOwner) {}

  /**
   * Observes focus entering or leaving the attached editor's entire DOM subtree.
   *
   * Notifications are synchronous and do not consume input or control propagation.
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
   * Connects native focus transitions for one committed editor root.
   *
   * @param root - Attached root whose descendant focus movements are ignored.
   * @returns Disposer removing both DOM listeners without removing subscriptions.
   * @internal The controller owns this attachment and prevents concurrent roots.
   */
  attach(root: HTMLElement): () => void {
    const focus = (event: FocusEvent) => this.notify("focus", root, event);
    const blur = (event: FocusEvent) => this.notify("blur", root, event);
    root.addEventListener("focusin", focus);
    root.addEventListener("focusout", blur);
    return () => {
      root.removeEventListener("focusin", focus);
      root.removeEventListener("focusout", blur);
    };
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
    if (view && active && root.contains(active)) {
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
    const NodeType = root.ownerDocument.defaultView?.Node;
    if (NodeType && event.relatedTarget instanceof NodeType && root.contains(event.relatedTarget)) {
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
}
