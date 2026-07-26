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
drag boundaries, canvas viewport state, and React subscriptions.

The host creates both runtimes. It destroys `ReactEditor` first and then the
core editor. Destroying the React runtime never destroys the document runtime.

## Extension flow

`createReactEditor` installs functional plugins in declaration order. A plugin
receives the complete public `ReactEditor`: `editor` exposes the core runtime,
`events` handles DOM listeners and keyboard bindings, and public methods
register surfaces, mounted UI, editor wrappers, and mode-specific block
wrappers. The underlying registries remain private. Owned registrations roll
back if setup fails and clean up in reverse order.

Those presentation methods also support dynamic registration after creation.
Their idempotent disposers remove the exact registration, while
`ReactEditor.destroy()` removes any registrations the host left active.

The event hierarchy is `EditorEvent → DOMEditorEvents →
KeyboardEditorEvents`. The React runtime owns only the final object. It follows
the active surface across root/document/window realms and resolves DOM markers
centrally. Keyboard plugins define semantic actions and conditions; the event
runtime alone parses keys and modifiers.

`ReactEditor.registerBlock` is the only React block-extension entry point. It
atomically connects one core `BlockDefinition`, one renderer, and an optional
slash conversion command. Persisted unknown types remain lossless.

## Rendering flow

`EditorView` subscribes to `ReactEditor`, provides the core and React runtimes
to hooks, selects the registered surface from `editor.mode`, composes editor wrappers,
mounts active plugin UI, and renders the surface. Surfaces traverse the same
document: Page respects collapse; Edgeless positions root subtrees by layout.

Surfaces render blocks through the generic `BlockWrapper` slot. They provide a
plain fallback and never import optional interaction plugins. For example,
`pageDragPlugin` contributes the DnD wrapper for both modes.
