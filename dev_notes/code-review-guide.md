# How to review the Rivto editor code

This is a reading guide for the editor implementation, demo, packaging, and
tests. It intentionally treats `src/store/document-model/**` and
`src/store/crdt-doc/**` as existing lower-level dependencies. Read their public
types when a call needs clarification, but do not start the editor review there.

The most useful review question is not “does each function work by itself?” It
is: “does every feature preserve the boundary below?”

```text
React and host application
  → RivtoEditorCore
    → BlockRegistry and focused managers
      → DocumentModelImpl
        → CRDTDoc
```

Views may know the editor, but they must not know CRDT containers or Yjs.
Managers may coordinate document operations, but they must not render DOM.
Collaborative state belongs to the document; selection, focus, mode, menus, and
zoom remain local.

## Recommended reading order

```text
0. Product and architecture intent
├─ docs/base_ideas.md
├─ docs/editor-v1-plan.md
├─ dev_notes/editor-architecture.md
├─ dev_notes/editor-modules.md
├─ dev_notes/react-strict-mode-editor-lifecycle.md
└─ dev_notes/ai-document-editing.md

1. Consumer entry point
└─ demo/src/App.tsx
   ├─ initialContent
   ├─ calloutDefinition
   ├─ demoPlugin
   ├─ DemoPageRenderer / DemoCanvasRenderer
   └─ App

2. Public package surface
├─ src/index.ts
├─ src/version.ts
└─ src/editor/
   ├─ index.ts
   ├─ editor/index.ts
   ├─ editor/types.ts
   └─ editor/rivto-editor.ts

3. Block extension system
└─ src/editor/blocks/
   ├─ block-definition.ts
   ├─ block-registry.ts
   ├─ default-writing.ts
   └─ index.ts

4. Small managers
└─ src/editor/managers/
   ├─ selection-manager.ts
   ├─ plugin-manager.ts
   ├─ undo-manager.ts
   ├─ provider-manager.ts
   └─ index.ts

5. Clipboard feature
└─ src/editor/managers/
   ├─ clipboard-bundle.ts
   │  ├─ normalizeSelection
   │  ├─ createClipboardPayload
   │  └─ remapClipboardBundle
   └─ clipboard-manager.ts
      ├─ pasteBundle
      ├─ pastePlain
      ├─ replaceRange
      └─ removeRangeTail

6. React boundary and selection
└─ src/editor/react/
   ├─ types.ts
   ├─ rivto-editor.tsx
   ├─ selection.ts
   │  ├─ readDOMSelectionPoint
   │  ├─ readEditorSelection
   │  ├─ restoreEditorSelection
   │  └─ updateCrossBlockHighlight
   ├─ renderers.tsx
   │  ├─ EditableText
   │  ├─ BlockContent
   │  ├─ BlockView
   │  ├─ BlockDOMRenderer
   │  └─ EdgelessCanvasRenderer
   ├─ markdown.ts
   ├─ styles.ts
   └─ index.ts

7. Consumer support files
└─ demo/
   ├─ src/main.tsx
   ├─ src/styles.css
   ├─ index.html
   ├─ package.json
   ├─ tsconfig.json
   └─ README.md

8. Verification
├─ src/editor/__tests__/editor.test.ts
├─ e2e/editor.spec.ts
├─ playwright.config.ts
├─ scripts/run-test.sh
├─ package scripts and compiler/lint configuration
└─ README.md / architecture.puml
```

Read the implementation before the roadmap. `docs/editor-v1-plan.md` describes
both implemented and future work, so it is useful for identifying omissions but
not as proof that a feature already exists.

## 1. Begin with the demo

Start at `demo/src/App.tsx`. It is the shortest complete example of how a real
consumer constructs and owns Rivto.

Follow this sequence inside `App`:

1. A `YjsDoc` adapter is created by the host.
2. `createRivtoEditor({ document: doc })` creates the editor and document model.
3. `defineBlock(calloutDefinition)` registers a custom presentation.
4. `use(demoPlugin)` installs a named command.
5. A schema-v3 snapshot is restored or initial typed blocks are inserted.
6. `useSyncExternalStore` subscribes to the editor's document revision.
7. Changes are persisted to local storage.
8. React cleanup destroys both editor and host-owned document.

