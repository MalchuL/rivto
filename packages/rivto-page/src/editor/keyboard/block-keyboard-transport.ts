import type { HeldKeys, KeyboardBindingSnapshot, KeyboardTransport } from "@chulane/rivto-keyboard";
import type { BlockEditorEventsApi } from "../events/block-editor-events";
import type { BlockKeyboardDefinition } from "./block-keyboard";
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

  /**
   * Borrows input registration and a runtime-owned physical key tracker.
   *
   * @param events - Page input and attachment lifecycle subscriptions.
   * @param held - Physical state reset on attachment loss.
   */
  constructor(
    private readonly events: Pick<BlockEditorEventsApi, "register" | "observe" | "onDetach">,
    private readonly held: HeldKeys,
  ) {}

  /**
   * Installs action dispatch and non-consuming physical-state tracking.
   *
   * @param dispatch - Runtime action receiver.
   * @returns Disposer releasing all transport registrations and held state.
   */
  connect(dispatch: (event: BlockKeyboardEvent) => boolean): () => void {
    const disposers: Array<() => void> = [];
    for (const phase of ["keydown", "keyup"] as const) {
      disposers.push(
        this.events.observe(
          `keyboard.track.${phase}`,
          { type: phase, target: "window", capture: true, priority: 1000 },
          (event) => this.held.update(event.raw),
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
              if (dispatch(new BlockKeyboardEvent(event, phase))) {
                event.raw.preventDefault();
                return "handled";
              }
              return "continue";
            },
          ),
        );
      }
    }
    disposers.push(...this.observeHeldState());
    return () => {
      disposers.reverse().forEach((dispose) => dispose());
      this.held.reset();
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
   * Reconciles held modifiers from pointer input and resets state when input is lost.
   *
   * These observers do not claim input; their registrations belong to this transport.
   *
   * @returns Disposers in registration order for pointer, blur, visibility and detach observations.
   * @throws Propagates event registration failures.
   */
  private observeHeldState(): Array<() => void> {
    const disposers: Array<() => void> = [];
    disposers.push(
      this.events.observe(
        "keyboard.pointer-move",
        { type: "pointermove", target: "window", capture: true, priority: 1000 },
        (event) => this.held.reconcile(event.raw),
      ),
    );
    disposers.push(
      this.events.observe(
        "keyboard.pointer",
        { type: "pointerdown", target: "window", capture: true, priority: 1000 },
        (event) => this.held.reconcile(event.raw),
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
          if (event.root.ownerDocument.hidden) {
            this.held.reset();
          }
        },
      ),
    );
    disposers.push(this.events.onDetach(() => this.held.reset()));
    return disposers;
  }
}
