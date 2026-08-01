# React editor managers

`ReactEditor` is a coordinator, not a registry. Extensions receive the complete
runtime and extend it through focused public managers:

```ts
const extension: ReactEditorExtension = {
  id: "acme.cards",
  setup(reactEditor) {
    reactEditor.surfaces.registerBlockWrapper("block", CardControls);
    reactEditor.events.register(/* DOM or keyboard definition */, /* action */);
    reactEditor.extensions.mount(CardOverlay);
  },
};
```

Mutable maps and arrays remain private. Every registration validates that the
runtime is active, preserves declaration order, returns an idempotent disposer,
and is automatically released by `ReactEditor.destroy()`.

Every manager constructor receives its owning `ReactEditor`. Managers resolve
the core editor, active surface, registration ownership, and siblings from
that owner when an operation runs. Keyboard keymap overrides and the
unknown-renderer fallback remain explicit configuration.

Applications use the capability interfaces exposed by `ReactEditor`. Concrete
manager classes and lifecycle bookkeeping stay internal to the package.

Registries with stable keys also expose explicit deletion:

```ts
reactEditor.blocks.delete("acme.card");
reactEditor.renderers.delete("persisted.unknown");
reactEditor.surfaces.delete("edgeless");
reactEditor.slashCommands.delete("acme.command");
reactEditor.events.delete("acme.shortcut");
reactEditor.events.delete("acme.pointer");
```

Each returns `true` only when it removed a React-owned registration. Mounted
components and ordered wrappers use their returned disposers because duplicate
component registrations are valid.

## Manager map

| Property | Owns |
| --- | --- |
| `blocks` | Atomic core definition + renderer + optional slash conversion |
| `renderers` | Renderer lookup, duplicate checks, and unknown fallback |
| `surfaces` | One root per mode plus ordered block/editor wrappers |
| `extensions` | Extension setup/rollback, reverse cleanup, and mounted visual UI |
| `events` | Surface ownership plus DOM and keyboard event registrations |
| `selection` | Core selection delegation and active-root DOM synchronization |
| `slashCommands` | Lifecycle-aware delegation to the core slash registry |

`extensions.mount` has no mode argument. A mounted component is present beside
every surface. Its DOM/keyboard registrations declare `mode`, and any React
effect with surface-specific behavior checks `useEditorMode()`.

`surfaces` owns wrappers because their composition is a property of rendering,
not extension lifecycle. The first registered block or editor wrapper is
outermost. Defensive read methods return new arrays.

`selection` and `slashCommands` never copy core state. They add React ownership
or DOM behavior to the existing core managers.

Presentation registries publish focused revisions. Document, tree, mode,
selection, slash, renderer, surface, and extension consumers subscribe to their
own store rather than one editor-wide invalidation counter.

## Block registration

Normal custom blocks use one atomic call:

```tsx
const dispose = reactEditor.blocks.register({
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
disconnects native listeners after extension teardown. Destroying `ReactEditor`
does not destroy its core editor.