Pay particular attention to ownership. `App` creates the document and editor,
so it destroys both. Review this together with
`dev_notes/react-strict-mode-editor-lifecycle.md`: creating or destroying these
objects in an ordinary effect would be unsafe under React development effect
replay.

The callout and renderer wrappers are deliberate extension examples. Confirm
that they import only the package root and never a private `src/**` path. Also
confirm that page and edgeless wrappers receive the same `EditorRendererProps`
and do not create independent documents.

## 2. Establish the public contract

Read `src/index.ts`, then the small barrel files under `src/editor/**/index.ts`.
They define what consumers can depend on. Check that intended types and
functions are exported exactly once conceptually and that removed legacy APIs
such as `BlockSpec`, `registerPlugin`, and `getBlockSpec` have not returned.

Next read `src/editor/editor/types.ts` in full. Important contracts are:

- `EditorPosition.offset` is a UTF-16 offset, matching DOM Range APIs.
- `EditorSelection` is directed: anchor and head must not be automatically
  sorted because reverse gestures need their direction.
- `CreateRivtoEditorOptions.document` accepts `CRDTDoc`, not native Yjs and not
  a renderer.
- `RivtoEditorApi` is the surface plugins receive.
- `EditorMode` is local view state, not collaborative document state.

Review `src/version.ts` with `package.json`. They are manually synchronized.
At the time this guide was written, `package.json` says `0.3.0` while
`RIVTO_VERSION` says `0.4.0`; decide which release value is intended before the
next package build.

## 3. Review `RivtoEditorCore` as the central coordinator

Read `src/editor/editor/rivto-editor.ts` from top to bottom. This class should
coordinate existing responsibilities rather than implement browser behavior or
CRDT storage.

### Constructor

The constructor establishes almost every ownership relationship. Verify its
order carefully:

```text
DocumentModelImpl
  → clipboard/provider/undo managers
  → plugin manager
  → props validator connected to BlockRegistry
  → default block definitions
  → configured plugins
  → optional initial content
  → document and selection subscriptions
```

Questions worth asking:

- Should initialization mutations emit editor revisions, or is subscribing only
  after initialization intentional?
- Are block definitions installed before every editor-level insertion?
- Does the undo manager track only `documentModel.origin`?
- Does every owned subscription have a matching cleanup in `destroy()`?

### Command methods

Most methods are intentionally thin delegates. Focus review time on the methods
that add editor semantics:

- `insertBlock()` applies `BlockRegistry.prepare()` before storage insertion.
- `removeBlock()` additionally clears selection when an endpoint disappeared.
- `formatText()` calculates Markdown wrappers and inserts them atomically.
- `setSelection()` validates block existence and UTF-16 boundaries before the
  document-free `SelectionManager` stores the value.
- `loadSnapshot()` clears undo history because old operations refer to replaced
  state.
- `defineBlock()` wraps registry cleanup, tracks ownership, and invalidates
  views.
- `focus()` crosses into the DOM and therefore deserves scrutiny with multiple
  editor instances; its unscoped fallback query currently selects the first
  matching editor in the document.
- `changed()` and `emit()` form the external-store notification path used by
  React.
- `destroy()` must be idempotent enough for the documented host lifecycle and
  must not leave plugin, history, or listener resources alive.

An update made through `editor.documentModel` still reaches `changed()` through
the document subscription and refreshes React. It can, however, bypass
editor-only behavior such as selection cleanup and registry defaults. Keep that
distinction in mind when reviewing future AI editing; see
`dev_notes/ai-document-editing.md`.

## 4. Review block definitions and registration

Read `block-definition.ts` before `block-registry.ts`.

`BlockDefinition` owns runtime meaning and presentation, while a stored block
owns data. Check these invariants:

- `type` is the stable persisted native type.
- `content` states whether Rivto supplies inline editing or no text editor.
- `defaultProps` apply only during editor-level creation.
- `propSchema` validates the complete property object.
- `render` receives detached block data, public editor commands, and default
  content; it receives no CRDT objects.
