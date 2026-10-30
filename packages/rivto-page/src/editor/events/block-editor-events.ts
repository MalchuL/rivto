import { Listeners } from "@chulane/rivto-utils";
import { BlockFocusObserver } from "./block-focus-observer";
import { BlockInputDispatcher } from "./block-input-dispatcher";
import type {
  BlockInputDefinition,
  BlockInputEventMap,
  BlockInputHandler,
  BlockInputObserver,
} from "./block-input-event";
import type { BlockEditorResourceOwner } from "../extensions/block-editor-resource-owner";

/** Whole-editor focus transitions; movement between descendants emits neither event. */
export type BlockEditorEventType = "focus" | "blur";

/** Observable whole-editor focus transitions, independent of document updates. */
export interface BlockEditorEventsApi {
  /**
   * Observes attachment loss to cancel active gestures and scheduled work.
   *
   * @param listener - Callback invoked before native input listeners detach.
   * @returns Idempotent disposer captured by the extension setup scope.
   */
  onDetach(listener: () => void): () => void;

  /**
   * Registers native input behavior independently of focus observers.
   *
   * Priority orders handlers sharing native options; browser propagation orders
   * different realms and capture phases. Returning "handled" claims input without
   * calling preventDefault or stopPropagation. Registrations survive remounts.
   *
   * @param id - Unique registration identity within this editor.
   * @param definition - Event type, native options, scope, and finite priority.
   * @param handler - Typed callback; call raw.preventDefault explicitly when needed.
   * @returns Idempotent disposer captured by the current extension setup scope.
   * @throws If the editor is destroyed, ID duplicates, or priority is not finite.
   */
  register<K extends keyof BlockInputEventMap>(
    id: string,
    definition: BlockInputDefinition<K>,
    handler: BlockInputHandler<K>,
  ): () => void;

  /**
   * Observes native input before handlers in the same phase and target.
   *
   * Observers still run after another queue claims the event. Return values never
   * claim input; native default prevention and propagation remain explicit actions.
   *
   * @param id - Unique identity shared with input handler registrations.
   * @param definition - Event type, target, phase, scope and finite priority.
   * @param observer - Callback receiving the shared occurrence context.
   * @returns Idempotent disposer captured by the extension setup scope.
   * @throws If registration identity or priority is invalid, or the owner is destroyed.
   */
  observe<K extends keyof BlockInputEventMap>(
    id: string,
    definition: BlockInputDefinition<K>,
    observer: BlockInputObserver<K>,
  ): () => void;

  /**
   * Observes focus entering or leaving the attached editor's owned DOM subtree.
   *
   * Internal focus moves emit neither transition; nested editor roots form separate
   * focus boundaries. View detachment stops DOM
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
  private readonly detachListeners = new Listeners<{ detach: void }>();
  private readonly input: BlockInputDispatcher;
  private readonly focus: BlockFocusObserver;
  private attachment: object | undefined;

  /**
   * Binds event subscriptions to the editor and synchronous extension scopes.
   *
   * @param owner - Resource owner releasing subscriptions when their extension ends.
   */
  constructor(private readonly owner: BlockEditorResourceOwner) {
    this.input = new BlockInputDispatcher(owner);
    this.focus = new BlockFocusObserver(owner);
  }

  /**
   * Observes attachment loss to cancel active gestures and scheduled work.
   *
   * @param listener - Callback invoked before native input listeners detach.
   * @returns Idempotent disposer captured by the extension setup scope.
   */
  onDetach(listener: () => void): () => void {
    this.owner.assertActive();
    return this.owner.registerCleanup(this.detachListeners.subscribe("detach", listener));
  }

  /**
   * Registers native input behavior independently of focus observers.
   *
   * Priority orders handlers sharing native options; browser propagation orders
   * different realms and capture phases. Returning "handled" claims input without
   * calling preventDefault or stopPropagation. Registrations survive remounts.
   *
   * @param id - Unique registration identity within this editor.
   * @param definition - Event type, native options, scope, and finite priority.
   * @param handler - Typed callback; call raw.preventDefault explicitly when needed.
   * @returns Idempotent disposer captured by the current extension setup scope.
   * @throws If the editor is destroyed, ID duplicates, or priority is not finite.
   */
  register<K extends keyof BlockInputEventMap>(
    id: string,
    definition: BlockInputDefinition<K>,
    handler: BlockInputHandler<K>,
  ): () => void {
    return this.input.register(id, definition, handler);
  }

  /**
   * Observes native input before handlers in the same phase and target.
   *
   * Observers still run after another queue claims the event. Return values never
   * claim input; native default prevention and propagation remain explicit actions.
   *
   * @param id - Unique identity shared with input handler registrations.
   * @param definition - Event type, target, phase, scope and finite priority.
   * @param observer - Callback receiving the shared occurrence context.
   * @returns Idempotent disposer captured by the extension setup scope.
   * @throws If registration identity or priority is invalid, or the owner is destroyed.
   */
  observe<K extends keyof BlockInputEventMap>(
    id: string,
    definition: BlockInputDefinition<K>,
    observer: BlockInputObserver<K>,
  ): () => void {
    return this.input.register(id, definition, observer, true);
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
    return this.focus.on(type, listener);
  }

  /**
   * Connects native focus transitions for one committed editor root.
   *
   * @param root - Attached root whose descendant focus movements are ignored.
   * @returns Disposer removing both DOM listeners without removing subscriptions.
   * @internal The controller owns this attachment and prevents concurrent roots.
   */
  attach(root: HTMLElement): () => void {
    if (this.attachment) {
      throw new Error("Editor events already attached");
    }
    const attachment = {};
    const detachInput = this.input.attach(root);
    let detachFocus: () => void;
    try {
      detachFocus = this.focus.attach(root);
    } catch (error) {
      try {
        detachInput();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Event attachment rollback failed");
      }
      throw error;
    }
    this.attachment = attachment;
    return () => {
      if (this.attachment !== attachment) {
        return;
      }
      this.attachment = undefined;
      const errors: unknown[] = [];
      for (const release of [
        ...this.detachListeners.snapshot("detach"),
        detachInput,
        detachFocus,
      ]) {
        try {
          release();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) {
        throw new AggregateError(errors, "Editor event cleanup failed");
      }
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
    this.focus.notifyInitialFocus(root);
  }
}
