import { useSyncExternalStore } from "react";
import { useEditorContext } from "../../editor-context";
import type { ReactEditor } from "../../types";

/** One object address stored in the local edgeless selection. */
export interface EdgelessSelectionRef {
  /** Owning object family; visual and group records remain plugin-defined. */
  readonly kind: "block" | "visual" | "group";
  /** Stable document or plugin record identity. */
  readonly id: string;
}

/** Detached local state for canvas-only selection. */
export interface EdgelessSelectionSnapshot {
  readonly active: boolean;
  readonly items: readonly EdgelessSelectionRef[];
}

/** Small per-view store that keeps canvas selection out of core page selection. */
export class EdgelessSelectionRuntime {
  private value: EdgelessSelectionSnapshot = { active: false, items: [] };
  private readonly listeners = new Set<() => void>();

  /** @returns Detached current canvas selection. */
  get(): EdgelessSelectionSnapshot {
    return { active: this.value.active, items: this.value.items.map((item) => ({ ...item })) };
  }

  /** @returns Stable immutable snapshot for React external-store subscriptions. */
  snapshot(): EdgelessSelectionSnapshot {
    return this.value;
  }

  /**
   * Replaces and activates canvas selection.
   *
   * @param items - Ordered unique canvas object references.
   * @returns No value.
   */
  set(items: readonly EdgelessSelectionRef[]): void {
    const seen = new Set<string>();
    const unique = items.filter((item) => {
      const key = `${item.kind}:${item.id}`;
      if (!item.id || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((item) => ({ ...item }));
    this.value = { active: true, items: unique };
    this.notify();
  }

  /** Deactivates the canvas selection while retaining it for a later return. */
  deactivate(): void {
    if (!this.value.active) return;
    this.value = { ...this.value, active: false };
    this.notify();
  }

  /** Clears and activates an empty canvas selection. */
  clear(): void {
    this.value = { active: true, items: [] };
    this.notify();
  }

  /** @param listener - Change callback. @returns Subscription disposer. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Releases subscribers and retained selection. */
  destroy(): void {
    this.value = { active: false, items: [] };
    this.listeners.clear();
  }

  private notify(): void {
    [...this.listeners].forEach((listener) => listener());
  }
}

const runtimes = new WeakMap<ReactEditor, EdgelessSelectionRuntime>();

/** Installs the canvas selection runtime for one React editor. */
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

/** @returns Installed canvas runtime. @throws When its foundation extension is absent. */
export function getEdgelessRuntime(reactEditor: ReactEditor): EdgelessSelectionRuntime {
  const runtime = runtimes.get(reactEditor);
  if (!runtime) throw new Error("Install edgelessSelectionExtension before edgeless interactions");
  return runtime;
}

/** @returns Installed runtime, or undefined for editors without edgeless selection. */
export function findEdgelessRuntime(reactEditor: ReactEditor): EdgelessSelectionRuntime | undefined {
  return runtimes.get(reactEditor);
}

/** @returns Reactive canvas-only selection for the current EditorView. */
export function useEdgelessSelection(): EdgelessSelectionSnapshot {
  const { reactEditor } = useEditorContext();
  const runtime = getEdgelessRuntime(reactEditor);
  return useSyncExternalStore(
    (listener) => runtime.subscribe(listener),
    () => runtime.snapshot(),
    () => runtime.snapshot(),
  );
}