- Slash definitions become normal `SlashItem` values through the registry.

In `BlockRegistry`, inspect `register()`, `prepare()`, `validate()`, and
`getSlashItems()`:

- Registration rejects empty and duplicate types and returns an idempotent
  disposer tied to the exact registered object.
- `prepare()` rejects unknown types, merges defaults without mutating caller
  data, then validates.
- `validate()` deliberately passes unknown stored types through so documents
  remain lossless when a plugin is absent.
- No paragraph fallback should appear in storage or registry code.

Read `default-writing.ts` last. Built-ins use the same definitions as plugins,
which is good. Notice, however, that several built-in presentations are still
special-cased later in `BlockContent` (`divider`, `image`, `file`, and list
prefixes). Decide whether that is acceptable for the current vertical slice or
whether those presentations should eventually move into definitions.

## 5. Review the focused managers

### `SelectionManager`

This should remain the easiest manager in the project. Review only four
behaviors:

- `get()` returns a copy.
- `set()` stores a copy and preserves direction.
- `clear()` notifies only when state changed.
- `subscribe()` returns cleanup.

It intentionally cannot validate positions because it has no document
dependency. Validation belongs to `RivtoEditorCore.setSelection()`. Selection is
local and must never be serialized into a snapshot or synchronized through the
provider.

One design choice to review is that `set()` notifies even when the next value is
identical. This is simple and safe, but pointer movement can cause redundant
React work.

### `PluginManager`

Focus on `use()` and `unuse()`:

- Plugin IDs and command names are unique.
- Installation is rollback-safe when a later block, command, or setup step
  throws.
- Every registered block and command is attributed to a plugin owner.
- Setup cleanup runs exactly once.
- Disposal order is the reverse of registration where appropriate.
- Plugins receive the public editor API, not `RivtoEditorCore` internals or Yjs.

`getEditor` is lazy because `RivtoEditorCore` constructs the manager before its
own constructor is complete. Check that plugin setup is not called before the
editor is usable.

### `UndoManager`

The key line is its constructor. It passes the document's scopes and only the
current model's `origin` to adapter-neutral history. This is why another model
over the same CRDT can update the view without being treated as this editor's
local undo operation.

Review `stopCapturing()` when adding compound commands. Being inside one CRDT
transaction and being grouped as one user-facing undo step are related but not
identical concerns.

### `ProviderManager`

This is intentionally a two-method adapter-neutral coordinator. Confirm that it
delegates through `document.crdt` and exposes neither the native provider
document nor Yjs. Provider status, reconnect state, and presence are not hidden
here; they are simply not implemented yet.

## 6. Spend extra time on clipboard code

Clipboard is the most substantial non-React feature. Review its pure data
helpers before its coordinator.

### `clipboard-bundle.ts`

Follow one reversed, cross-block selection through these functions:

```text
normalizeSelection
  → copySelectedSubtrees
  → boundary trimming in createClipboardPayload
  → JSON + HTML + plain text from the same slice
  → remapClipboardBundle before insertion
```

Pay close attention to:

- `flattenBlocks()` defines visible order as depth-first traversal.
- `normalizeSelection()` sorts endpoints for mutation while leaving the
  original manager value directed.
- `copySelectedSubtrees()` avoids including a selected descendant twice when
  its selected ancestor already owns it.
- Only first and last block content is trimmed. Descendant trees remain atomic.
- Links are copied only when both endpoints survive the selected slice.
- Every inserted block and link receives a fresh ID.
- Mapping the first copied root to an existing target ID preserves links during
  cursor-aware paste.
- Layout positions are offset without mutating clipboard input.

Boundary offsets, nested blocks, and link remapping are the highest-risk logic.
Check empty content, a single-block reversed range, parent-to-child selection,
and selection ending at offset zero.

### `ClipboardManager`

First review the browser edges: `copy()`, `paste()`, `handleCopyEvent()`, and
`handlePasteEvent()`. Structured Rivto JSON must win over HTML, which must win
over plain text. Native event handlers are synchronous because browser
clipboard events expose their data only during dispatch.

