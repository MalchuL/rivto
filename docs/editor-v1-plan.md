# Rivto Editor v1 Roadmap

## Status

- [x] Gate 1: persist this roadmap
- [x] Gate 2: reproducible installation and green baseline
- [x] Gate 3: minimal React editor demo
- [x] Gate 4.1: document model v2 behind CRDT abstraction
- [x] Gate 4.2: editor kernel and managers
- [ ] Gate 4.3: page editing engine
- [ ] Gate 4.4: default writing module
- [ ] Gate 4.5: edgeless mode
- [ ] Gate 4.6: runtime plugins
- [ ] Gate 4.7: collaboration and release hardening

Each gate starts only after the previous gate's acceptance checks pass.

## Repository assessment

Rivto currently provides a TypeScript CRDT and document-model library, not an
editor. The reusable foundation consists of Yjs-backed map, array, and text
wrappers; block and link CRUD; basic ordering; bundle serialization; provider
attachment; and tests for synchronization and nested plugin state.

The current `BlockCore` contains identity, numeric ordering, canvas geometry,
metadata, and plugin state. It does not model typed rich-text content, child
blocks, schemas, editor selection, commands, history, clipboard behavior,
rendering, or UI. The architecture diagram names most of those missing
subsystems but is aspirational.

Numeric `order` values are not a safe concurrent ordering primitive. Bundle
payloads are largely `any`, migrations are absent, and the existing generated
package is stale relative to source. The initial dependency links are also not
reproducible from this checkout.

Estimated readiness is roughly 10% of a usable custom editor. The CRDT layer is
useful groundwork, but browser editing behavior represents most of the work.

## Target architecture

The v1 product is a React editor library with one shared block document and two
views:

- Page mode renders a nested, ordered block tree.
- Edgeless mode renders those same blocks on a pan/zoom DOM plane.
- Content, hierarchy, links, and geometry are collaborative document state.
- Mode, viewport, focus, and selection are local editor state.

Document schema v2 uses ordered CRDT arrays for root and child block IDs, a
CRDT map for each block, and `CRDTText` for formatted inline content. The Yjs
adapter backs `CRDTText` with Y.Text without exposing it. Each block
contains `id`, `type`, validated `props`, optional inline content, child IDs,
plugin data, and optional canvas geometry. Links remain first-class records.
Normalization repairs duplicate references, missing parents, and invalid
concurrent moves without discarding block payloads.

All mutations pass through editor commands and atomic `CRDTDoc` transactions. A
normalized local selection maps `{ blockId, offset }` positions to DOM ranges.
`CRDTUndoManager` tracks only transactions originating from the local editor;
the Yjs adapter implements it with Y.UndoManager.

## Mandatory architecture decisions

Native CRDT implementations are adapter details. The dependency direction is:

```text
React EditorView
  -> replaceable Renderer and focused runtime managers
  -> EditorCore
  -> DocumentModelImpl
  -> CRDTDoc
  -> Yjs adapter
```

- Only `store/crdt-doc/yjs-doc/**` may import `yjs` or expose Yjs-specific
  classes. Editor, document, renderer, manager, plugin, and block code must use
  `CRDTDoc`, `CRDTMap`, `CRDTArray`, and `CRDTText` interfaces exclusively.
- `DocumentModelImpl` is the single source of truth for collaborative blocks,
  hierarchy, rich text, links, layout, plugin data, snapshots, and migrations.
  UI state such as selection, active mode, viewport, menus, and tools remains
  outside the document.
- `EditorCore` orchestrates a document and focused managers. Managers are added
  only for behavior with an independent lifecycle: selection, clipboard,
  providers, undo, plugins/blocks, and later theming.
- Rendering is a strategy boundary. `BlockDOMRenderer` and
  `EdgelessCanvasRenderer` consume editor/document interfaces and never CRDT
  internals. The edgeless renderer may combine a canvas/SVG decoration layer
  with DOM-hosted interactive blocks.
- Clipboard uses `application/x-rivto+json`, `text/html`, and `text/plain`.
  Structured paste has priority, generates new IDs, remaps child/link
  references, offsets edgeless positions, and inserts everything in one
  document transaction.
- V1 plugins are trusted local modules. They receive the public editor and
  document surfaces, never a native CRDT object.

These constraints supersede the earlier direct-Yjs editor prototype and the
integrated renderer described in older notes.

There is one extension mechanism. A `BlockSpec` describes a block's schema,
content mode, renderer, clipboard conversion, and optional slash items. A
`Plugin` contributes block specs, commands, shortcuts, input rules, slash
items, UI slots, state, and lifecycle hooks. A module is merely a distributable
bundle of plugins, not a second framework. Runtime plugins are trusted and
unsandboxed in v1.

## Public API target

```ts
const editor = createRivtoEditor(options);

<RivtoEditor editor={editor} />;
```

