/** Current pointer owner in each browser document. */
const owners = new WeakMap<Document, { identity: object }>();
/** Owner captured for a pointer continuation shared by listener owners. */
const eventOwners = new WeakMap<Event, { identity: object } | null>();

/**
 * Starts a fresh owner snapshot at the shared native dispatch boundary.
 *
 * @param event - Pointer event entering a new browser dispatch.
 * @returns Later listener groups capture the current gesture independently of earlier dispatches.
 */
export function beginPointerDispatch(event: Event): void {
  eventOwners.delete(event);
}

/**
 * Captures the owner for a pointer continuation across shared listeners.
 *
 * @param event - Browser delivery whose listener groups share one captured owner.
 * @param document - Browser document containing the participating occurrences.
 * @returns Opaque owner identity, or undefined when no pointer is owned.
 */
export function getPointerOwner(event: Event, document: Document): object | undefined {
  if (!eventOwners.has(event)) {
    eventOwners.set(event, owners.get(document) ?? null);
  }
  return eventOwners.get(event)?.identity;
}

/**
 * Assigns the document's pointer gesture to an occurrence identity.
 *
 * @param document - Browser document containing the occurrence.
 * @param owner - Opaque element identity of the originating occurrence.
 * @returns Future pointer continuations use the supplied owner.
 */
export function claimPointerOwner(document: Document, owner: object): void {
  owners.set(document, { identity: owner });
}

/**
 * Releases only the gesture captured by this pointer continuation.
 *
 * A listener may start another gesture before later listeners receive the same
 * event. Even when both gestures use the same occurrence, the old release must
 * not clear the newer gesture.
 *
 * @param event - Pointer continuation whose captured gesture is being released.
 * @param document - Document containing the gesture.
 * @returns The captured gesture is released if it is still current.
 */
export function releaseEventPointerOwner(event: Event, document: Document): void {
  getPointerOwner(event, document);
  const owner = eventOwners.get(event);
  if (owner && owners.get(document) === owner) {
    owners.delete(document);
  }
}

/**
 * Clears document pointer ownership, optionally only for one occurrence.
 *
 * @param document - Browser document containing the gesture.
 * @param owner - Expected owner, or undefined to clear the current owner unconditionally.
 * @returns Ownership is cleared when the optional identity matches.
 */
export function releasePointerOwner(document: Document, owner?: object): void {
  if (!owner || owners.get(document)?.identity === owner) {
    owners.delete(document);
  }
}
