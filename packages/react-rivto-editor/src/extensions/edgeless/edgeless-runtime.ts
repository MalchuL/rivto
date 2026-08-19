/**
 * Local canvas selection store kept outside core page/text selection.
 *
 * Marquee and click gestures write here many times per second. `set`/`clear`
 * no-op when membership is unchanged so subscribers are not woken. Cards and
 * visuals subscribe with `useEdgelessSelected(id)`, whose boolean snapshot lets
 * React skip re-render unless that object's selected bit actually flips.
 */
import { useSyncExternalStore } from "react";
import { useEditorContext } from "../../editor-context";
import type { ReactEditor } from "../../types";

/** Stable first-class element ID stored in local edgeless selection. */
export type EdgelessSelectionRef = string;

/** Detached local state for canvas-only selection. */
export interface EdgelessSelectionSnapshot {
  readonly active: boolean;
  readonly items: readonly EdgelessSelectionRef[];
}

/**
 * Returns whether two ordered ID lists are identical.
 *
 * @param left - First sequence.
 * @param right - Second sequence.
 * @returns True when lengths and every index match.
 */
function sameSequence(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/** Small per-view store that keeps canvas selection out of core page selection. */
export class EdgelessSelectionRuntime {
  private value: EdgelessSelectionSnapshot = { active: false, items: [] };
  private selectedIds = new Set<string>();
  private readonly listeners = new Set<() => void>();

  /**
   * @returns Detached current canvas selection.
   */
  get(): EdgelessSelectionSnapshot {
    return { active: this.value.active, items: [...this.value.items] };
  }

  /**
   * @returns Stable immutable snapshot for React external-store subscriptions.
   */
  snapshot(): EdgelessSelectionSnapshot {
    return this.value;
  }

  /**
   * Reports whether one canvas object is in the active selection.
   *
   * @param id - First-class element ID.
   * @returns True only while selection is active and contains `id`.
   */
  isSelected(id: string): boolean {
    return this.value.active && this.selectedIds.has(id);
  }

  /**
   * Replaces and activates canvas selection.
   *
   * Unchanged membership (same ordered IDs while already active) does not
   * notify, so marquee moves that do not add or drop objects stay off React.
   *
   * @param items - Ordered unique canvas object references.
   * @returns No value.
   */
  set(items: readonly EdgelessSelectionRef[]): void {
    const seen = new Set<string>();
    const unique = items.filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
    if (this.value.active && sameSequence(this.value.items, unique)) return;
    this.selectedIds = seen;
    this.value = { active: true, items: unique };
    this.notify();
  }

  /**
   * Deactivates the canvas selection while retaining it for a later return.
   *
   * @returns No value.
   */
  deactivate(): void {
    if (!this.value.active) return;
    this.value = { ...this.value, active: false };
    this.notify();
  }

  /**
   * Clears and activates an empty canvas selection.
   *
   * @returns No value.
   */
  clear(): void {
    if (this.value.active && this.value.items.length === 0) return;
    this.selectedIds = new Set();
    this.value = { active: true, items: [] };
    this.notify();
  }

  /**
   * @param listener - Change callback.
   * @returns Subscription disposer.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Releases subscribers and retained selection.
   *
   * @returns No value.
   */
  destroy(): void {
    this.value = { active: false, items: [] };
    this.selectedIds = new Set();
    this.listeners.clear();
  }

  /**
   * Invokes every subscriber after a membership or `active` change.
   *
   * @returns No value.
   */
  private notify(): void {
    [...this.listeners].forEach((listener) => listener());
  }
}

const runtimes = new WeakMap<ReactEditor, EdgelessSelectionRuntime>();

/**
 * Installs the canvas selection runtime for one React editor.
 *
 * @param reactEditor - Owning React editor instance.
 * @returns Disposer that destroys this runtime when it is still installed.
 */
export function installEdgelessRuntime(reactEditor: ReactEditor): () => void {
  if (runtimes.has(reactEditor)) throw new Error("Edgeless selection runtime is already installed");
  const runtime = new EdgelessSelectionRuntime();
  runtimes.set(reactEditor, runtime);
  return () => {
    if (runtimes.get(reactEditor) !== runtime) return;
    runtimes.delete(reactEditor);
    runtime.destroy();
  };
}

/**
 * @param reactEditor - Owning React editor instance.
 * @returns Installed canvas runtime.
 * @throws When its foundation extension is absent.
 */
export function getEdgelessRuntime(reactEditor: ReactEditor): EdgelessSelectionRuntime {
  const runtime = runtimes.get(reactEditor);
  if (!runtime) throw new Error("Install edgelessSelectionExtension before edgeless interactions");
  return runtime;
}

/**
 * @param reactEditor - Owning React editor instance.
 * @returns Installed runtime, or undefined for editors without edgeless selection.
 */
export function findEdgelessRuntime(reactEditor: ReactEditor): EdgelessSelectionRuntime | undefined {
  return runtimes.get(reactEditor);
}

/**
 * Reactive full canvas selection for chrome that needs the ordered ID list.
 *
 * @returns Current active flag and ordered selected IDs.
 */
export function useEdgelessSelection(): EdgelessSelectionSnapshot {
  const { reactEditor } = useEditorContext();
  const runtime = getEdgelessRuntime(reactEditor);
  return useSyncExternalStore(
    (listener) => runtime.subscribe(listener),
    () => runtime.snapshot(),
    () => runtime.snapshot(),
  );
}

/**
 * Reactive selected bit for one canvas object.
 *
 * The snapshot is a boolean, so React skips re-render when this object's
 * membership did not change even though the store still notifies.
 *
 * @param id - First-class element ID to observe.
 * @returns True while canvas selection is active and contains `id`.
 */
export function useEdgelessSelected(id: string): boolean {
  const { reactEditor } = useEditorContext();
  const runtime = getEdgelessRuntime(reactEditor);
  return useSyncExternalStore(
    (listener) => runtime.subscribe(listener),
    () => runtime.isSelected(id),
    () => runtime.isSelected(id),
  );
}
