/** Transient JSON state belonging to one connected client, never document content. */
export type CollaborationState = Readonly<Record<string, unknown>>;

/** Adapter-neutral presence channel shared by a document's providers. */
export interface Collaboration {
  /** Connection identity; different tabs of the same user have different IDs. */
  readonly clientId: number;
  /**
   * Publishes detached JSON presence without a document transaction.
   *
   * @param state - Complete local presence, or null to withdraw it.
   * @returns Updates local subscribers and attached presence transports.
   * @throws If state cannot be serialized as JSON.
   */
  setLocalState(state: CollaborationState | null): void;
  /**
   * Reads detached presence for local and remote clients.
   *
   * @returns A new map; unavailable or expired peers are absent.
   */
  getStates(): ReadonlyMap<number, CollaborationState>;
  /**
   * Observes effective presence changes, excluding unchanged heartbeats.
   *
   * @param listener - Invoked after local or remote presence changes.
   * @returns Cleanup removing this subscription.
   */
  subscribe(listener: () => void): () => void;
}
