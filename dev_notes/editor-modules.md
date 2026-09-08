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

- `react-editor.tsx` — small coordinator that constructs public managers and
  forwards revisions. Every manager receives this complete owner and lazily
  resolves core or sibling capabilities through it.
- `managers/blocks` — atomic block registration and renderer lookup.
- `managers/events` — separate DOM transport and semantic keyboard managers,
  plus keymap and event-specific utilities.
- `managers/plugins` — plugin setup, rollback, cleanup, and mounted UI.
- `managers/surfaces` — surfaces plus ordered block/editor wrappers.
- `managers/selection` / `managers/slash` — React-aware delegates over the
  corresponding core managers.
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
one `reactEditor.blocks.register` call.
