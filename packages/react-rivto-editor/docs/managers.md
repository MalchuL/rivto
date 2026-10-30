# React editor managers

`ReactEditor` owns shared document infrastructure. Extensions receive this
runtime and extend it through focused registration managers:

```ts
const extension: ReactEditorExtension = {
  id: "acme.cards",
  setup(reactEditor) {
    reactEditor.surfaces.registerBlockWrapper("block", CardControls);
    reactEditor.events.register(/* DOM definition */, /* action */);
    reactEditor.keyboard.register(/* keyboard definition */, /* action */);
    reactEditor.extensions.mount(CardOverlay);
  },
};
```

Mutable maps and arrays remain private. Every registration validates that the
runtime is active, preserves declaration order, returns an idempotent disposer,
and is automatically released by `ReactEditor.destroy()`.

Each rendered occurrence has an `ReactPanelApi` with local event, keyboard,
selection, clipboard, and slash managers. Their constructors receive the shared
registrations and the occurrence dependencies they need. Document history and rendering definitions are shared; blocks and elements have
panel-bound managers that validate membership before invoking document mutations. Keyboard keymap overrides and
the unknown-renderer fallback remain explicit document-wide configuration.

Components receive this occurrence API through `useReactPanel()`. Event and
slash handlers receive it in their callback context. Shared managers never
substitute an active occurrence when executing clipboard or slash operations;
the receiving editor is explicit. Local cleanup does not destroy the runtime.

Registries with stable keys also expose explicit deletion:

```ts
reactEditor.blockTypes.delete("acme.card");
reactEditor.renderers.delete("persisted.unknown");
reactEditor.surfaces.delete("edgeless");
reactEditor.slashCommands.delete("acme.command");
reactEditor.keyboard.delete("acme.shortcut");
reactEditor.events.delete("acme.pointer");
```

Each returns `true` only when it removed a React-owned registration. Mounted
components and ordered wrappers use their returned disposers because duplicate
component registrations are valid.

## Manager map

| Property           | Owns                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------- |
| `blocks`           | Guarded mutations and delegated core block operations                                   |
| `blockTypes`       | Atomic core definition + renderer/behavior + optional slash conversion                  |
| `blockListProps`   | React lifecycle adapter for the core list-property policy registry                      |
| `renderers`        | Renderer lookup, duplicate checks, and unknown fallback                                 |
| `mode`             | Core editor presentation state: `get`, `set`, and `subscribe`; never persisted          |
| `surfaces`         | One root per mode plus ordered block/editor wrappers                                    |
| `extensions`       | Extension setup/rollback, reverse cleanup, and mounted visual UI                        |
| `events`           | Delegated event registrations, filtering, and dispatch                                  |
| `panels`           | Mounted roots, explicit active/default lookup, and pointer ownership                    |
| `clipboardFormats` | Portable formatters and parsers                                                         |
| `pasteStrategies`  | Shared ordered paste algorithms                                                         |
| `keyboard`         | Semantic bindings, shortcut matching, and dynamic keymaps                               |
| `selection`        | Shared portable document selection; DOM synchronization belongs to reactPanel.selection |
| `slashCommands`    | React-owned slash-command registry and lifecycle                                        |

`extensions.mount` has no mode argument. A mounted component is present beside
every surface. Its DOM/keyboard registrations declare `mode`, and any React
effect with surface-specific behavior checks `useContext(SurfaceContext)`.

`surfaces` owns wrappers because their composition is a property of rendering,
not extension lifecycle. The first registered block or editor wrapper is
outermost. Defensive read methods return new arrays.

`reactPanel.selection` adds DOM behavior to core selection state. `slashCommands` is owned
entirely by the React runtime.

Presentation registries publish focused revisions. Document, tree, mode,
selection, slash, renderer, surface, and extension consumers subscribe to their
own store rather than one editor-wide invalidation counter.

## Block registration

Normal custom blocks use one atomic call:

```tsx
const dispose = reactEditor.blockTypes.register({
  definition: cardDefinition,
  render: CardContent,
  slashCommand: {
    title: "Card",
    group: "Turn into",
  },
});
```

If any part conflicts, completed parts roll back in reverse order.
`renderers.register(type, Renderer)` is intentionally lower level: use it only
when the type definition is installed elsewhere or when rendering a losslessly
loaded persisted type.

## Destruction order

Extension custom cleanup runs before registrations created by that extension.
Manager-owned registrations then unwind in reverse order. The event manager
disconnects native listeners through DOMEventListeners after extension teardown.
ReactPanel cancels local DOM work and releases its local subscriptions on unmount;
the host retains and releases its storage acquisition separately.
the public ReactPanelApi has no destroy method and never destroys its core editor.

## Prioritized block behaviors

`blockListProps` owns property defaults and validation through the core manager.
The list extension installs separate checkbox, numbered-list, and ordinary-list
behaviors. Child visibility belongs to `CollapseBlockBehavior`; property validation
and interaction registration retain their own extension cleanup.

