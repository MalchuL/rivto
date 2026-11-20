import type { HeldKeys, KeyboardBindingSnapshot, KeyboardTransport } from "@chulane/rivto-root";
import type { BlockEditorEventsApi } from "../events/types";
import type { BlockKeyboardDefinition } from "./types";
import { BlockKeyboardEvent } from "./block-keyboard-event";

/** Keyboard actions run after pointer-drag cancellation and before ordinary selection. */
const BLOCK_KEYBOARD_INPUT_PRIORITY = 100;

/** Connects the independent runtime to Page's grouped native event registrations. */
export class BlockKeyboardTransport implements KeyboardTransport<
  BlockKeyboardEvent,
  BlockKeyboardDefinition,
  KeyboardBindingSnapshot
> {
  readonly defaultTarget = "root";
  readonly primaryModifier: HeldKeys["primaryModifier"];

  /**
   * Borrows input registration and a runtime-owned physical key tracker.
   *
   * @param events - Page input and attachment lifecycle subscriptions.
   * @param held - Physical state reset on attachment loss.
   */
  constructor(
    private readonly events: Pick<BlockEditorEventsApi, "register" | "observe" | "onDetach">,
    private readonly held: Pick<HeldKeys, "primaryModifier" | "update" | "reconcile" | "reset">,
  ) {
    this.primaryModifier = held.primaryModifier;
  }

  /**
   * Installs action dispatch and non-consuming physical-state tracking.
   *
   * Failed setup releases earlier registrations in reverse order. Disconnection
   * attempts every release and resets held state even if a release fails.
   *
   * @param dispatch - Runtime action receiver.
   * @returns Idempotent disposer releasing all transport registrations and held state.
   * @throws The setup failure, or AggregateError retaining setup and rollback failures.
   * The disposer throws AggregateError after attempting every failed cleanup.
   */
  connect(dispatch: (event: BlockKeyboardEvent) => boolean): () => void {
    const disposers: Array<() => void> = [];
    try {
      this.registerKeyboardInput(dispatch, disposers);
      this.observeHeldState(disposers);
    } catch (error) {
      const errors = [error, ...this.release(disposers)];
      if (errors.length > 1) {
        throw new AggregateError(errors, "Page keyboard setup rollback failed");
      }
      throw error;
    }
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      const errors = this.release(disposers);
      if (errors.length) {
        throw new AggregateError(errors, "Page keyboard cleanup failed");
      }
    };
  }

  /**
   * Leaves action eligibility to the action's live predicate.
   *
   * @param _definition - Action being tested.
   * @param _event - Input context.
   * @returns True; Page has no mode or panel filters.
   */
  matches(_definition: BlockKeyboardDefinition, _event: BlockKeyboardEvent): boolean {
    return true;
  }

  /**
   * Retains independent inventory values without host metadata.
   *
   * @param snapshot - Runtime inventory entry.
   * @returns The same immutable entry.
   */
  describe(snapshot: KeyboardBindingSnapshot): KeyboardBindingSnapshot {
    return snapshot;
  }

  /**
   * Reports possible overlap without speculative predicate evaluation.
   *
   * @param _left - First action inventory entry.
   * @param _right - Second action inventory entry.
   * @returns True; native phase, target and priority are checked by the runtime.
   */
  overlaps(_left: KeyboardBindingSnapshot, _right: KeyboardBindingSnapshot): boolean {
    return true;
  }

  /**
   * Registers keyboard tracking and action dispatch in the connection's cleanup list.
   *
   * @param dispatch - Runtime action receiver.
   * @param disposers - Registration disposers owned by this connection.
   * @returns Completed registrations have been appended in installation order.
   * @throws Propagates registration failures for the caller to roll back.
   */
  private registerKeyboardInput(
    dispatch: (event: BlockKeyboardEvent) => boolean,
    disposers: Array<() => void>,
  ): void {
    for (const phase of ["keydown", "keyup"] as const) {
      disposers.push(
        this.events.observe(
          `keyboard.track.${phase}`,
          { type: phase, target: "window", capture: true, priority: 1000 },
          (event) => this.held.update(event.input, phase),
        ),
      );
      for (const target of ["root", "window"] as const) {
        disposers.push(
          this.events.register(
            `keyboard.dispatch.${target}.${phase}`,
            { type: phase, target, priority: BLOCK_KEYBOARD_INPUT_PRIORITY },
            (event) => {
              if (target === "root" && !event.insideRoot) {
                return "continue";
              }
              if (dispatch(new BlockKeyboardEvent(event, phase, this.primaryModifier))) {
                event.preventDefault();
                return "handled";
              }
              return "continue";
            },
          ),
        );
      }
    }
  }

  /**
   * Reconciles held modifiers from pointer input and resets state when input is lost.
   *
   * These observers do not claim input; their registrations belong to this transport.
   *
   * @param disposers - Registration disposers owned by this connection.
   * @returns Pointer, blur, visibility and detach disposers are appended in registration order.
   * @throws Propagates event registration failures.
   */
  private observeHeldState(disposers: Array<() => void>): void {
    disposers.push(
      this.events.observe(
        "keyboard.pointer-move",
        { type: "pointermove", target: "window", capture: true, priority: 1000 },
        (event) => this.held.reconcile(event.input),
      ),
    );
    disposers.push(
      this.events.observe(
        "keyboard.pointer",
        { type: "pointerdown", target: "window", capture: true, priority: 1000 },
        (event) => this.held.reconcile(event.input),
      ),
    );
    disposers.push(
      this.events.observe("keyboard.blur", { type: "blur", target: "window", priority: 1000 }, () =>
        this.held.reset(),
      ),
    );
    disposers.push(
      this.events.observe(
        "keyboard.hidden",
        { type: "visibilitychange", target: "document", priority: 1000 },
        (event) => {
          if (event.input.hidden) {
            this.held.reset();
          }
        },
      ),
    );
    disposers.push(this.events.onDetach(() => this.held.reset()));
  }

  /**
   * Releases all completed registrations and resets physical key state.
   *
   * Ownership is drained before callbacks run so reentrant cleanup cannot
   * release the same registration twice.
   *
   * @param disposers - Mutable registrations retained by the connection.
   * @returns Cleanup failures in attempted order, including held-state reset.
   */
  private release(disposers: Array<() => void>): unknown[] {
    const errors: unknown[] = [];
    for (const dispose of disposers.splice(0).reverse()) {
      try {
        dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      this.held.reset();
    } catch (error) {
      errors.push(error);
    }
    return errors;
  }
}
