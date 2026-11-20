# Native listener lifetime: Host, Page and Canvas

## Current implementation

`@chulane/rivto-root` now owns the common single-root native listener lifecycle
used by Page input, Page focus observation, and Canvas. Its generic event
dispatcher is also used by Page, Canvas, and the React host. Canvas registrations now use normalized input and capabilities. The Page and
React registration APIs, and the low-level browser listener entry, still expose
native events and DOM objects; the planned normalization migration is not complete. It retains registrations
across remounts, rolls back partial attachment, disables stale callbacks and
attempts every removal. Page and Canvas keep their different input context,
priorities, claims, nested-root rules and attachment owners. Canvas still rejects
roots without a window; Page retains its document fallback.

`CanvasViewport` withdraws its ownership and layers even when listener teardown
fails, and preserves attachment/cleanup failures. Host multi-panel event routing
continues to use `DOMEventListeners` independently.

The remaining sections capture the **historical comparison before extraction**.
Their decision and Canvas failure-path findings describe the old implementation,
not the current behavior. They explain why this extraction was evaluated in two
real consumers before considering the host.

Reviewed against the pre-extraction code on 2026-10-26, after the host dispatch, context
and failure-cleanup changes. This completes the three-way comparison proposed by
Candidate 3 of the architecture review; it does not introduce a shared package.

## Decision

Keep native listener ownership in the existing modules for now. Do not introduce
`rivto-events` or make Page and Canvas depend on the React host.

Two possible interfaces were considered:

- An individual native connection with idempotent removal could centralize an
  active flag and `addEventListener`/`removeEventListener`. It would not remove
  root ownership, grouping, attachment transactions, remount identity or aggregate
  cleanup from any caller. That is too little shared behavior for a new package.
- A complete listener owner could remove more bookkeeping, but needs both dynamic
  multi-root reconciliation and single-root retained registrations. It also needs
  caller-specific policies for missing windows, passive groups and lifecycle
  listeners. Current callers would still need adapters for those differences.

This decision concerns native lifetime, independently of dispatch differences.
Priorities, claims and observers are additional reasons not to merge dispatchers;
those differences alone would not rule out sharing native connections.

Reconsider extraction when the same attachment contract can replace substantial
ownership code in at least two callers, with tests proving that their existing
lifecycle behavior survives. Prefer that concrete deletion over a configurable
framework designed around all three implementations.

## Ownership and behavior

| Concern                    | Host                                                                                  | Page                                                                  | Canvas                                                    |
| -------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| Creator                    | `ReactEditor` creates `EventManager`                                                  | `BlockEditorController` creates `BlockEditorEvents`                   | `CanvasViewport` creates `CanvasEvents`                   |
| Native owner               | `DOMEventListeners`                                                                   | `BlockInputListeners`                                                 | Native connections inside `CanvasEvents`                  |
| Root lifetime              | Reconcile a changing set of registered panel roots                                    | One attachment; queues retained while detached                        | One attachment; groups retained while detached            |
| Grouping                   | Native target, event name, capture and passive; shared documents/windows deduplicated | Dispatcher groups type, target and capture before native registration | Type, target and capture groups also own ordered entries  |
| Missing window             | Skip window targets                                                                   | Use the root's document for a window target                           | Reject attachment                                         |
| Native passive option      | Registration-controlled, separate groups                                              | Always false                                                          | Always false                                              |
| Automatic listeners        | Panel focus/pointer lifecycle groups                                                  | Focus observation has a separate owner                                | Added by consumers such as input controllers              |
| Stale detach protection    | Exact connection identity and disabled callbacks                                      | Attachment identity; old detach cannot remove a remount               | Once-only returned detach; tested across a normal remount |
| Partial attachment failure | Remove newly added connections; retain existing connections                           | Detach the failed occurrence; retain queues for retry                 | Call detach; cleanup failure can replace the setup error  |
| Removal failure            | Disable connections, attempt all removals, aggregate errors                           | Clear attachment, attempt all removals, aggregate errors              | Stop at first throw; later groups are not released        |

Page and Canvas public consumers register behavior. Their view/controller owners
attach and detach; an extension should not acquire ownership of the whole editor
just to remove its registration. Host panel consumers similarly own local
disposers and borrow the shared runtime.

## Concrete remaining Canvas issue

These are source-confirmed failure paths, not newly reproduced browser failures:

1. `CanvasEvents.detach()` clears `root`, then calls each group's release before
   clearing that group's release field. A throw stops the loop and leaves later
   groups attached. Global listener callbacks have no attachment-validity guard.
2. `CanvasEvents.attach()` calls `detach()` inside its catch before rethrowing the
   setup error. If detach throws, the setup error is lost.
3. `CanvasEvents.remove()` releases an empty group before deleting it. If native
   removal throws, the empty group and its release remain stored.
4. `CanvasViewport.attach()` cleanup calls `detachEvents()` before removing its
   mounted-owner entry and publishing null layers. A detach failure prevents
   those later ownership updates. Its attachment-error path has the same order.

The next runtime change should reproduce and fix these together in CanvasEvents
and CanvasViewport, preserving root isolation, group-local claims and remount
registrations. It should not be combined with a new cross-package interface.

## Evidence and verification scope

Inspected creation, registration, attachment, delivery and cleanup in:

- [Host native listeners](../packages/react-rivto-editor/src/managers/events/dom-event-listeners.ts),
  [event manager](../packages/react-rivto-editor/src/managers/events/event-manager.ts),
  and [host ownership](./host-event-ownership.md).
- [Page native listeners](../packages/rivto-page/src/editor/events/block-input-listeners.ts),
  [dispatcher](../packages/rivto-page/src/editor/events/block-input-dispatcher.ts),
  [event owner](../packages/rivto-page/src/editor/events/block-editor-events.ts),
  and [controller](../packages/rivto-page/src/editor/block-editor-controller.ts).
- [Canvas events](../packages/rivto-edgeless/src/browser/canvas-events.ts) and
  [viewport](../packages/rivto-edgeless/src/browser/canvas-viewport.ts).

Existing focused Page event tests cover ordering, observers, cross-phase claims,
attachment rollback, continued cleanup after errors and remounts. Existing Canvas
tests cover group ordering/claims, nested roots, mutation during delivery, normal
remounts and registration retry after native installation fails. They do not
establish the missing Canvas cleanup guarantees above.

The focused Page and Canvas event suites were run for this review. No runtime or
type declarations changed, so browser performance measurements and package builds
were not repeated. Documentation links and formatting were checked separately.
