import type { BlockRegistry } from "../blocks";
import type { EditorMode, RivtoEditorApi, RuntimeEvent, RuntimeEventHandler, RuntimeEventType } from "../editor/types";

interface RoutedHandler {
  /** Plugin owner used for lifecycle attribution and debugging. */
  id: string;
  /** Normalized event implementation. */
  handler: RuntimeEventHandler;
  /** Modes in which this handler participates. */
  modes?: EditorMode[];
  /** Higher values run before lower values within the plugin phase. */
  priority: number;
}

/**
 * Routes framework-neutral interaction events through runtime behavior.
 *
 * Dispatch has three strict phases: active plugin handlers, the current block
 * definition, then built-in fallbacks. A handler returns `true` to claim the
 * event and stop later phases. React can use that result to decide whether the
 * native browser default should be prevented.
 *
 * The router stores no DOM nodes and performs no mutations itself. Handlers use
 * the public editor API and its CommandRegistry, keeping event policy reusable
 * by renderers other than React.
 */
export class EventRouter {
  private readonly plugins = new Map<RuntimeEventType, RoutedHandler[]>();
  private readonly fallbacks = new Map<RuntimeEventType, RuntimeEventHandler[]>();
  private currentLastEvent: RuntimeEventType | null = null;
  private readonly listeners = new Set<() => void>();

  /**
   * Connects the router to lazy runtime state.
   *
   * The editor accessor is lazy because EditorRuntime constructs this manager
   * before its own initialization is complete.
   */
  constructor(
    private readonly getEditor: () => RivtoEditorApi,
    private readonly blocks: BlockRegistry,
    private readonly getMode: () => EditorMode,
  ) {}

  /** Returns the most recently dispatched event type, handled or not. */
  get lastEvent(): RuntimeEventType | null { return this.currentLastEvent; }

  /**
   * Registers one mode-aware plugin handler.
   *
   * Sorting is stable for equal priorities in modern JavaScript engines, so
   * equally ranked plugins retain installation order. The disposer removes the
   * exact entry and is safe to invoke repeatedly.
   *
   * @param id - Owning plugin ID.
   * @param type - Normalized event type.
   * @param handler - Handler that may claim the event by returning `true`.
   * @param modes - Optional modes in which the handler is active.
   * @param priority - Ordering within the plugin phase; larger runs first.
   * @returns Handler disposer.
   */
  registerPlugin(id: string, type: RuntimeEventType, handler: RuntimeEventHandler, modes?: EditorMode[], priority = 0): () => void {
    const entry = { id, handler, modes, priority };
    const handlers = this.plugins.get(type) ?? [];
    handlers.push(entry);
    handlers.sort((a, b) => b.priority - a.priority);
    this.plugins.set(type, handlers);
    return () => {
      const current = this.plugins.get(type);
      if (current) this.plugins.set(type, current.filter((candidate) => candidate !== entry));
    };
  }

  /**
   * Registers a built-in fallback after plugins and block behavior.
   *
   * @param type - Normalized event type.
   * @param handler - Default behavior implementation.
   * @returns Handler disposer.
   */
  registerFallback(type: RuntimeEventType, handler: RuntimeEventHandler): () => void {
    const handlers = this.fallbacks.get(type) ?? [];
    handlers.push(handler);
    this.fallbacks.set(type, handlers);
    return () => this.fallbacks.set(type, handlers.filter((candidate) => candidate !== handler));
  }

  /**
   * Dispatches an event in plugin, block, then fallback order.
   *
   * `lastEvent` is updated before behavior runs because the event did reach the
   * runtime even when nobody handles it. Block lookup traverses detached values
   * from DocumentModelImpl, avoiding any dependency on CRDT containers.
   *
   * @param event - Renderer-normalized interaction event.
   * @returns `true` when one handler claimed the event.
   */
  dispatch(event: RuntimeEvent): boolean {
    this.currentLastEvent = event.type;
    [...this.listeners].forEach((listener) => listener());
    const editor = this.getEditor();
    const mode = this.getMode();
    for (const entry of this.plugins.get(event.type) ?? []) {
      if ((!entry.modes || entry.modes.includes(mode)) && entry.handler(event, editor) === true) return true;
    }
    if (event.blockId) {
      // Stored blocks form a tree, while an event carries only a stable ID.
      // Flattening the detached snapshot here keeps EventRouter independent of
      // DocumentModel internals and guarantees nested blocks receive behavior.
      const block = editor.document.document.flatMap(function flatten(item): import("../../store/document-model").Block[] {
        return [item, ...item.children.flatMap(flatten)];
      }).find((item) => item.id === event.blockId);
      const handler = block && this.blocks.getBehavior(block.type)?.[event.type];
      if (handler?.(event, editor) === true) return true;
    }
    for (const handler of this.fallbacks.get(event.type) ?? []) if (handler(event, editor) === true) return true;
    return false;
  }

  /**
   * Subscribes to dispatched event metadata for diagnostics.
   *
   * @param listener - Callback invoked after `lastEvent` changes.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