Then study `pasteBundle()` using this example:

```text
target:  Hello |world
copied:  First
         Second

result:  Hello First
         Second|world
```

The target retains its type, props, plugin data, layout, and ID. The first
copied block contributes content and children. Remaining roots keep their own
types and metadata. The old suffix moves to the final pasted block. Internal
links use the remapped IDs. All document changes occur in one outer transaction.

Review these edge decisions carefully:

- With no selection, all copied roots are inserted; none is consumed.
- With one copied root, prefix, copied content, and suffix stay in the target.
- `removeRangeTail()` removes later selected blocks through normal model rules,
  so subtree/link cleanup is not duplicated in clipboard code.
- Multiline plain text stays within one block rather than becoming block types
  guessed by the clipboard manager.
- `collapse()` stores the caret immediately after inserted content but before a
  preserved suffix.
- Structured JSON parsing currently assumes valid JSON once the custom MIME is
  present; malformed external payload handling deserves review at this trust
  boundary.
- `htmlToText()` is intentionally lossy and does not yet perform semantic
  HTML-to-block conversion.
- Direct document insertion does not apply `BlockRegistry` defaults. Verify
  whether pasted complete structured data makes that the intended behavior.

## 7. Review the React boundary in dependency order

### `react/types.ts`

Confirm both renderer strategies receive the same detached root blocks and
editor instance. `defaultBlockType` is explicit because generic UI actions must
not invent a storage fallback. Slash state, selected canvas block, and zoom are
local presentation state.

### `rivto-editor.tsx`

This component is the bridge between editor events and browser events:

- `useSyncExternalStore` observes document revision, mode, and selection.
- The document subscription causes model-only and remote updates to render.
- `selectionchange` maps the native browser selection into editor coordinates.
- `useLayoutEffect` restores selection after DOM reconciliation and adds the
  supplemental cross-block highlight.
- Copy and paste events are forwarded to `ClipboardManager`.
- Paste re-reads the native selection synchronously because the browser may not
  have emitted `selectionchange` yet.
- Toolbar operations use editor commands and local mode state.
- Generic add-block behavior always receives `defaultBlockType`.

The `data-rivto-pointer-selecting` guard is subtle. During an upward drag,
Chromium reports intermediate selection state confined to one contenteditable.
Accepting that event would overwrite the correct portable cross-block
selection maintained by `BlockDOMRenderer`.

### `selection.ts`

This file deserves the same review depth as clipboard code. It translates among
three coordinate systems:

```text
pointer x/y ↔ DOM node/offset ↔ block ID/UTF-16 offset
```

Review in this order:

1. `readDOMSelectionPoint()` uses the Firefox and Chromium caret hit-test APIs,
   then `nearestTextPoint()` as a per-block fallback.
2. `readPosition()` converts a DOM endpoint into portable block coordinates.
3. `readEditorSelection()` preserves browser anchor/focus direction.
4. `pointAtOffset()` and `contentForBlock()` resolve portable positions back to
   live DOM.
5. `restoreEditorSelection()` avoids stealing focus after toolbar interaction.
6. `updateCrossBlockHighlight()` paints ranges browsers omit across separate
   contenteditables.

Important risks:

- DOM `Range` offsets and string offsets must agree for text, `<br>`, and
  formatted preview nodes.
- `setNativeSelection()` currently installs an ordered `Range`; restoration may
  not preserve the native direction of a reversed selection even though editor
  state does.
- The CSS Highlight name `rivto-cross-selection` is global. Multiple Rivto
  editor instances can currently clear or replace one another's supplemental
  highlight.
- The fallback scans every character in one content block and measures a Range
  for each offset. That is acceptable for short blocks but should be profiled
  before supporting very large code blocks.
- Selection restoration must not focus an old editable after the user moved to
  a toolbar or another application control.

### `renderers.tsx`

Read the private components before the exported strategies.

`EditableText` has a deliberate two-mode DOM policy:

- While unfocused, it displays escaped lightweight Markdown HTML.
- On focus, it displays exact Markdown source for editing.
- Native typing changes DOM first, so React does not rewrite identical focused
  text and destroy the caret.
