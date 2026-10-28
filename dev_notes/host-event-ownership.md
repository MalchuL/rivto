# Host event ownership

The host and standalone Page editor both dispatch DOM events, but they implement
different interaction contracts. They should not share a configurable dispatcher
merely because both keep handler lists.

| Contract         | Host                                                      | Standalone Page                                           |
| ---------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| Receiving editor | Registry routes among mounted panels                      | One attached occurrence                                   |
| Handler order    | Registration order within native options                  | Priority, then registration order                         |
| Claim result     | `true`                                                    | `"handled"`                                               |
| Browser defaults | Prevented when claimed unless disabled or passive         | Handler explicitly calls `preventDefault()`               |
| Observers        | No separate observer queue                                | Observers run even after a claim                          |
| Context          | Panel API, selection, surface mode, block/content markers | Occurrence-local DOM markers, including selection anchors |

## Host delivery path

1. `DOMEventListeners` owns native connections. Unchanged listener groups keep
   their identity when registrations change.
2. `EventManager` captures the registration list for the native event before
   routing. Additions wait for another event; removals immediately deactivate
   entries, including entries waiting in later phases.
3. `PanelEventFactory` asks `PanelRegistry` to resolve the receiving root, then
   reads its panel API, rendered surface mode, selection and DOM target markers.
   Routing retains its existing activation and pointer-ownership side effects.
4. `EditorEvent` stores that context and checks mode/scope restrictions through
   `matches()`. DOM dispatch and keyboard transport use the same method.
5. `EventManager` evaluates availability predicates and invokes eligible handlers,
   stopping editor delivery when one claims the event. DOM propagation is unchanged.

Context is created once per native listener group, not once across all phases.
Selection and mode can therefore reflect changes made by earlier groups.

## Creation and cleanup

`ReactEditor` creates and destroys `EventManager`. The manager owns native
connections, root subscriptions and registration disposers. Panels retain their
local registration disposers without destroying the shared manager.

`PanelEventFactory` is internal to the host. It borrows only routing, panel lookup
and surface lookup; it owns no subscriptions and needs no destroy method.
`EditorEvent` and keyboard event values own no resources.

Registration setup rolls back its handler and releases its ID if native attachment
or extension cleanup ownership fails. Native attachment preserves existing
connections and removes newly installed connections when a later attachment fails.
Keyboard transport similarly releases completed routes if a later route fails.
Setup errors remain visible alongside any rollback errors.

Event destruction disables delivery before attempting native listener removal,
root unsubscription and every registration disposer. Keyboard route cleanup drains
its owned list before calling disposers, so repeated or reentrant cleanup is harmless.
Cleanup failures are reported together after the remaining resources are attempted.
If a native target throws from removal, its listener may remain physically attached,
but the disabled callback no longer delivers editor events.

No `rivto-events` package is introduced. Page's priorities, observers, explicit
default prevention and attachment lifecycle remain in Page. A future shared module
needs a concrete common contract that removes duplication without combining these
different policies into configuration switches.

The former exported `modeMatches` and `scopeMatches` helpers are replaced by
`event.matches(definition)`. All repository consumers use the event method.
