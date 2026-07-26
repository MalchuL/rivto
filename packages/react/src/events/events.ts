import type {
  EditorMode,
  EditorSelection,
  RivtoEditorApi,
} from "@chulane/rivto";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "../constants";

/** Native listener owner supported by this editor event runtime. */
export type DOMEditorEventTarget = "root" | "document" | "window";

export type DOMEditorEventMap<Target extends DOMEditorEventTarget> =
  Target extends "document" ? DocumentEventMap :
  Target extends "window" ? WindowEventMap :
  HTMLElementEventMap;

export type DOMEditorEventName<Target extends DOMEditorEventTarget> =
  Extract<keyof DOMEditorEventMap<Target>, string>;

/** Values shared by DOM and keyboard event conditions and handlers. */
export interface DOMEditorEventContext<
  Target extends DOMEditorEventTarget = DOMEditorEventTarget,
  Type extends DOMEditorEventName<Target> = DOMEditorEventName<Target>,
> {
  readonly editor: RivtoEditorApi;
  readonly root: HTMLElement;
  readonly mode: EditorMode;
  readonly selection: EditorSelection;
  readonly event: DOMEditorEventMap<Target>[Type];
  readonly eventTarget: Target;
  readonly insideRoot: boolean;
  readonly blockElement: HTMLElement | null;
  readonly blockId: string | undefined;
  readonly contentElement: HTMLElement | null;
}

/** Restricts and configures one native listener. */
export interface DOMEditorEventOptions<Target extends DOMEditorEventTarget = "root"> {
  readonly target?: Target;
  readonly mode?: EditorMode | readonly EditorMode[];
  readonly capture?: boolean;
  readonly passive?: boolean;
}

export type EditorEventHandler<Context> = (context: Context) => boolean | void;

/**
 * Common ordered registration and claiming behavior for editor event systems.
 *
 * Returning `true` from a handler means that Rivto owns the native event. The
 * dispatcher prevents the browser default and skips every later registration.
 * Returning nothing leaves both native behavior and later handlers available.
 */
export abstract class EditorEvent {
  protected destroyed = false;

