import type { RegionIdentity } from "@chulane/rivto-root";
import { BlockFocusObserver } from "./block-focus-observer";
import { BlockInputEventValue } from "./block-input-event";
import { BlockRegionInputSubscriptions } from "./block-region-input-subscriptions";
import { EventDispatcher, InputEvents, type EventResult } from "@chulane/rivto-root";
import type {
  BlockCustomEventDefinition,
  BlockInputDefinition,
  BlockInputEventMap,
  BlockInputHandler,
  BlockInputObserver,
  BlockInputPayloads,
  BlockFocusAttachment,
  BlockEditorEventsApi,
  BlockEditorEventType,
  BlockRegionInputObserver,
  BlockEditorEventsRoot,
} from "./types";
import type { BlockEditorResourceOwner } from "../extensions/block-editor-resource-owner";

/** Observes DOM focus transitions without subscribing to document or registry changes. */
export class BlockEditorEvents<
  CustomEvents extends object = object,
> implements BlockEditorEventsApi<CustomEvents> {
  private readonly detachListeners = new Set<() => void>();
  private readonly dispatcher = new EventDispatcher<BlockInputPayloads>();
  private readonly input: InputEvents<
    BlockInputEventValue<keyof BlockInputEventMap>,
    BlockEditorEventsRoot
  >;
  private readonly regions: BlockRegionInputSubscriptions;
  private readonly focus: BlockFocusObserver;
  private attachment: object | undefined;

  /**
   * Binds event subscriptions to the editor and synchronous extension scopes.
   *
   * @param owner - Resource owner releasing subscriptions when their extension ends.
   */
  constructor(private readonly owner: BlockEditorResourceOwner) {
    this.input = new InputEvents(
      owner,
      (target, input, root, attachment) =>
        new BlockInputEventValue(target, input, root, attachment),
      this.dispatcher,
    );
    this.regions = new BlockRegionInputSubscriptions(owner);
    this.focus = new BlockFocusObserver(owner);
  }

  /**
   * Retains one normalized region observer across Page attachment changes.
   *
   * @param identity - Opaque identity of the mounted region.
   * @param type - Browser input name to observe.
   * @param phase - Capture or bubble phase on the region.
   * @param observer - Receives normalized input and the owned region during synchronous delivery.
   * @returns Idempotent disposer releasing this registration.
   * @throws Propagates editor lifecycle, listener setup, and cleanup failures.
   */
  observeRegion<K extends keyof BlockInputEventMap>(
    identity: RegionIdentity,
    type: K,
    phase: "capture" | "bubble",
    observer: BlockRegionInputObserver<K>,
  ): () => void {
    return this.regions.observe(identity, type, phase, observer);
  }

  /**
   * Observes attachment loss to cancel active gestures and scheduled work.
   *
   * @param listener - Callback invoked before native input listeners detach.
   * @returns Idempotent disposer captured by the extension setup scope.
   * @throws If the editor is destroyed or cleanup ownership fails.
   */
  onDetach(listener: () => void): () => void {
    this.owner.assertActive();
    const alreadyRegistered = this.detachListeners.has(listener);
    this.detachListeners.add(listener);
    try {
      return this.owner.registerCleanup(() => {
        this.detachListeners.delete(listener);
      });
    } catch (error) {
      if (!alreadyRegistered) {
        this.detachListeners.delete(listener);
      }
      throw error;
    }
  }

  /**
   * Registers native input behavior independently of focus observers.
   *
   * Priority orders handlers sharing native options; browser propagation orders
   * different realms and capture phases. Returning "handled" claims input without
   * calling preventDefault or stopPropagation. Registrations survive remounts;
   * a delivery stops invoking callbacks when its exact attachment or Root is released.
   * A predicate that removes its own registration prevents that callback from running.
   *
   * @param id - Unique registration identity within this editor.
   * @param definition - Event type, native options, scope, and finite priority.
   * @param handler - Typed callback; call event.preventDefault explicitly when needed.
   * @returns Idempotent disposer captured by the current extension setup scope.
   * @throws If the editor is destroyed, ID duplicates, or priority is not finite.
   */
  register<K extends keyof BlockInputEventMap>(
    id: string,
    definition: BlockInputDefinition<K>,
    handler: BlockInputHandler<K>,
  ): () => void;
  /**
   * Registers a custom handler in the owning extension scope.
   *
   * @param id - Identity shared with browser input registrations.
   * @param definition - Custom event name and optional priority.
   * @param handler - Callback that may claim delivery.
   * @returns Idempotent disposer releasing this registration.
   * @throws If the owner is inactive, identity is invalid or priority is invalid.
   */
  register<K extends Extract<keyof CustomEvents, string>>(
    id: string,
    definition: BlockCustomEventDefinition<K>,
    handler: (event: CustomEvents[K]) => EventResult | void,
  ): () => void;
  /**
   * Routes a typed input or custom handler to its matching delivery group.
   *
   * @param id - Identity shared across both registration kinds.
   * @param definition - Browser input or explicitly marked custom event.
   * @param handler - Callback selected by the matching overload.
   * @returns Idempotent disposer captured by the extension owner.
   * @throws If registration validation, setup or cleanup ownership fails.
   */
  register(
    id: string,
    definition:
      | BlockInputDefinition<keyof BlockInputEventMap>
      | BlockCustomEventDefinition<Extract<keyof CustomEvents, string>>,
    handler: (event: never) => EventResult | void,
  ): () => void {
    if ("kind" in definition) {
      return this.addCustom(id, definition, handler, false);
    }
    return this.addInput(id, definition, handler as BlockInputHandler<keyof BlockInputEventMap>);
  }

  /**
   * Observes native input before handlers in the same phase and target.
   *
   * Observers still run after another queue claims the event. Return values never
   * claim input; native default prevention and propagation remain explicit actions.
   * A detached or replaced attachment stops later callbacks in the current delivery.
   * A predicate that removes its own observation prevents the observer from running.
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
   * Observes a custom event in the owning extension scope.
   *
   * @param id - Identity shared with browser input registrations.
   * @param definition - Custom event name and optional priority.
   * @param observer - Callback that cannot claim delivery.
   * @returns Idempotent disposer releasing this observation.
   * @throws If the owner is inactive, identity is invalid or priority is invalid.
   */
  observe<K extends Extract<keyof CustomEvents, string>>(
    id: string,
    definition: BlockCustomEventDefinition<K>,
    observer: (event: CustomEvents[K]) => void,
  ): () => void;
  /**
   * Routes a typed input or custom observer to its matching delivery group.
   *
   * @param id - Identity shared across both registration kinds.
   * @param definition - Browser input or explicitly marked custom event.
   * @param observer - Callback selected by the matching overload.
   * @returns Idempotent disposer captured by the extension owner.
   * @throws If registration validation, setup or cleanup ownership fails.
   */
  observe(
    id: string,
    definition:
      | BlockInputDefinition<keyof BlockInputEventMap>
      | BlockCustomEventDefinition<Extract<keyof CustomEvents, string>>,
    observer: (event: never) => void,
  ): () => void {
    if ("kind" in definition) {
      return this.addCustom(id, definition, observer, true);
    }
    return this.addInput(
      id,
      definition,
      observer as BlockInputObserver<keyof BlockInputEventMap>,
      true,
    );
  }

  /**
   * Publishes a typed custom event for this editor occurrence.
   *
   * Delivery is synchronous and independent of view attachment. Extensions borrow
   * the registration-only interface; the controller owner retains publishing.
   *
   * @param type - Custom event name declared for this editor.
   * @param payload - Value associated with the event name.
   * @returns Handled if a handler claims the event, otherwise continue.
   * @throws If the editor is destroyed or a callback throws.
   */
  publish<K extends Extract<keyof CustomEvents, string>>(
    type: K,
    payload: CustomEvents[K],
  ): EventResult {
    this.owner.assertActive();
    return this.dispatcher.dispatch(JSON.stringify(["custom", type]), payload);
  }

  /**
   * Observes focus entering or leaving the attached editor's owned DOM subtree.
   *
   * Nested editor roots are separate focus boundaries. Notifications are synchronous
   * and do not consume input or control propagation.
   * Detachment stops DOM delivery while preserving subscriptions for the next mount.
   *
   * @param type - Whole-editor focus transition to observe.
   * @param listener - Callback invoked for a boundary transition or when attachment
   * finds focus already inside the root. Initial notification is delivered directly,
   * without dispatching a DOM event.
   * @returns Idempotent disposer removing only this callback registration.
   * @throws If the editor is destroyed.
   */
  on(type: BlockEditorEventType, listener: () => void): () => void {
    return this.focus.on(type, listener);
  }

  /**
   * Connects native focus transitions for one committed editor root.
   *
   * @param inputRoot - Occurrence capability whose descendant focus movements are ignored.
   * @returns Disposer removing both DOM listeners without removing subscriptions.
   * @throws If already attached or listener installation fails; rollback failures are aggregated.
   * @internal The controller owns this attachment and prevents concurrent roots.
   */
  attach(inputRoot: BlockEditorEventsRoot): () => void {
    if (this.attachment) {
      throw new Error("Editor events already attached");
    }
    const attachment = {};
    const detachInput = this.input.attach(inputRoot);
    let detachFocus: (() => void) | undefined;
    let detachRegions: (() => void) | undefined;
    try {
      detachFocus = this.focus.attach(inputRoot);
      detachRegions = this.regions.attach(inputRoot);
    } catch (error) {
      const errors: unknown[] = [error];
      try {
        detachFocus?.();
      } catch (cleanupError) {
        errors.push(cleanupError);
      }
      try {
        detachInput();
      } catch (cleanupError) {
        errors.push(cleanupError);
      }
      if (errors.length > 1) {
        throw new AggregateError(errors, "Event attachment rollback failed");
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
      for (const release of [...this.detachListeners, detachRegions, detachInput, detachFocus]) {
        try {
          release?.();
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
   * read its root. The original focus event is unavailable; the notification is
   * delivered only to editor observers, without DOM dispatch.
   *
   * @param root - Exact newly attached Root whose focus boundary is checked.
   * @returns Focus observers have been notified if the root or a descendant is active.
   * @throws AggregateError when a focus observer fails, or an occurrence ownership or browser focus lookup failure.
   * @internal The controller invokes this after attachment and rolls back on failure.
   */
  notifyInitialFocus(root: BlockFocusAttachment["occurrence"]): void {
    this.focus.notifyInitialFocus(root);
  }

  /**
   * Registers Page scope and availability checks for a normalized input group.
   *
   * Root owns listener grouping and dispatch. Page checks its captured attachment
   * and scope again after a predicate that may remove the registration.
   *
   * @param id - Identity shared with custom event registrations.
   * @param definition - Input name, listener options, scope, and priority.
   * @param handler - Handler or observer selected by the public overload.
   * @param observer - Whether callback results are ignored for claims.
   * @returns Cleanup owned by the active extension scope.
   * @throws If registration, listener setup, or cleanup ownership fails.
   */
  private addInput<K extends keyof BlockInputEventMap>(
    id: string,
    definition: BlockInputDefinition<K>,
    handler: BlockInputHandler<K> | BlockInputObserver<K>,
    observer = false,
  ): () => void {
    const config = { ...definition };
    return this.input.register(
      id,
      config,
      (input, state) => {
        // The listener group is keyed by this exact input-map name.
        const event = input as BlockInputEventValue<K>;
        if (!event.matches(config.scope)) {
          return;
        }
        if (
          config.when &&
          (!config.when(event) || !state.active || !event.isCurrent(this.input.currentAttachment))
        ) {
          return;
        }
        return handler(event);
      },
      observer,
    );
  }

  /**
   * Captures a custom registration in the editor's current extension scope.
   *
   * @param id - Identity shared with browser input registrations.
   * @param definition - Custom event name and optional priority.
   * @param callback - Callback selected by the public registration overload.
   * @param observer - Whether the callback observes without claiming delivery.
   * @returns Idempotent disposer releasing this registration.
   * @throws If the owner is inactive, registration is invalid, or cleanup ownership fails.
   */
  private addCustom(
    id: string,
    definition: BlockCustomEventDefinition<Extract<keyof CustomEvents, string>>,
    callback: (event: never) => EventResult | void,
    observer: boolean,
  ): () => void {
    this.owner.assertActive();
    const entry = {
      id,
      type: JSON.stringify(["custom", definition.type]),
      priority: definition.priority,
    };
    // The public overload pairs this callback with the exact custom event name.
    const invoke = (payload: unknown) => callback(payload as never);
    const release = observer
      ? this.dispatcher.observe(entry, invoke)
      : this.dispatcher.register(entry, invoke);
    try {
      return this.owner.registerCleanup(release);
    } catch (error) {
      release();
      throw error;
    }
  }
}