The editor exposes `document`, `selection`, and `mode`, plus commands for block
CRUD, movement, nesting, text formatting, selection, clipboard, history,
focus, and page/edgeless view control. Events cover document transactions,
selection, mode, focus, and provider status. Unknown block types retain their
data and render through a recoverable fallback.

## Delivery gates

### Gate 2: reproducible baseline

Standardize on pnpm with a committed lockfile, repair package exports, ship an
ESM-only v1 build, exclude tests from distribution, clean stale output before
building, align React peer/type versions, add ESLint, and remove unused
dependencies. A clean checkout must pass install, type-check, lint, all existing
tests, build, package creation, and a temporary-consumer import smoke test.

Completed baseline: frozen installation, type-check, lint, 167 tests, bundled
ESM build, tarball creation, and temporary-consumer import all pass.

### Gate 3: minimal demo

Add a Vite/React application under `demo/` that imports only Rivto's public
package API. It creates a Yjs document and document model, displays ordered
paragraph blocks, edits text through controlled textareas backed by block
metadata, adds/removes/moves blocks, persists/restores a bundle, and displays
the serialized bundle. This is intentionally a consumer smoke test and later
becomes the official playground.

### Gate 4.1: document model v2 — 4–6 weeks

Implement the ordered block tree, Y.Text rich content and marks, typed props,
geometry, versioned snapshots, deterministic normalization, and a v1-to-v2
migration preserving IDs, metadata, plugin state, links, and positions.

### Gate 4.2: editor kernel — 4–6 weeks

Implement transactions, commands, schema and plugin registries, normalized
selection, keyboard routing, local state, events, and local-only undo/redo.

Implemented vertical slice: schema-v2 nested Yjs blocks, attributed Y.Text,
Zod prop schemas, layout, v1 migration, normalization, commands, normalized
selection, clipboard helpers, events, local history, and runtime registration.

### Gate 4.3: page editing engine — 8–12 weeks

Implement React block rendering, contenteditable integration, DOM selection
mapping, `beforeinput`, IME composition, cross-block editing, clipboard,
drag/reorder, formatting toolbar, block side menu, and slash menu. Keyboard and
screen-reader operation are acceptance requirements.

### Gate 4.4: default writing module — 5–7 weeks

Ship paragraph, H1–H3, bulleted/numbered/check lists, quote, code, divider,
image, and file blocks; bold, italic, underline, strike, inline code, and links;
common input rules; lossless Rivto JSON; and clipboard-oriented HTML and plain
text conversion. Hosts provide file upload transport.

### Gate 4.5: edgeless mode — 5–7 weeks

Render the same React block specs on a transformed DOM plane, with SVG links.
Add pan/zoom, marquee and additive selection, movement, resize, z-order,
connectors, duplication, deletion, keyboard nudging, and deterministic initial
placement. Page order remains independent of canvas coordinates.

### Gate 4.6: runtime plugins — 3–5 weeks

Support trusted runtime registration and disposal, command collision
diagnostics, block specs, shortcuts, input rules, slash items, UI slots,
document/plugin state, lifecycle hooks, and unknown-block fallback behavior.

### Gate 4.7: collaboration and hardening — 5–7 weeks

Expose provider status and cleanup, synchronize content and geometry, and test
concurrent edits, block moves, reconnects, migrations, and local-only undo.
Add browser tests for Chromium, Firefox, and WebKit, accessibility checks, API
documentation, theming, migration guidance, package smoke tests, and semver
policy.

## Verification strategy

- Unit tests cover models, commands, migrations, schemas, normalization, and
  update-order permutations across multiple Yjs documents.
- Playwright covers native selection, IME, clipboard, keyboard behavior,
  drag/drop, slash menus, page/edgeless switching, and remote updates during
  editing in Chromium, Firefox, and WebKit.
- Switching page to edgeless and back must not change content or hierarchy.
- A clean checkout must install, test, lint, build, pack, and run the demo.
- Release checks include keyboard-only use, visible focus, labels, recoverable
  invalid data, and no uncaught browser mutation errors.

## Migration strategy

Bundle versions are explicit. Loading v1 sorts blocks by numeric order and
creates the v2 root ID array, maps existing fields into typed props and layout,
preserves links/plugin payloads, and retains unknown types. Migration produces
a new snapshot inside one transaction and never mutates the input bundle.
Future migrations are sequential and tested with committed fixtures.

## Scope and estimates

The custom DOM-engine v1 is estimated at 34–50 engineer-weeks: approximately
8–12 months for one experienced editor engineer or 5–7 months for two. Full
BlockNote parity is a later program rather than a v1 acceptance condition.

V1 targets current desktop Chrome, Edge, Firefox, and Safari. Collaboration
synchronizes content and geometry but excludes presence, remote cursors,
comments, and permissions. Mobile editing, sandboxed remote plugins, tables,
audio/video, embeds, AI, PDF/Word export, and complete BlockNote parity are
deferred.
