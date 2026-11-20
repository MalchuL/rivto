import type {
  BrowserInputMap,
  InputObserver,
  InputObserverDefinition,
  InputRoot,
} from "../../events/types";
import { BrowserInputListeners } from "./browser-input-listeners";

/** Owns one occurrence's shared normalized input observation. */
export class BrowserInputObserver implements InputObserver {
  private readonly listeners = new BrowserInputListeners({ ownsRoot: false, trackDispatch: true });
  private readonly releases = new Set<() => void>();
  private readonly detach: () => void;
  private active = true;

  /**
   * Attaches an observer to the borrowed Root without owning the Root.
   *
   * @param root - Attached browser Root bounding all delivered input.
   * @throws If the Root is detached or native attachment fails.
   */
  constructor(root: Pick<InputRoot, "isAttached">) {
    this.detach = this.listeners.attach(root);
  }

  /**
   * Retains one input group with the observer's shared dispatch identity.
   *
   * @param definition - Input name, target, phase, and listener options.
   * @param deliver - Receives normalized input and its shared dispatch identity.
   * @returns Idempotent disposer releasing this group's registration.
   * @throws If disposed or listener setup fails.
   */
  observe<K extends keyof BrowserInputMap>(
    definition: InputObserverDefinition<K>,
    deliver: (input: BrowserInputMap[K], dispatchIdentity?: object) => void,
  ): () => void {
    if (!this.active) {
      throw new Error("Input observer is disposed");
    }
    const releaseInput = this.listeners.register(definition, deliver);
    if (!this.active) {
      releaseInput();
      throw new Error("Input observer was disposed during registration");
    }
    let active = true;
    const release = () => {
      if (!active) {
        return;
      }
      active = false;
      this.releases.delete(release);
      releaseInput();
    };
    this.releases.add(release);
    return release;
  }

  /**
   * Releases every group and detaches the borrowed browser Root.
   *
   * @returns All retained registrations and the attachment have been offered cleanup.
   * @throws Cleanup failures, aggregated when multiple releases fail.
   */
  dispose(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    const errors: unknown[] = [];
    for (const release of [...this.releases, this.detach]) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Input observer cleanup failed");
    }
  }
}