  protected register<Item>(
    items: Item[],
    item: Item,
    changed: () => void,
  ): () => void {
    if (this.destroyed) throw new Error("Editor event runtime is destroyed");
    items.push(item);
    changed();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const index = items.indexOf(item);
      if (index >= 0) items.splice(index, 1);
      changed();
    };
  }

  protected modeMatches(
    expected: EditorMode | readonly EditorMode[] | undefined,
    actual: EditorMode,
  ): boolean {
    return !expected || (Array.isArray(expected) ? expected.includes(actual) : expected === actual);
  }

  protected claim(event: globalThis.Event, handled: boolean | void): boolean {
    if (!handled) return event.defaultPrevented;
    if (event.cancelable) event.preventDefault();
    return true;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

type AnyDOMContext = DOMEditorEventContext<DOMEditorEventTarget, never>;
type DOMRegistration = {
  readonly type: string;
  readonly target: DOMEditorEventTarget;
  readonly listener: EditorEventHandler<AnyDOMContext>;
  readonly mode?: EditorMode | readonly EditorMode[];
  readonly capture: boolean;
  readonly passive: boolean;
};

interface ConnectedListener {
  readonly target: EventTarget;
  readonly type: string;
  readonly listener: EventListener;
  readonly capture: boolean;
}

/**
 * Typed DOM event registry following the active surface across root changes.
 *
 * Document and window registrations are resolved through the root's owning
 * document instead of global objects, which keeps multiple editors and iframe
 * editors isolated and makes teardown deterministic.
 */
export class DOMEditorEvents extends EditorEvent {
  private root: HTMLElement | null = null;
  private readonly registrations: DOMRegistration[] = [];
  private readonly connected: ConnectedListener[] = [];
  private readonly claimedEvents = new WeakSet<globalThis.Event>();

  constructor(
    protected readonly editor: RivtoEditorApi,
    protected readonly getMode: () => EditorMode,
  ) {
    super();
  }

  /** Registers a root, document, or window handler. */
  on<
    Target extends DOMEditorEventTarget = "root",
    Type extends DOMEditorEventName<Target> = DOMEditorEventName<Target>,
  >(
    type: Type,
    listener: EditorEventHandler<DOMEditorEventContext<Target, Type>>,
    options: DOMEditorEventOptions<Target> = {},
  ): () => void {
    const registration: DOMRegistration = {
      type,
      target: options.target ?? "root",
      listener: listener as unknown as EditorEventHandler<AnyDOMContext>,
      mode: options.mode,
      capture: options.capture ?? false,
      passive: options.passive ?? false,
    };
    return this.register(this.registrations, registration, () => this.reconnect());
  }

  /** Rebinds every registration to a newly rendered surface and its realm. */
  setRoot(root: HTMLElement | null): void {
    if (root === this.root) return;
    this.disconnect();
    this.root = root;
    this.connect();
  }

  /** Returns the active surface root without requiring React context. */
  getRoot(): HTMLElement | null {
    return this.root;
  }

  override destroy(): void {
    if (this.destroyed) return;
    this.disconnect();
    this.root = null;
    this.registrations.length = 0;
    super.destroy();
  }

  private reconnect(): void {
    this.disconnect();
    this.connect();
  }

  private nativeTarget(target: DOMEditorEventTarget): EventTarget | null {
    if (!this.root) return null;
    if (target === "document") return this.root.ownerDocument;
    if (target === "window") return this.root.ownerDocument.defaultView;
    return this.root;
  }

  private connect(): void {
    if (!this.root) return;
    const groups = new Map<string, DOMRegistration>();
    for (const registration of this.registrations) {
      const key = [
        registration.target,
        registration.type,
        registration.capture,
        registration.passive,
      ].join(":");
      if (!groups.has(key)) groups.set(key, registration);
    }

    for (const registration of groups.values()) {
      const target = this.nativeTarget(registration.target);
      if (!target) continue;
      const listener: EventListener = (event) => this.dispatch(registration, event);
      target.addEventListener(registration.type, listener, {
        capture: registration.capture,
        passive: registration.passive,
      });
      this.connected.push({
        target,
        type: registration.type,
        listener,
        capture: registration.capture,
      });
    }
  }

  private disconnect(): void {
    this.connected.forEach(({ target, type, listener, capture }) => {
      target.removeEventListener(type, listener, capture);
    });
    this.connected.length = 0;
  }

  private dispatch(group: DOMRegistration, event: globalThis.Event): void {
    const root = this.root;
    if (!root || event.defaultPrevented || this.claimedEvents.has(event)) return;
    const nativeTarget = event.target;
    const ElementConstructor = root.ownerDocument.defaultView?.Element;
    const element = ElementConstructor && nativeTarget instanceof ElementConstructor
      ? nativeTarget
      : null;
    const insideRoot = Boolean(element && (element === root || root.contains(element)));
    const blockElement = insideRoot
      ? element?.closest<HTMLElement>(BLOCK_ID_SELECTOR) ?? null
      : null;
    const contentElement = insideRoot
      ? element?.closest<HTMLElement>(BLOCK_CONTENT_SELECTOR) ?? null
      : null;
    const mode = this.getMode();
    const context = {
      editor: this.editor,
      root,
      mode,
      selection: this.editor.selection.get(),
      event,
      eventTarget: group.target,
      insideRoot,
      blockElement,
      blockId: blockElement?.getAttribute(BLOCK_ID_ATTRIBUTE) ?? undefined,
      contentElement,
    } as unknown as AnyDOMContext;

    for (const registration of [...this.registrations]) {
      if (event.defaultPrevented) return;
      if (
        registration.type !== group.type ||
        registration.target !== group.target ||
        registration.capture !== group.capture ||
        registration.passive !== group.passive ||
        !this.modeMatches(registration.mode, mode)
      ) continue;
      if (this.claim(event, registration.listener(context))) {
        this.claimedEvents.add(event);
        return;
      }
    }
  }
}
