import type { EditorMode } from "@chulane/rivto";
import type { ReactEditor } from "../../../react-editor";
import {
  BLOCK_CONTENT_SELECTOR,
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_SELECTOR,
} from "../../../constants";
import {
  EditorEventManager,
  type EditorEventHandler,
} from "../editor-event-manager";
import type {
  DOMEditorEventContext,
  DOMEditorEventName,
  DOMEditorEventOptions,
  DOMEditorEventTarget,
} from "./types";

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
export class DOMEventManager extends EditorEventManager {
  private root: HTMLElement | null = null;
  private readonly registrations: DOMRegistration[] = [];
  private readonly connected: ConnectedListener[] = [];
  private readonly claimedEvents = new WeakSet<globalThis.Event>();

  /**
   * Creates an unattached delegated event manager.
   *
   * @param reactEditor - Complete owning runtime. Core state and mode are read
   * from it for every dispatch.
   */
  constructor(reactEditor: ReactEditor) {
    super(reactEditor);
  }

  /**
   * Registers a root, document, or window handler in declaration order.
   *
   * @param type - Native event name valid for the selected target realm.
   * @param listener - Handler returning true to claim the event.
   * @param options - Realm, mode, capture, and passive restrictions.
   * @returns Idempotent disposer that also reconnects grouped listeners.
   */
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

  /**
   * Rebinds every registration to a newly rendered surface and its realm.
   *
   * @param root - Current surface root, or null while no surface is committed.
   */
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
    const editor = this.reactEditor.editor;
    const mode = editor.mode.get();
    const context = {
      editor,
      root,
      mode,
      selection: editor.selection.get(),
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
