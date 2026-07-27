import type { EditorMode } from "@chulane/rivto";
import type { ReactEditor } from "../../../react-editor";

/**
 * Owns ordered registration, mode matching, and native-event claiming.
 *
 * Concrete DOM and keyboard managers reuse these lifecycle primitives so
 * disposal and `defaultPrevented` behavior remain identical at every level.
 */
export abstract class EditorEventManager {
  /** True after the manager has released its registrations. */
  protected destroyed = false;

  /**
   * Creates an event manager owned by one complete React runtime.
   *
   * @param reactEditor - Runtime used by concrete event managers to resolve
   * live core state and sibling managers.
   */
  constructor(protected readonly reactEditor: ReactEditor) {}

  /**
   * Adds one ordered item and returns an idempotent disposer.
   *
   * @param items - Manager-owned ordered collection.
   * @param item - Exact registration to append.
   * @param notify - Callback used to reconnect or invalidate derived state.
   * @returns Idempotent function removing only `item`.
   */
  protected register<Item>(
    items: Item[],
    item: Item,
    notify: () => void,
  ): () => void {
    if (this.destroyed) throw new Error("Editor event runtime is destroyed");
    items.push(item);
    notify();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const index = items.indexOf(item);
      if (index >= 0) items.splice(index, 1);
      notify();
    };
  }

  /** Returns whether a mode-restricted registration is active. */
  protected modeMatches(
    expected: EditorMode | readonly EditorMode[] | undefined,
    actual: EditorMode,
  ): boolean {
    return !expected || (Array.isArray(expected) ? expected.includes(actual) : expected === actual);
  }

  /** Claims a handled native event while preserving unhandled browser behavior. */
  protected claim(event: globalThis.Event, handled: boolean | void): boolean {
    if (!handled) return event.defaultPrevented;
    if (event.cancelable) event.preventDefault();
    return true;
  }

  /** Prevents future registrations after concrete managers release resources. */
  destroy(): void {
    this.destroyed = true;
  }
}
