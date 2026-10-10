# React editor managers

`EditorRuntime` owns shared document infrastructure. Extensions receive this
runtime and extend it through focused registration managers:

```ts
const extension: ReactEditorExtension = {
  id: "acme.cards",
  setup(editorRuntime) {
    editorRuntime.surfaces.registerBlockWrapper("block", CardControls);
    editorRuntime.events.register(/* DOM definition */, /* action */);
    editorRuntime.keyboard.register(/* keyboard definition */, /* action */);
    editorRuntime.extensions.mount(CardOverlay);
  },
};
```

Mutable maps and arrays remain private. Every registration validates that the
runtime is active, preserves declaration order, returns an idempotent disposer,
and is automatically released by `EditorRuntime.destroy()`.

Each rendered occurrence has an `EditorViewApi` with local event, keyboard,
selection, clipboard, and slash managers. Their constructors receive the shared
registrations and the occurrence dependencies they need. Core blocks, history,
and rendering definitions are reused directly. Keyboard keymap overrides and
the unknown-renderer fallback remain explicit document-wide configuration.

Components receive this occurrence API through `useEditorView()`. Event and
slash handlers receive it in their callback context. Shared managers never
substitute an active occurrence when executing clipboard or slash operations;
the receiving editor is explicit. Local cleanup does not destroy the runtime.

Registries with stable keys also expose explicit deletion:

```ts
editorRuntime.blockTypes.delete("acme.card");
editorRuntime.renderers.delete("persisted.unknown");
editorRuntime.surfaces.delete("edgeless");
editorRuntime.slashCommands.delete("acme.command");
editorRuntime.keyboard.delete("acme.shortcut");
editorRuntime.events.delete("acme.pointer");
```

Each returns `true` only when it removed a React-owned registration. Mounted
components and ordered wrappers use their returned disposers because duplicate
component registrations are valid.

## Manager map

| Property | Owns |
| --- | --- |
| `blocks` | Guarded mutations and delegated core block operations |
| `blockTypes` | Atomic core definition + renderer/behavior + optional slash conversion |
| `blockListProps` | React lifecycle adapter for the core list-property policy registry |
| `renderers` | Renderer lookup, duplicate checks, and unknown fallback |
| `mode` | Core editor presentation state: `get`, `set`, and `subscribe`; never persisted |
| `surfaces` | One root per mode plus ordered block/editor wrappers |
| `extensions` | Extension setup/rollback, reverse cleanup, and mounted visual UI |
| `events` | Delegated event registrations, filtering, and dispatch |
| `editorViews` | Mounted roots, explicit active/default lookup, and pointer ownership |
| `clipboardFormats` | Portable formatters and parsers |
| `pasteStrategies` | Shared ordered paste algorithms |
| `keyboard` | Semantic bindings, shortcut matching, and dynamic keymaps |
| `selection` | Shared portable document selection; DOM synchronization belongs to editorView.selection |
| `slashCommands` | React-owned slash-command registry and lifecycle |

`extensions.mount` has no mode argument. A mounted component is present beside
every surface. Its DOM/keyboard registrations declare `mode`, and any React
effect with surface-specific behavior checks `useContext(SurfaceContext)`.

`surfaces` owns wrappers because their composition is a property of rendering,
not extension lifecycle. The first registered block or editor wrapper is
outermost. Defensive read methods return new arrays.

`editorView.selection` adds DOM behavior to core selection state. `slashCommands` is owned
entirely by the React runtime.

Presentation registries publish focused revisions. Document, tree, mode,
selection, slash, renderer, surface, and extension consumers subscribe to their
own store rather than one editor-wide invalidation counter.

## Block registration

Normal custom blocks use one atomic call:

```tsx
const dispose = editorRuntime.blockTypes.register({
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
EditorViewController cancels local DOM work and releases its acquisition on unmount;
the public EditorViewApi has no destroy method and never destroys its core editor.
