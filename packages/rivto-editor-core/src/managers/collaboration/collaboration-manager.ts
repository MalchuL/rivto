import { z } from "zod";
import type { DocumentModel } from "@chulane/document-model";
import { decodeSelection, encodeSelection, presenceSchema, type Presence } from "./state";
import type {
  CollaborationManagerApi,
  CollaborationParticipant,
  CollaborationParticipantState,
  CollaborationUser,
} from "./types";

const participantSchema = presenceSchema.extend({ id: z.string().min(1).max(512) });
const sessionSchema = z.object({ participants: z.array(participantSchema).max(1024) });
/** Reservations span editors sharing the same channel, including temporarily hidden participants. */
const reservations = new WeakMap<DocumentModel["collaboration"], Set<string>>();

/** Owns headless participant registrations without storing presence in document content. */
export class CollaborationManager implements CollaborationManagerApi {
  private readonly participants = new Map<string, CollaborationParticipant>();
  private readonly reserved: Set<string>;
  private destroyed = false;

  /**
   * Binds registrations to a caller-owned document's existing transient channel.
   *
   * @param document - Model whose provider owns session identity and transport.
   */
  constructor(private readonly document: DocumentModel) {
    this.reserved = reservations.get(document.collaboration) ?? new Set();
    reservations.set(document.collaboration, this.reserved);
  }