- Programmatic paste or remote updates change the document first, so a focused
  DOM mismatch is rewritten immediately.

Check newline behavior (`innerText`, trailing newline removal, `<br>`, and
`textContent`) and IME/composition behavior. The current vertical slice does not
yet have a complete `beforeinput` or composition engine.

In `BlockContent`, verify unknown types remain visible and lossless, custom
renderers wrap the default content, and media inputs call granular prop
commands. Note the built-in type special cases mentioned earlier.

In `SlashMenu`, review replacement ordering and focus: the new typed block is
inserted, the slash-trigger block is removed, then focus is requested. A slash
item with `run` owns its own mutation behavior.

In `BlockView`, separate page and canvas concerns:

- Page mode owns side controls, hierarchy, HTML drag/drop ordering, and nested
  rendering.
- Canvas mode owns absolute layout, pointer movement, resize, selection, and
  keyboard nudging.
- Both use `BlockContent` and `BlockRegistry`, which prevents page/edgeless type
  disagreement.

Check pointer listener cleanup if a component unmounts during drag. Canvas link
lookup and rendering currently consider root blocks only, as does canvas block
rendering; nested-block canvas semantics are not finished.

Finally inspect `BlockDOMRenderer`. Its pointer bridge exists because native
selection across separate contenteditable hosts is inconsistent. The stable
portable anchor is captured during pointer-down, live head positions are
resolved during capture-phase pointer movement, portable selection and CSS
highlight are updated before mouse-up, and the native range is restored after
the gesture. Test both drag directions whenever this code changes.

### `markdown.ts` and `styles.ts`

`markdownHtml()` is a small escaped preview, not a Markdown standard
implementation. Confirm escaping happens before tag substitution and link URLs
remain restricted to accepted schemes. Do not extend the regular expressions
incrementally into a full parser; replace the helper when full Markdown is a
real requirement.

In `styles.ts`, focus on interaction rules rather than color choices:

- Block controls and prefixes use `user-select: none` so cross-block text
  selection does not include button glyphs.
- CSS Highlight and fallback data-attribute styles must look equivalent.
- Canvas blocks establish positioning, overflow, selection outline, drag, and
  resize hit targets.
- Toolbar and slash menu z-indexes must remain above editor blocks.

## 8. Review the demo support files

- `demo/src/main.tsx` should only mount `App` and fail clearly without `#root`.
- `demo/src/styles.css` is playground styling, not library behavior. Ensure it
  does not accidentally supply a rule required by `RivtoEditor` itself.
- `demo/index.html` provides the Vite shell.
- `demo/package.json` must consume `@chulane/rivto` through `workspace:*`.
- `demo/tsconfig.json` checks the demo as an independent strict consumer.
- `demo/README.md` documents root commands and correctly distinguishes the
  standard Chromium/Firefox suite from optional WebKit system requirements.

The demo is a consumer smoke test. Any import from `../src` or reliance on an
unexported type is an architectural regression.

## 9. Use tests as executable reading examples

Read `src/editor/__tests__/editor.test.ts` after the implementation, not before.
Its cases demonstrate:

- typed hierarchy, geometry, Markdown, snapshots, and undo;
- block definition defaults, validation, duplicate rejection, and disposal;
- plugin command ownership and disposal;
- collapsed, reversed, and cross-block selection values;
- same-block and cross-block clipboard boundaries;
- cursor-aware structured paste, children, metadata, geometry, and links;
- partial cut and multiline plain-text paste;
- unknown stored type preservation;
- CRDT convergence through editor commands.

For every unit test, ask whether the assertion proves behavior or merely
repeats implementation details. Clipboard tests should assert complete boundary
content and metadata, not only block counts.

Then read `e2e/editor.spec.ts`. These tests cover behavior that Node/Jest cannot
prove:

- contenteditable input and persistence;
- slash menu interaction;
- page/edgeless registry consistency;
- explicit default block creation;
- forward cross-block native selection and clipboard text;
- upward selection paint before pointer-up;
- exclusion of side-control glyphs;
- immediate focused-DOM refresh after paste;
- Markdown preview rendering.

