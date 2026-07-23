import type { EditorMode, RivtoEditorApi } from "@chulane/rivto";
import { BLOCK_CONTENT_SELECTOR, BLOCK_ID_ATTRIBUTE, BLOCK_ID_SELECTOR } from "./constants";

/** Context shared by delegated editor event handlers. */
export interface EditorEventContext<Type extends keyof HTMLElementEventMap> {
  readonly editor: RivtoEditorApi;
  readonly root: HTMLElement;
  readonly event: HTMLElementEventMap[Type];
  readonly blockElement: HTMLElement | null;
  readonly blockId: string | undefined;
  readonly contentElement: HTMLElement | null;
}

/** Optional restriction applied before an event handler is called. */
export interface EditorEventOptions extends AddEventListenerOptions {
  readonly mode?: EditorMode | readonly EditorMode[];
}

type EventName = keyof HTMLElementEventMap;
type Registration = {
  type: EventName;
  listener: (context: EditorEventContext<EventName>) => void;
  options?: EditorEventOptions;
};

/** Typed delegated event registry attached to the active surface root. */
export class EditorEvents {
  private root: HTMLElement | null = null;
  private readonly registrations: Registration[] = [];
  private readonly nativeListeners = new Map<string, EventListener>();

  constructor(
    private readonly editor: RivtoEditorApi,
    private readonly getMode: () => EditorMode,
  ) {}

  /** Registers one handler and returns its idempotent disposer. */
  on<Type extends EventName>(
    type: Type,
    listener: (context: EditorEventContext<Type>) => void,
    options?: EditorEventOptions,
  ): () => void {
    const registration: Registration = {
      type,
      listener: listener as Registration["listener"],
      options,
    };
    this.registrations.push(registration);
    this.reconnect();
    return () => {
      const index = this.registrations.indexOf(registration);
      if (index >= 0) this.registrations.splice(index, 1);
      this.reconnect();
    };
  }

  /** Reattaches every delegated listener when the rendered surface changes. */
  setRoot(root: HTMLElement | null): void {
    if (root === this.root) return;
    this.disconnect();
    this.root = root;
    this.connect();
  }

  /** Removes all registrations and native root listeners. */
  destroy(): void {
    this.disconnect();
    this.root = null;
    this.registrations.length = 0;
  }

  private reconnect(): void {
    this.disconnect();
    this.connect();
  }

  private connect(): void {
    if (!this.root) return;
    const groups = new Map<string, Registration>();
    for (const registration of this.registrations) {
      const key = `${registration.type}:${Boolean(registration.options?.capture)}:${Boolean(registration.options?.passive)}`;
      if (!groups.has(key)) groups.set(key, registration);
    }
    for (const [key, registration] of groups) {
      const listener: EventListener = (nativeEvent) => this.dispatch(
        registration.type,
        nativeEvent as HTMLElementEventMap[EventName],
        Boolean(registration.options?.capture),
        Boolean(registration.options?.passive),
      );
      this.nativeListeners.set(key, listener);
      this.root.addEventListener(registration.type, listener, registration.options);
    }
  }

  private disconnect(): void {
    if (this.root) {
      for (const [key, listener] of this.nativeListeners) {
        const [type, capture] = key.split(":");
        this.root.removeEventListener(type, listener, capture === "true");
      }
    }
    this.nativeListeners.clear();
  }

  private dispatch(type: EventName, event: HTMLElementEventMap[EventName], capture: boolean, passive: boolean): void {
    if (!this.root) return;
    const target = typeof Element !== "undefined" && event.target instanceof Element ? event.target : null;
    const blockElement = target?.closest<HTMLElement>(BLOCK_ID_SELECTOR) ?? null;
    const contentElement = target?.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR) ?? null;
    const mode = this.getMode();
    for (const registration of [...this.registrations]) {
      if (event.defaultPrevented) break;
      if (registration.type !== type || Boolean(registration.options?.capture) !== capture || Boolean(registration.options?.passive) !== passive) continue;
      const modes = registration.options?.mode;
      if (modes && !(Array.isArray(modes) ? modes.includes(mode) : modes === mode)) continue;
      registration.listener({
        editor: this.editor,
        root: this.root,
        event,
        blockElement,
        blockId: blockElement?.getAttribute(BLOCK_ID_ATTRIBUTE) ?? undefined,
        contentElement,
      });
    }
  }
}
