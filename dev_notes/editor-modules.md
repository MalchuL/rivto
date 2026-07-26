# Rivto module reference

## `@chulane/rivto`

- `src/blocks` — framework-neutral block definitions, validation, reserved
  properties, and the default paragraph type.
- `src/editor` — public runtime, commands, clipboard transformations, selection
  reconciliation, and snapshots.
- `src/managers` — commands, mode, selection, slash commands, and undo history.
- `src/store/document-model` — canonical block/link document operations.
- `src/store/crdt-doc` — adapter-neutral CRDT contracts and the Yjs adapter.

The core exports data and behavior only. It has no renderer registry and no
React dependency.

## `@chulane/rivto-react`

- `react-editor.tsx` — React runtime, functional plugin lifecycle, surfaces,
  renderers, editor wrappers, and atomic block registration.
- `events` — the inherited `EditorEvent → DOMEditorEvents →
  KeyboardEditorEvents` runtime, keymap, and event-specific utilities.
- `editor-view.tsx` / `hooks` / `blocks` — React context, subscriptions,
  `BlockView`, the plugin-resolved `BlockWrapper`, editing hooks, DOM selection
  conversion, and Markdown.
- `surfaces` — package-owned Page and Edgeless renderers.
- `plugin-factories.tsx` — public semantic plugin factories.
- `plugins` — internal implementations behind those factories.
- `styles.css` — functional layout and interaction styles with application
  variables and overrides.

## Demo

`demo` is a consumer, not a second editor implementation. It owns initial
content, the mode toolbar, theme overrides, and the Slider/Counter examples.
Each example registers its definition, renderer, and slash conversion through
one `ReactEditor.registerBlock` call.
