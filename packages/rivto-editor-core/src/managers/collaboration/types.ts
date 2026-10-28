import type { Selection } from "../selection-manager";
import type { CollaborationUser, Presence } from "./state";

export type { CollaborationUser } from "./state";
/** Canvas world coordinates, panel content coordinates, or fractions of a block's bounds. */
export type CollaborationPointer = NonNullable<Presence["pointer"]>;
/** Detached participant state; selection offsets resolve against the current document. */
export interface CollaborationParticipantState {
  /** Transport session identity, distinct from persistent user identity. */
  readonly clientId: number;
  /** Participant identity unique within its session. */
  readonly id: string;
  readonly user: CollaborationUser;
  readonly mode: "block" | "edgeless";
  readonly pointer: CollaborationPointer | null;
  readonly selection: Selection | null;
}

/** Owned participant registration independent of DOM focus and document history. */
export interface CollaborationParticipant {
  /** Stable participant identity, scoped to this session. */
  readonly id: string;
  /**
   * Reads this registration's state with text anchors resolved against current content.
   *
   * @returns Detached state, including empty state after clear; does not publish it.
   * @throws If this registration has been disposed or its editor destroyed.
   */
  getState(): CollaborationParticipantState;
  /**
   * Publishes this participant's text, block and element selection without changing local editor selection.
   *
   * @param selection - Editor selection using UTF-16 offsets, or null to clear only its selection. Missing targets are omitted.
   * @returns Converts text boundaries to CRDT anchors and publishes this participant.
   * @throws If disposed, offsets are invalid, or delegated position creation fails.
   */
  setSelection(selection: Selection | null): void;
  /**
   * Publishes this participant's pointer without changing another participant.
   *
   * @param pointer - Finite coordinates, or null to clear only the pointer. Canvas sets edgeless mode; block/panel sets block mode.
   * @returns Publishes immediately; caller controls update frequency.
   * @throws If disposed or pointer data is invalid.
   */
  setPointer(pointer: CollaborationPointer | null): void;
  /**
   * Changes surface mode while discarding coordinates from the previous surface.
   *
   * @param mode - Target surface; text and object selection remain retained.
   * @returns Publishes the mode and clears this participant's pointer.
   * @throws If disposed or mode is invalid.
   */
  setMode(mode: "block" | "edgeless"): void;
  /**
   * Withdraws this participant while keeping its registration reserved for reuse.
   *
   * @returns Removes its published state and resets pointer and selection; later setters republish it.
   * @throws If this registration has been disposed.
   */
  clear(): void;
  /**
   * Releases this registration and withdraws only its own presence.
   *
   * @returns Removes the participant and frees its ID; repeated calls do nothing.
   */
  dispose(): void;
}

/** Headless presence manager owned by one editor over its document's session. */
export interface CollaborationManagerApi {
  /**
   * Registers an independent human or agent in this session.
   *
   * @param options - Session-local participant ID and detached display identity; registration publishes an empty block-mode presence.
   * @param options.id - Nonempty ID, up to 512 characters; reserved until disposal, even when cleared.
   * @param options.user - User ID, display name and six-digit hex color; not authentication.
   * @returns Handle owning only this participant; editor destruction disposes it.
   * @throws If destroyed, identity is invalid, or the participant ID is already registered in this document session.
   */
  registerParticipant(options: { id: string; user: CollaborationUser }): CollaborationParticipant;
  /**
   * Reads valid published participants from local and remote sessions.
   *
   * @returns Detached states with currently resolved text ranges; withdrawn and invalid states are omitted.
   */
  getParticipants(): readonly CollaborationParticipantState[];
}
