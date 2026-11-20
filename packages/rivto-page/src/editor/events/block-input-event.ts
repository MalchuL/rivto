import type {
  BlockInputEvent,
  BlockInputEventMap,
  BlockInputScope,
  BlockInputTarget,
  BlockInputRoot,
} from "./types";
import { EDITOR_BOUNDARY_SELECTOR } from "./markers";

/** Typed normalized input with occurrence-local context and no host editor or model. */
export class BlockInputEventValue<
  K extends keyof BlockInputEventMap,
> implements BlockInputEvent<K> {
  readonly #attachment: object;
  readonly input: BlockInputEventMap[K];
  readonly insideRoot: boolean;
  readonly targetIsRoot: boolean;
  readonly blockId: string | null;
  private readonly hasBlock: boolean;
  private readonly hasContent: boolean;
  private readonly hasSelectionAnchor: boolean;

  /**
   * Resolves target ancestry once for all handlers of this native input.
   *
   * Descendants of a nested editor are excluded from this occurrence. Window
   * events outside the root remain available, with empty block context.
   * Browser objects are retained only in the separate private occurrence context.
   *
   * @param eventTarget - Realm on which the native listener was installed.
   * @param input - Root-normalized data and capabilities for this native delivery.
   * @param root - Browser capabilities belonging to this exact attachment.
   * @param attachment - Private Page attachment identity for this delivery.
   */
  constructor(
    readonly eventTarget: BlockInputTarget,
    input: BlockInputEventMap[K],
    readonly root: BlockInputRoot,
    attachment: object,
  ) {
    this.#attachment = attachment;
    this.targetIsRoot = input.target?.isRoot() ?? false;
    this.insideRoot = input.target?.belongsToRoot(EDITOR_BOUNDARY_SELECTOR) ?? false;
    this.blockId = this.insideRoot
      ? (input.target?.ancestorAttributeWithinRoot("[data-block-id]", "data-block-id") ?? null)
      : null;
    this.hasBlock = this.blockId !== null;
    this.hasContent =
      this.hasBlock &&
      (input.target?.hasAncestorWithinOwner("[data-block-content]", "[data-block-id]") ?? false);
    this.hasSelectionAnchor =
      this.hasBlock &&
      (input.target?.hasAncestorWithinOwner("[data-block-selection-anchor]", "[data-block-id]") ??
        false);
    this.input = input;
  }

  /**
   * Checks that this delivery still belongs to the current Page attachment.
   *
   * @param attachment - Current Page attachment, or undefined after detachment.
   * @returns False after the Root or Page attachment is released or replaced.
   * @throws Propagates Root owner-check failures.
   */
  isCurrent(attachment: object | undefined): boolean {
    return attachment !== undefined && this.#attachment === attachment && this.root.isAttached();
  }

  /**
   * Requests cancellation of the browser default for this delivery.
   *
   * @returns The browser default is prevented when the event is cancelable.
   */
  preventDefault(): void {
    this.input.preventDefault();
  }

  /**
   * Stops propagation of this browser input after the current target.
   *
   * @returns The browser will not propagate this input to later targets.
   */
  stopPropagation(): void {
    this.input.stopPropagation();
  }

  /**
   * Checks a registration's optional DOM context requirement.
   *
   * @param scope - Required context; omission accepts events outside the root
   * for document and window listeners, while `including-nested` also admits
   * targets inside nested editor occurrences for root listeners.
   * @returns Whether this event satisfies the context requirement.
   */
  matches(scope: BlockInputScope | undefined): boolean {
    if (scope === "including-nested") {
      return true;
    }
    if (this.eventTarget === "root" && !this.insideRoot) {
      return false;
    }
    if (!scope) {
      return true;
    }
    if (scope === "block") {
      return this.hasBlock;
    }
    if (scope === "content") {
      return this.hasContent;
    }
    if (scope === "selection-anchor") {
      return this.hasSelectionAnchor;
    }
    return this.insideRoot;
  }
}
