/** Native input names accepted by a Page occurrence, including document lifecycle events. */
export interface BlockInputEventMap extends GlobalEventHandlersEventMap {
  selectionchange: Event;
  visibilitychange: Event;
}

/** Native listener attachment realm relative to the mounted editor. */
export type BlockInputTarget = "root" | "document" | "window";
/** Optional requirement on the resolved target of an input event. */
export type BlockInputScope = "root" | "block" | "content" | "selection-anchor";

/** Typed native input with occurrence-local DOM context; contains no host editor or model. */
export class BlockInputEvent<K extends keyof BlockInputEventMap> {
  readonly insideRoot: boolean;
  readonly blockElement: HTMLElement | null;
  readonly blockId: string | null;
  readonly contentElement: HTMLElement | null;
  readonly selectionAnchor: HTMLElement | null;

  /**
   * Resolves target ancestry once for all handlers of this native input.
   *
   * Descendants of a nested editor are excluded from this occurrence. Window
   * events outside the root remain available, with empty block context.
   *
   * @param raw - Original browser event, never redispatched or mutated here.
   * @param root - Current occurrence root.
   * @param eventTarget - Realm on which the native listener was installed.
   */
  constructor(
    readonly raw: BlockInputEventMap[K],
    readonly root: HTMLElement,
    readonly eventTarget: BlockInputTarget,
  ) {
    const ElementType = root.ownerDocument.defaultView?.Element;
    const target = ElementType && raw.target instanceof ElementType ? raw.target : null;
    const boundary = target?.closest("[data-rivto-block-editor]");
    this.insideRoot = !!target && root.contains(target) && (!boundary || boundary === root);
    this.blockElement = this.insideRoot ? target!.closest<HTMLElement>("[data-block-id]") : null;
    if (this.blockElement && !root.contains(this.blockElement)) {
      this.blockElement = null;
    }
    this.blockId = this.blockElement?.getAttribute("data-block-id") ?? null;
    this.contentElement = this.resolveElement(target, "[data-block-content]");
    this.selectionAnchor = this.resolveElement(target, "[data-block-selection-anchor]");
  }

  /**
   * Checks a registration's optional DOM context requirement.
   *
   * @param scope - Required context; omission accepts events outside the root too.
   * @returns Whether this event satisfies the context requirement.
   */
  matches(scope: BlockInputScope | undefined): boolean {
    if (this.eventTarget === "root" && !this.insideRoot) {
      return false;
    }
    if (!scope) {
      return true;
    }
    if (scope === "block") {
      return this.blockElement !== null;
    }
    if (scope === "content") {
      return this.contentElement !== null;
    }
    if (scope === "selection-anchor") {
      return this.selectionAnchor !== null;
    }
    return this.insideRoot;
  }
  /**
   * Resolves a marker belonging to the nearest block inside this occurrence.
   *
   * @param target - Native element target, or null for document/window events.
   * @param selector - Marker identifying content or structural selection anchors.
   * @returns Owning marker, or null across a block or editor boundary.
   */
  private resolveElement(target: Element | null, selector: string): HTMLElement | null {
    if (!this.insideRoot || !this.blockElement) {
      return null;
    }
    const element = target?.closest<HTMLElement>(selector);
    if (
      !element ||
      !this.root.contains(element) ||
      element.closest("[data-block-id]") !== this.blockElement
    ) {
      return null;
    }
    return element;
  }
}

/** Input handler ordering and native attachment configuration. */
export interface BlockInputDefinition<K extends keyof BlockInputEventMap> {
  readonly type: K;
  /** Defaults to root. Document and window listeners can observe outside events. */
  readonly target?: BlockInputTarget;
  readonly capture?: boolean;
  /** Finite priority; higher values run first, ties preserve installation order. */
  readonly priority: number;
  readonly scope?: BlockInputScope;
  /**
   * Evaluates live feature availability after scope matching.
   *
   * @param event - Normalized native input for the current attachment.
   * @returns Whether the handler should run.
   */
  readonly when?: (event: BlockInputEvent<K>) => boolean;
}

/**
 * Handles input without implicitly preventing defaults or stopping DOM propagation.
 *
 * @param event - Native input and occurrence-local target context.
 * @returns "handled" to stop subsequent editor handlers, or "continue" to continue delivery.
 */
export type BlockInputHandler<K extends keyof BlockInputEventMap> = (
  event: BlockInputEvent<K>,
) => BlockInputResult;

/** Explicit result of editor input handling, separate from native default prevention. */
export type BlockInputResult = "handled" | "continue";

/**
 * Observes native input independently of whether a handler claims delivery.
 *
 * Return values are ignored; observers cannot consume the editor dispatch queue.
 *
 * @param event - Shared occurrence context and native input.
 * @returns Observation side effects have completed.
 */
export type BlockInputObserver<K extends keyof BlockInputEventMap> = (
  event: BlockInputEvent<K>,
) => void;
