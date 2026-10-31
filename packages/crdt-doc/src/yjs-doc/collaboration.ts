import { Awareness, removeAwarenessStates } from "y-protocols/awareness";
import type * as Y from "yjs";
import type { Collaboration, CollaborationState } from "../types/collaboration";

/** Lazily owns awareness so documents without presence do not start heartbeat timers. */
export class YjsCollaboration implements Collaboration {
  private instance?: Awareness;

  /**
   * Retains the native document whose client identity is used for presence.
   *
   * @param doc - Owner; destroying it also destroys initialized awareness.
   */
  constructor(private readonly doc: Y.Doc) {}

  /**
   * Reads the connection identity without starting awareness.
   *
   * @returns The owner document's client ID.
   */
  get clientId(): number {
    return this.doc.clientID;
  }

  /**
   * Shares one native awareness instance between all attached providers.
   *
   * @returns Lazily initialized awareness, initially absent from the room.
   */
  get awareness(): Awareness {
    if (!this.instance) {
      this.instance = new Awareness(this.doc);
      this.instance.setLocalState(null);
    }
    return this.instance;
  }

  /**
   * Publishes detached JSON state independently of the Yjs document.
   *
   * @param state - Complete local presence, or null for departure.
   * @returns Notifies awareness listeners without touching document history.
   * @throws If JSON serialization fails.
   */
  setLocalState(state: CollaborationState | null): void {
    this.awareness.setLocalState(state === null ? null : JSON.parse(JSON.stringify(state)));
  }

  /**
   * Copies current peer states so consumers cannot mutate awareness internals.
   *
   * @returns Detached map of non-expired states, including local presence.
   */
  getStates(): ReadonlyMap<number, CollaborationState> {
    return new Map(
      Array.from(this.awareness.getStates(), ([id, state]) => [
        id,
        JSON.parse(JSON.stringify(state)),
      ]),
    );
  }

  /**
   * Subscribes to meaningful state changes rather than transport heartbeats.
   *
   * @param listener - Invoked after the awareness state changes.
   * @returns Cleanup releasing this listener.
   */
  subscribe(listener: () => void): () => void {
    this.awareness.on("change", listener);
    return () => this.awareness.off("change", listener);
  }

  /**
   * Removes remote states after the last transport has disconnected.
   *
   * @returns Clears remote presence while retaining the local state for reconnect.
   */
  clearRemoteStates(): void {
    if (this.instance) {
      const peers = [...this.instance.getStates().keys()].filter((id) => id !== this.clientId);
      removeAwarenessStates(this.instance, peers, this);
    }
  }
}
