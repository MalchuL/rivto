# React editor managers

`ReactEditor` is a coordinator, not a registry. Plugins receive the complete
runtime and extend it through focused public managers:

```ts
const plugin: ReactEditorPlugin = {
  id: "acme.cards",
  setup(reactEditor) {
    reactEditor.surfaces.registerBlockWrapper("block", CardControls);
    reactEditor.events.bind(/* semantic shortcut */, /* action */);
    reactEditor.plugins.mount(CardOverlay);
  },
};
```

Mutable maps and arrays remain private. Every registration validates that the
runtime is active, preserves declaration order, returns an idempotent disposer,
and is automatically released by `ReactEditor.destroy()`.

Every manager constructor receives its owning `ReactEditor`. Managers resolve
the core editor, active root, registration ownership, and sibling managers from
that owner when an operation runs. Constructors only retain the owner; they do
not read sibling fields while `ReactEditor` is still being initialized.
Keyboard keymap overrides and the unknown-renderer fallback remain explicit
second constructor arguments because they are manager-specific configuration.

Manager classes remain exported as public types, but applications should use
the instances exposed by `ReactEditor` rather than construct detached manager
graphs. This is an owner-based service design, not a strategy registry or DI
container.

Registries with stable keys also expose explicit deletion:

```ts
reactEditor.blocks.delete("acme.card");
reactEditor.renderers.delete("persisted.unknown");
reactEditor.surfaces.delete("edgeless");
reactEditor.slashCommands.delete("acme.command");
reactEditor.events.delete("acme.shortcut");
```

Each returns `true` only when it removed a React-owned registration. DOM event
listeners, mounted components, and ordered wrappers intentionally use their
returned disposers: duplicate registrations are valid, so deleting by function
or component identity would be ambiguous.

## Manager map

| Property | Owns |
| --- | --- |
| `blocks` | Atomic core definition + renderer + optional slash conversion |
| `renderers` | Renderer lookup, duplicate checks, and unknown fallback |
| `surfaces` | One root per mode plus ordered block/editor wrappers |
| `plugins` | Plugin setup/rollback, reverse cleanup, and globally mounted UI |
| `events` | Root/document/window DOM events and semantic keyboard bindings |
| `selection` | Core selection delegation and active-root DOM synchronization |
| `slashCommands` | Lifecycle-aware delegation to the core slash registry |

`plugins.mount` has no mode argument. A mounted component is present beside
every surface. Its DOM/keyboard registrations declare `mode`, and any React
effect with surface-specific behavior checks `useEditorMode()`.

`surfaces` owns wrappers because their composition is a property of rendering,
not plugin lifecycle. The first registered block or editor wrapper is
outermost. Defensive read methods return new arrays.

`selection` and `slashCommands` never copy core state. They add React ownership
or DOM behavior to the existing core managers.

Presentation managers call the owner’s internal `invalidate()` hook after
visible registry changes. Plugins should never call this hook directly; normal
manager operations and core commands publish their own revisions.

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

Plugin custom cleanup runs before registrations created by that plugin.
Manager-owned registrations then unwind in reverse order. The event manager
disconnects native listeners after plugin teardown. Destroying `ReactEditor`
does not destroy its core editor.