`blockBehaviors.register(behavior, priority = 0)` registers an instance with a
required `isAvailable(context)` predicate. Larger priorities run first; ties keep
registration order. Native behaviors use `0`, list/collapse use `-100`, and the
ordinary `DefaultBlockBehavior` registration uses `-1000`. These values are not
reserved. Omitted methods and `"unhandled"` continue the chain; `"handled"` and
`"rejected"` stop it. Inherited methods are invoked normally, without inspecting
method identities or inserting a special fallback. Each disposer removes its
exact registration. Type-indexed `get`, `has`, `delete`, and `fallback` are removed.

Availability always receives `BlockBehaviorAvailabilityContext { editor, block }`:
the runtime and current detached persisted block fields, without recursive children.
This context is identical for actions, split inheritance, visibility, and move
applicability. There is no union, kind, operation name, source/destination role,
pointer coordinate, or optional movement field. The called method already determines
its operation; method-specific eligibility belongs inside that method. Predicates
must be synchronous and must not mutate document state. Availability is reevaluated
from current input, never cached solely by native type. During movement, foreign
source fields are supplied directly with the destination runtime, even when their
IDs collide with local IDs; applicability never resolves source IDs locally.

Use `dispatch()` for actions and `resolveAll(context)` for applicable instances.
Native container behaviors implement their own applicability and specialize only
demonstrated differences; the container base no longer inherits generic outline
actions. Geometry is declared by Page layout primitives: `BlockChildren` supplies the child axis,
while `BlockDropTarget` supplies explicit destinations to the optional drag extension.
Universal handle presentation follows Page’s hovered-row marker, independently of
drag. `BlockChildren.hoverBoundary` declares whether a child layout bounds hover or
inherits its enclosing width; no per-type handle annotation is required.
React registration owns the complete core definition, including metadata, and
registers the supplied object directly without copying or merging annotation records.
An already registered native type is a conflict, including a definition created
directly in core or by another React runtime. Cleanup removes the owned definition
with its presentation, and rollback releases installed resources after setup failures.
`blockTypes.subscribe()` observes creation and removal of complete definitions;
metadata readers update through these same core lifecycle notifications. Subscriptions
disconnect automatically after registration teardown when the React runtime is destroyed.
No core registration API is added. Metadata does not enable an extension.
The former behavior `resolve(blockId)` metadata query is removed.

Outline dispatch first invokes the current parent's `onChildIndent` or
`onChildOutdent`, then the leading child's chain if every parent handler defers.
Both chains use stable priority ordering and the unchanged requested ID group.
`handled` and `rejected` stop dispatch. Enter and Backspace resolve fresh shallow
contexts and invoke this same entry point inside a panel batch. Parent restrictions belong to concrete container behaviors,
not geometry annotations or the generic container base. Standard indent/outdent
algorithms live directly in `DefaultBlockBehavior.onIndent` and `onOutdent`, with
private helpers for selected roots and shallow move permissions. Keyboard callers
prepare contexts and dispatch requests directly; headless test helpers live only
in `test-utils.ts`. Container child insertion belongs to
`ContainerBlockBehavior.appendWritingBlock`, while seeded slash conversion is
shared through `extensions/containers/convert-leaf-to-container.ts`. Core eligibility, tail-adoption preflight and handled no-ops
remain unchanged, without redispatch from the default implementation.

Structural deletion also uses `blockBehaviors.dispatch("onStructuralDelete", context, ids)`.
The registry visits the supplied IDs in order, skips missing blocks, and consults
each distinct matching behavior on its first selected block only. All handlers
receive the complete group. Handled/rejected claims the selection; universal
deferral leaves generic deletion with the selection extension. Batching and DOM
focus stay with that extension. Chain execution is a private registry method;
there is no separate `dispatchBlockAction` utility.

`canMove({ sources, destination })` accepts shallow moved-root fields and the core
`BlockDestination { parentId, beforeId? }`: omitted beforeId appends. It resolves
the destination parent once and rejects missing parents, invalid insertion neighbors,
and empty sources. Foreign snapshots are inspected directly even when their IDs
collide with local IDs. Every applicable `canMove` hook must permit the move;
priority orders checks but cannot override a false veto. The registry passes each
source and the receiving parent as candidates through the same availability predicate.
Candidates follow source order, then the parent; the first match selects the
registration. Behaviors without a canMove method are skipped before applicability.
Each registration matching at least one of those blocks calls its canMove method
once, even when several sources and the parent match. A root insertion has no
receiving block: source applicability still runs and the movement method receives
parent null, preserving source restrictions. `BlockMoveContext` is the movement
method's argument: sources, destination, editor, and the parent resolved once by
the registry. The public query accepts only its sources and destination. This query
neither mutates nor replaces core hierarchy validation. Drag feedback and commit,
keyboard block moves,
and Tab/Shift+Tab use it. Outdent preflights both the lifted roots and the later
siblings that core adopts into the final lifted root before mutating either.

Child visibility also requires every applicable predicate to permit the operation.
Split properties merge from low to high priority; later registrations win ties to
preserve list-property inheritance order. Ordinary list splits still override
writing-factory list properties with the original defaults. Action dispatch does
not open transactions; the calling interaction owns the batch.
