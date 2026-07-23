# Rivto editor architecture

## Dependency direction

```text
demo / host application
  → @chulane/rivto-react
    → @chulane/rivto
      → DocumentModelImpl
        → CRDTDoc
          → Yjs adapter
```

The core package never imports React or renderer code. The React package may
read detached editor values and execute editor commands, but it never reads
native Yjs containers.

## Ownership

`@chulane/rivto` owns collaborative blocks, hierarchy, text, props, layouts,
plugin data, links, snapshots, commands, and undo history. It also owns local
mode and structured selection because those are meaningful to any view bridge.

`@chulane/rivto-react` owns DOM roots, renderers, page/edgeless presentation,
native selection synchronization, delegated events, key bindings, overlays,
drag providers, canvas viewport state, and React subscriptions.

The host creates both runtimes. It destroys `ReactEditor` first and then the
core editor. Destroying the React runtime never destroys the document runtime.

## Extension flow

`createReactEditor` installs functional plugins in declaration order. A plugin
receives scoped events, key bindings, surface registration, mounted UI, and
provider contributions. All owned registrations roll back if setup fails and
clean up in reverse order.

`ReactEditor.registerBlock` is the only React block-extension entry point. It
atomically connects one core `BlockDefinition`, one renderer, and an optional
slash conversion command. Persisted unknown types remain lossless.

## Rendering flow

`EditorView` subscribes to `ReactEditor`, provides the core and React runtimes
to hooks, selects the registered surface from `editor.mode`, composes providers,
mounts active plugin UI, and renders the surface. Surfaces traverse the same
document: Page respects collapse; Edgeless positions root subtrees by layout.