Selection tests are intentionally geometry-driven and browser-sensitive. Keep
the assertion made while the mouse button is still down; moving it after
`mouse.up()` would stop detecting the original reverse-selection regression.

Current high-value missing browser coverage includes partial structured paste
through a real clipboard event, cut, IME composition, nested blocks, multiple
editor instances, remote edits while focused, keyboard-only slash navigation,
and WebKit in the default command.

## 10. Review packaging and enforcement last

Review these files after understanding the source they protect:

```text
package.json
├─ ESM-only exports and declaration paths
├─ React/Yjs peer ranges
├─ clean/build/check/test/demo scripts
└─ package files whitelist

pnpm-workspace.yaml
└─ root + demo workspace and allowed esbuild lifecycle

eslint.config.js
├─ JSDoc enforcement for editor/document production code
└─ native Yjs import restriction outside the adapter

tsconfig.json
├─ strict DOM/React source checking
└─ bundler module resolution

tsconfig.esm.json
└─ excludes tests from distributable output

jest.config.js
└─ Node unit-test transform and source roots

playwright.config.ts
├─ Chromium, Firefox, and WebKit projects
└─ built demo preview as the browser test server

scripts/run-test.sh
└─ forwards root test arguments to Jest without shell-dependent behavior
```

Check that `pnpm build` cannot include tests, package exports point only to files
inside the tarball, and the demo really imports the built public surface. The
lockfile is mechanical but important: review it primarily for unexpected
dependency or version changes.

Review `README.md` and `architecture.puml` as public documentation, but do not
assume they match the implementation. At the time this guide was written, the
README still mentions removed `registerPlugin` and migration APIs, and its
`RivtoEditor` example omits the required `defaultBlockType`. The PlantUML file
also contains aspirational managers and renderer-to-document relationships that
do not describe the current DDD folders. These files should either be aligned
before release or clearly labeled as historical. Generated `*.tsbuildinfo`,
`dist`, Playwright reports, and test results are ignored artifacts and are not
part of code review.

## End-to-end review scenarios

After the file-by-file pass, trace these scenarios without skipping layers:

### Type and edit a paragraph

```text
EditableText.onInput
  → editor.setBlockText
  → DocumentModelImpl
  → CRDT update
  → editor.changed
  → useSyncExternalStore
  → EditableText focused-DOM reconciliation
```

### Register and insert a custom block

```text
editor.defineBlock
  → BlockRegistry.register
  → editor.insertBlock
  → BlockRegistry.prepare
  → DocumentModelImpl.insertBlock
  → BlockContent resolves definition.render
```

### Copy and paste a partial cross-block range

```text
native selection
  → readEditorSelection
  → SelectionManager
  → createClipboardPayload
  → custom JSON + HTML + text
  → pasteBundle
  → remap IDs and links
  → one document transaction
  → selection collapse
  → React DOM and native caret restoration
```

### Switch page to edgeless and back

```text
editor.setMode
  → local mode event
  → renderer strategy changes
  → both read the same editor.document and BlockRegistry
  → no document mutation
```

### Apply an external or AI document-model edit

```text
editor.documentModel mutation
  → CRDT update
  → editor document subscription
  → revision and React refresh
```

Then check the exceptions: direct model creation bypasses registry defaults,
direct removal bypasses editor selection cleanup, and a different model origin
is not part of this editor's local undo history.

## Final review checklist

- No editor or React file imports `yjs`.
- Renderers never access CRDT containers.
- All created blocks have explicit types.
- Unknown stored types remain lossless and visible.
- Page and edgeless views resolve the same registry.
- Selection direction and UTF-16 offsets survive both drag directions.
- Clipboard JSON, HTML, and text describe the same selected range.
- Paste preserves the target block's type and metadata.
- Document mutations are transactionally grouped where users expect one edit.
- Local UI state is not serialized or synchronized.
- Every subscription, plugin, pointer listener, and owned object is cleaned up.
- Demo uses only public package exports.
- Unit tests cover data semantics; Playwright covers browser semantics.
- Package version and `RIVTO_VERSION` agree before release.
