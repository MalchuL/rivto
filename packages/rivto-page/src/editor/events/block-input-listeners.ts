import type { BlockInputTarget } from "./block-input-event";

/** Native phase and target shared by one ordered dispatch queue. */
interface BlockNativeDefinition {
  readonly type: string;
  readonly target: BlockInputTarget;
  readonly capture: boolean;
}

/** Retained native registration with attachment-local cleanup. */
interface BlockNativeRegistration {
  readonly definition: BlockNativeDefinition;
  /**
   * Delivers native input to the owning queue.
   *
   * @param event - Native event from the attachment realm.
   * @param root - Attached occurrence root.
   * @returns Queue delivery has completed.
   */
  readonly deliver: (event: Event, root: HTMLElement) => void;
  detach?: () => void;
}

/** Owns native listeners and rolls back incomplete occurrence attachments. */
export class BlockInputListeners {
  private readonly registrations = new Set<BlockNativeRegistration>();
  private attachment: { readonly root: HTMLElement } | undefined;

  /**
   * Retains a native queue and connects it immediately when mounted.
   *
   * @param definition - Native phase and realm; listeners explicitly allow default prevention.
   * @param deliver - Dispatcher receiving the event and attached root.
   * @returns Idempotent disposer removing this queue from current and future attachments.
   * @throws If native listener installation fails.
   */
  register(
    definition: BlockNativeDefinition,
    deliver: BlockNativeRegistration["deliver"],
  ): () => void {
    const registration: BlockNativeRegistration = { definition, deliver };
    if (this.attachment) {
      this.connect(registration, this.attachment.root);
    }
    this.registrations.add(registration);
    return () => {
      if (this.registrations.delete(registration)) {
        const detach = registration.detach;
        registration.detach = undefined;
        detach?.();
      }
    };
  }

  /**
   * Installs every retained queue for one occurrence root.
   *
   * A failed installation releases all listeners already installed. Each returned
   * disposer belongs to this attachment only; stale disposers cannot detach a remount.
   *
   * @param root - Committed occurrence root providing the native document and window.
   * @returns Idempotent disposer preserving registrations for a later mount.
   * @throws If already attached, installation fails, or rollback cleanup fails.
   */
  attach(root: HTMLElement): () => void {
    if (this.attachment) {
      throw new Error("Input listeners already attached");
    }
    const attachment = { root };
    this.attachment = attachment;
    try {
      for (const registration of this.registrations) {
        this.connect(registration, root);
      }
    } catch (error) {
      try {
        this.detach();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Input attachment and rollback failed");
      }
      throw error;
    }
    return () => {
      if (this.attachment === attachment) {
        this.detach();
      }
    };
  }

  /**
   * Installs one native listener with explicit nonpassive delivery.
   *
   * @param registration - Queue whose listener is not installed yet.
   * @param root - Root supplying the native realm.
   * @returns Registration retains cleanup for this exact native listener.
   * @throws If the browser rejects listener installation.
   */
  private connect(registration: BlockNativeRegistration, root: HTMLElement): void {
    const { definition, deliver } = registration;
    let target: EventTarget = root;
    if (definition.target === "document") {
      target = root.ownerDocument;
    } else if (definition.target === "window") {
      target = root.ownerDocument.defaultView ?? root.ownerDocument;
    }
    const attachment = this.attachment;
    const listener = (event: Event) => {
      if (this.attachment === attachment) {
        deliver(event, root);
      }
    };
    target.addEventListener(definition.type, listener, {
      capture: definition.capture,
      passive: false,
    });
    registration.detach = () =>
      target.removeEventListener(definition.type, listener, definition.capture);
  }

  /**
   * Releases all native listeners even if an individual removal fails.
   *
   * @returns Attachment is cleared and retained queues can attach again.
   * @throws AggregateError containing every native removal failure.
   */
  private detach(): void {
    this.attachment = undefined;
    const errors: unknown[] = [];
    for (const registration of this.registrations) {
      const detach = registration.detach;
      registration.detach = undefined;
      try {
        detach?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Input listener cleanup failed");
    }
  }
}
