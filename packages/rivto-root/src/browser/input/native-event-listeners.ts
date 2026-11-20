import type {
  InputRootOwnerCheck,
  NativeEventDefinition,
  NativeEventListener,
  NativeInputAttachment,
  NativeRegistration,
} from "./types";
import { captureBrowserInput } from "./capture-browser-input";

/** Owns native listeners for one root and preserves registrations across remounts. */
export class NativeEventListeners {
  private readonly registrations = new Set<NativeRegistration>();
  private attachment: NativeInputAttachment | undefined;

  /**
   * Retains a native queue and connects it immediately when mounted.
   *
   * The window target uses the root document if it has no window. Consumers may
   * enforce stricter attachment requirements before calling attach.
   *
   * @param definition - Native event name, target, capture phase, and passive option.
   * @param deliver - Callback receiving native input, attached root and normalized input.
   * @returns Idempotent disposer removing this queue from current and future attachments.
   * @throws If native listener installation fails.
   */
  register(definition: NativeEventDefinition, deliver: NativeEventListener): () => void {
    const registration: NativeRegistration = { definition, deliver, active: true };
    if (this.attachment) {
      this.connect(registration, this.attachment.root);
    }
    this.registrations.add(registration);
    return () => {
      if (this.registrations.delete(registration)) {
        registration.active = false;
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
   * @param isCurrent - Optional borrowed occurrence lifetime, checked during input delivery.
   * @returns Idempotent disposer preserving registrations for a later mount.
   * @throws If already attached, installation fails, or rollback cleanup fails.
   */
  attach(root: HTMLElement, isCurrent?: InputRootOwnerCheck): () => void {
    if (this.attachment) {
      throw new Error("Input listeners already attached");
    }
    const attachment = { root, isCurrent };
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
   * Installs one native listener with the requested passive and capture options.
   *
   * @param registration - Queue whose listener is not installed yet.
   * @param root - Root supplying the native realm.
   * @returns Registration retains cleanup for this exact native listener.
   * @throws If the browser rejects listener installation.
   */
  private connect(registration: NativeRegistration, root: HTMLElement): void {
    const { definition, deliver } = registration;
    let target: EventTarget = root;
    if (definition.target === "document") {
      target = root.ownerDocument;
    } else if (definition.target === "window") {
      target = root.ownerDocument.defaultView ?? root.ownerDocument;
    }
    const attachment = this.attachment;
    const listener = (event: Event) => {
      const isCurrent = () => {
        if (this.attachment !== attachment) {
          return false;
        }
        const current = attachment?.isCurrent?.() ?? true;
        return current && this.attachment === attachment;
      };
      if (registration.active && isCurrent()) {
        let delivering = true;
        try {
          const input = captureBrowserInput(event, root, isCurrent, () => delivering);
          if (registration.active && isCurrent()) {
            deliver(event, root, input);
          }
        } finally {
          delivering = false;
        }
      }
    };
    target.addEventListener(definition.type, listener, {
      capture: definition.capture,
      passive: definition.passive ?? false,
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