  /**
   * Registers an independently controlled participant and publishes its initial empty state.
   *
   * @param options - Unique session-local ID and validated display identity.
   * @returns Owned registration; clear retains its reservation, dispose releases it.
   * @throws If destroyed, identity is invalid, the ID is reserved, or publication fails.
   */
  registerParticipant(options: { id: string; user: CollaborationUser }): CollaborationParticipant {
    if (this.destroyed) {
      throw new Error("Collaboration manager is destroyed");
    }
    const { id, ...initial } = participantSchema.parse({
      ...options,
      mode: "block",
      pointer: null,
      selection: null,
    });
    if (
      this.reserved.has(id) ||
      this.getParticipants().some(
        (peer) => peer.clientId === this.document.collaboration.clientId && peer.id === id,
      )
    ) {
      throw new Error(`Collaboration participant ${id} is already registered`);
    }
    let state: Presence = initial;
    let disposed = false;
    const assertActive = () => {
      if (disposed || this.destroyed) {
        throw new Error(`Collaboration participant ${id} is disposed`);
      }
    };
    const update = (patch: Partial<Presence>) => {
      assertActive();
      const next = presenceSchema.parse({ ...state, ...patch });
      state = next;
      this.publish(id, next);
    };
    const handle: CollaborationParticipant = {
      id,
      /**
       * Resolves the registration's retained text anchors without publishing.
       *
       * @returns Detached current state, including when temporarily withdrawn.
       * @throws If disposed or the manager has been destroyed.
       */
      getState: () => {
        assertActive();
        return this.resolve(id, this.document.collaboration.clientId, state);
      },
      /**
       * Captures editor text offsets as stable CRDT positions for this participant.
       *
       * @param selection - Text/structural selection, or null to clear its range.
       * @returns Publishes only this participant's selection.
       * @throws If disposed, offsets are invalid, or delegated anchor creation fails.
       */
      setSelection: (selection) => {
        assertActive();
        for (const range of selection?.blocks ?? []) {
          if (
            !Number.isInteger(range.start) ||
            range.start < 0 ||
            !Number.isInteger(range.end) ||
            range.end < -1 ||
            (range.end !== -1 && range.end < range.start)
          ) {
            throw new Error("Invalid collaboration selection offsets");
          }
        }
        update({ selection: encodeSelection(this.document, selection ?? undefined) });
      },
      /**
       * Publishes a pointer in its matching coordinate system.
       *
       * @param pointer - Finite point, or null to clear the pointer without changing mode.
       * @returns Updates only this participant and infers mode for non-null points.
       * @throws If disposed or pointer data is invalid.
       */
      setPointer: (pointer) => {
        const parsed = presenceSchema.shape.pointer.parse(pointer);
        const mode = parsed?.type === "canvas" ? "edgeless" : "block";
        update({ pointer: parsed, mode: parsed ? mode : state.mode });
      },
      /**
       * Retains the selection while replacing the participant's surface mode.
       *
       * @param mode - Target surface mode.
       * @returns Publishes the new mode without stale pointer coordinates.
       * @throws If disposed or mode is invalid.
       */
      setMode: (mode) => update({ mode, pointer: null }),
      /**
       * Withdraws this participant until its next explicit update.
       *
       * @returns Resets pointer and selection while preserving its ID reservation.
       * @throws If disposed or withdrawal fails.
       */
      clear: () => {
        assertActive();
        state = { ...state, pointer: null, selection: null };
        this.publish(id, null);
      },
      /**
       * Withdraws this registration and releases its ID for later reuse.
       *
       * @returns Releases only this participant; repeated calls do nothing.
       */
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        this.participants.delete(id);
        this.reserved.delete(id);
        this.publish(id, null);
      },
    };
    this.reserved.add(id);
    this.participants.set(id, handle);
    try {
      this.publish(id, state);
    } catch (error) {
      this.participants.delete(id);
      this.reserved.delete(id);
      throw error;
    }
    return handle;
  }

  /**
   * Resolves valid published states from every transport session.
   *
   * @returns Detached participant states with missing document targets omitted.
   */
  getParticipants(): CollaborationParticipantState[] {
    return [...this.document.collaboration.getStates()].flatMap(([clientId, state]) => {
      const parsed = sessionSchema.safeParse(state);
      if (!parsed.success) {
        return [];
      }
      const seen = new Set<string>();
      return parsed.data.participants.flatMap(({ id, ...presence }) => {
        if (seen.has(id)) {
          return [];
        }
        seen.add(id);
        return [this.resolve(id, clientId, presence)];
      });
    });
  }

  /**
   * Withdraws every registration owned by this manager, leaving other owners intact.
   *
   * @returns Releases registrations and prevents future registration or updates.
   * @throws An AggregateError if any withdrawal fails, after attempting all registrations.
   */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    const errors: unknown[] = [];
    for (const participant of [...this.participants.values()]) {
      try {
        participant.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Participant withdrawal failed");
    }
  }

  /**
   * Resolves CRDT ranges and detaches pointer and user metadata from retained state.
   *
   * @param id - Session-local participant ID.
   * @param clientId - Transport session ID.
   * @param state - Validated encoded presence.
   * @returns Detached public participant state.
   */
  private resolve(id: string, clientId: number, state: Presence): CollaborationParticipantState {
    return {
      id,
      clientId,
      user: { ...state.user },
      mode: state.mode,
      pointer: state.pointer ? { ...state.pointer } : null,
      selection: state.selection ? decodeSelection(this.document, state.selection) : null,
    };
  }

  /**
   * Merges one participant into the current session without replacing unrelated presence fields.
   *
   * @param id - Participant being updated or withdrawn.
   * @param presence - Encoded state, or null to withdraw only this ID.
   * @returns Publishes the merged transient envelope; an empty envelope withdraws the session.
   * @throws If the participant limit or transport publication fails.
   */
  private publish(id: string, presence: Presence | null): void {
    const channel = this.document.collaboration;
    const current = channel.getStates().get(channel.clientId) ?? {};
    const parsed = sessionSchema.safeParse(current);
    const participants = parsed.success
      ? parsed.data.participants.filter((entry) => entry.id !== id)
      : [];
    if (presence) {
      participants.push({ id, ...presence });
    }
    sessionSchema.parse({ participants });
    const { participants: _previous, ...other } = current;
    if (participants.length) {
      channel.setLocalState({ ...other, participants });
    } else {
      channel.setLocalState(Object.keys(other).length ? other : null);
    }
  }
}
