# Rivto editor implementation audit

Audience: Rivto maintainers  
Audit date: 2026-08-29  
Scope: `packages/rivto-editor-core`, `packages/react-rivto-editor`, `TODO.md`, Demo keyboard wiring, and relevant local BlockSuite/AFFiNE/Logseq reference code.

## Executive answer

The two-package boundary is directionally good—canonical collaborative state is in core and browser behavior is in React—but the implementation is not yet safe around destructive imports, malformed or concurrent CRDT state, clipboard trust boundaries, extension teardown, cross-window DOM behavior, or runtime keyboard customization.

This audit records **47 findings**: 16 high-priority correctness/data-integrity risks, 24 medium-priority API/design/resilience issues, and 7 lower-priority delivery/documentation gaps. The most urgent work is to make every snapshot/clipboard import validate before its first write, make structural traversals cycle-safe, repair remote tree state, and make extension cleanup failure-safe.

For keyboard handling, the requested direction is correct but the static central keymap should be removed as the source of truth. Each extension should declare its own semantic action and defaults when it registers. `KeyboardManager` should expose a stable, reactive snapshot of installed bindings and existing override methods should remain live. Demo can then list, edit, disable, and restore bindings without rebuilding the editor or reloading the page.

## Scope and method

- Read both package source trees, tests, public exports, package scripts, `TODO.md`, Demo wiring, and E2E keymap coverage.
- Traced storage → public manager/editor → React consumer for the highest-risk paths.
- Compared extension-owned keymaps in local BlockSuite and inventory/conflict customization in local Logseq.
- Ran type checks, lint, package builds, Demo build, and focused keymap E2E.
- Reproduced five high-impact core defects against the built ESM package.
- Excluded unrelated app/backend code and did not treat speculative features as bugs.

Severity means: **High** can corrupt state, break a primary interaction, or undermine a public lifecycle boundary; **Medium** is a reproducible defect, resilience problem, or architectural constraint with a bounded workaround; **Low** is drift, tooling, or unmeasured efficiency debt.

## High-priority findings

### 1. Snapshot loading mutates valid state before late validation can fail

`loadSnapshot` validates only the outer block/element arrays, then replaces blocks before loading links and plugin data ([document-model.ts:127](../packages/rivto-editor-core/src/store/document-model/core/document-model.ts#L127)). `loadLinks` clears existing links and validates endpoints one at a time ([link-manager.ts:92](../packages/rivto-editor-core/src/store/document-model/core/managers/link-manager/link-manager.ts#L92)). Yjs transactions do not roll back thrown writes ([rivto-editor.ts:145](../packages/rivto-editor-core/src/editor/rivto-editor.ts#L145)).

Reproduction: loading valid new blocks plus one invalid link threw, but the old blocks and links were already gone and the new blocks remained. Fully validate and normalize every supplied section, including cross-references, before the transaction begins; the transaction should perform writes only.

### 2. Partial block snapshots preserve dangling links

The partial-update contract says omitted sections remain unchanged ([document-model.ts:117](../packages/rivto-editor-core/src/store/document-model/core/document-model.ts#L117)), but replacing `blocks` does not reconcile retained links. Reproduction: `{version: 6, blocks: []}` left a link whose endpoints referenced a deleted block. Either remove invalid retained links in the same transaction or reject the update before mutation; document the chosen policy.

### 3. A missing `afterId` inserts at the root start instead of throwing

`insertBlock` falls back to `roots` when `findContainer(afterId)` fails ([block-manager.ts:173](../packages/rivto-editor-core/src/store/document-model/core/managers/block-manager/block-manager.ts#L173)). `indexOf(afterId) + 1` converts `-1` to `0`, so the advertised error branch is unreachable ([block-manager.ts:735](../packages/rivto-editor-core/src/store/document-model/core/managers/block-manager/block-manager.ts#L735)). Reproduction inserted `b` before `a` when the anchor was `"missing"`. Resolve and validate the exact container and anchor before starting insertion.

### 4. Block insertion and complete block loading are not failure-atomic

`insertInto` attaches the block record before props, content, plugin data, descendants, and final placement have all succeeded ([block-manager.ts:735](../packages/rivto-editor-core/src/store/document-model/core/managers/block-manager/block-manager.ts#L735)). `loadBlocks` clears the document before recursive insertion, while preflight checks only list props and child-array shape ([block-manager.ts:674](../packages/rivto-editor-core/src/store/document-model/core/managers/block-manager/block-manager.ts#L674)). A duplicate or invalid late descendant leaves partial state. Preflight unique IDs, nonempty types, content, portable values, schema props, acyclic children, and every descendant before writing.

### 5. Remote structural conflicts are normalized only at construction, and cycles are unsafe

The tree is normalized once in `DocumentModelImpl` construction, not after remote updates ([document-model.ts:63](../packages/rivto-editor-core/src/store/document-model/core/document-model.ts#L63); [rivto-editor.ts:102](../packages/rivto-editor-core/src/editor/rivto-editor.ts#L102)). Move is a delete/insert across CRDT arrays, so concurrent moves can create duplicate or orphan ownership. Current normalization can leave an orphan cycle invisible, while `removeTree` and `collectTreeIds` recurse without a visited set ([block-manager.ts:708](../packages/rivto-editor-core/src/store/document-model/core/managers/block-manager/block-manager.ts#L708); [block-manager.ts:922](../packages/rivto-editor-core/src/store/document-model/core/managers/block-manager/block-manager.ts#L922)). Add a deterministic post-remote-update reconciler and make every traversal cycle-safe.

### 6. `YjsDoc.fromJSON` manipulates Yjs root internals instead of collaborative content

`fromJSON` deletes entries directly from `doc.share`, then recreates roots ([yjs-doc.ts:196](../packages/rivto-editor-core/src/store/crdt-doc/yjs-doc/yjs-doc.ts#L196)). Deleting the JavaScript root registry is not a CRDT deletion that peers observe, root-type replacement is unsafe, and conversion can throw after local clearing. Remove generic in-place whole-doc replacement: validate into a fresh `Y.Doc` and swap at a lifecycle boundary, or clear the contents of known typed roots after preflight.

### 7. Collapsed-caret copy/cut claims the clipboard with an empty structured block

Selection normalization intentionally returns a one-block range for a caret ([selection-manager.ts:166](../packages/rivto-editor-core/src/managers/selection-manager/selection-manager.ts#L166)). Clipboard copy slices identical offsets to `""` and still returns a bundle ([clipboard-manager.ts:114](../packages/rivto-editor-core/src/managers/clipboard-manager/clipboard-manager.ts#L114)); commands then prevent native behavior and write custom MIME ([rivto-editor.ts:332](../packages/rivto-editor-core/src/editor/rivto-editor.ts#L332)). Reproduction produced a version-4 bundle containing one empty block. Return `undefined` for a pure collapsed text selection so the system clipboard is untouched.

### 8. Structured clipboard input is not a real trust boundary

Core parses JSON directly and aborts instead of falling back to text ([clipboard-manager.ts:84](../packages/rivto-editor-core/src/managers/clipboard-manager/clipboard-manager.ts#L84)). The remapper ignores schema version, duplicate IDs, most field types, link shapes, and cycles ([clipboard.ts:150](../packages/rivto-editor-core/src/managers/clipboard-manager/utils/clipboard.ts#L150)). Reproduction accepted `version: 999`. React repeats direct parsing at [clipboard.ts:140](../packages/react-rivto-editor/src/extensions/clipboard/clipboard.ts#L140), and the edgeless controller has another bespoke parser ([controller.ts:630](../packages/react-rivto-editor/src/extensions/edgeless/visuals/controller.ts#L630)). Centralize one complete validator, reject ambiguous IDs/cycles before mutation, and fall back to safe text when custom MIME is invalid.

### 9. The keyboard manager cannot report its installed/effective bindings

The public capability exposes mutation but no list, revision, or subscription ([capabilities.ts:99](../packages/react-rivto-editor/src/capabilities.ts#L99)); registrations and overrides are private ([keyboard-manager.ts:33](../packages/react-rivto-editor/src/managers/events/keyboard-manager.ts#L33)). Demo derives overrides from the URL only during creation ([App.tsx:179](../demo/src/App.tsx#L179)). Applications therefore cannot build the requested complete live editor. Add `list()`, a stable cached snapshot, `revision`, and `subscribe()`; publish changes on register, delete, replace, and single override.

### 10. The central keymap is not the runtime source of truth

The static catalog owns IDs/defaults ([keymap.ts:1](../packages/react-rivto-editor/src/managers/events/keymap.ts#L1)), but each extension repeats its ID and reads defaults back from it; extension options can change declared defaults ([history.ts:76](../packages/react-rivto-editor/src/extensions/history/history.ts#L76)), and third-party actions never appear in the catalog. Move each ID/default beside its registration and derive the complete list from installed registrations. This matches BlockSuite's extension-owned keymap pattern ([BlockSuite keymap extension](../blocksuite/packages/framework/std/src/extension/keymap.ts#L37); [paragraph keymap](../blocksuite/packages/affine/blocks/paragraph/src/paragraph-keymap.ts#L31)).

### 11. Runtime remapping can silently shadow unrelated actions

Override application reparses bindings but performs no conflict analysis ([keyboard-manager.ts:176](../packages/react-rivto-editor/src/managers/events/keyboard-manager.ts#L176)). Dispatch uses priority and then registration order ([keyboard-manager.ts:216](../packages/react-rivto-editor/src/managers/events/keyboard-manager.ts#L216)); remapping `history.undo` to `Enter`, for example, can claim the event before block creation. Expose potential conflicts in the inventory using shortcut plus phase/target/mode/scope/priority. Warn in Demo rather than rejecting all overlaps because `when` predicates can make shared keys intentional. Logseq already builds both ID and key indexes and conflict checks ([data_helper.cljs:14](../logseq/src/main/frontend/modules/shortcut/data_helper.cljs#L14); [data_helper.cljs:206](../logseq/src/main/frontend/modules/shortcut/data_helper.cljs#L206)).

### 12. `Primary` accepts both Ctrl and Meta on every platform

Matching treats either exclusive modifier as `Primary` ([shortcut.ts:64](../packages/react-rivto-editor/src/managers/events/shortcut.ts#L64)), contradicting Demo documentation and normal `Mod` semantics. Ctrl+Z can trigger editor undo on macOS and Meta/Windows+Z can trigger it elsewhere. Resolve `Primary` from an injected/detected platform; retain explicit `Ctrl` and `Meta`. BlockSuite uses platform-specific selection ([keyboard.ts:29](../blocksuite/packages/framework/std/src/event/control/keyboard.ts#L29)), and Logseq resolves `mod` by platform ([data_helper.cljs:71](../logseq/src/main/frontend/modules/shortcut/data_helper.cljs#L71)).

### 13. Paste-as-plain-text mode can become stuck

One semantic keydown action sets a closure boolean, while a separately configurable keyup action clears it ([clipboard.ts:362](../packages/react-rivto-editor/src/extensions/clipboard/clipboard.ts#L362)). Remapping only the public start action, or losing keyup on blur, leaves later normal pastes in plain-text mode. Treat release as internal transport tied to the effective start binding and clear state on window keyup/blur; it should not be a separate user preference.

### 14. Standard preset installation is not rollback-safe

`standardPreset` calls child `setup` methods in a loop and returns their cleanups only after all succeed ([built-ins.tsx:583](../packages/react-rivto-editor/src/extensions/built-ins/built-ins.tsx#L583)). If a late child throws, earlier non-manager resources such as collapse subscriptions ([page-collapse.ts:28](../packages/react-rivto-editor/src/extensions/page/page-collapse.ts#L28)) never receive their returned cleanup. Wrap child setup in a local rollback stack and dispose it on failure.

### 15. Extension cleanup exceptions abort the rest of teardown

`ExtensionManager.destroy` uses a throwing `forEach`; a single custom cleanup prevents later extension and registration cleanup ([extension-manager.ts:102](../packages/react-rivto-editor/src/managers/extensions/extension-manager.ts#L102)). Its installed-extension disposer also runs custom cleanup before owned registrations without `finally` ([extension-manager.ts:123](../packages/react-rivto-editor/src/managers/extensions/extension-manager.ts#L123)). Core editor teardown has the same sequential failure mode before its `finally`-guarded CRDT destroy ([rivto-editor.ts:456](../packages/rivto-editor-core/src/editor/rivto-editor.ts#L456)). Make teardown best-effort: always release every owned resource, collect errors, and throw one aggregate afterward if useful.

### 16. Cross-document DOM support is inconsistent

`EventManager` correctly resolves `Element` from `root.ownerDocument.defaultView` ([event-manager.ts:253](../packages/react-rivto-editor/src/managers/events/event-manager.ts#L253)), but selection and edgeless extensions use global constructors and global `Node` constants, including [editor-dom-selection.ts:240](../packages/react-rivto-editor/src/managers/selection/editor-dom-selection.ts#L240), [text-selection.ts:141](../packages/react-rivto-editor/src/extensions/selection/text-selection.ts#L141), and [edgeless-deletion.ts:28](../packages/react-rivto-editor/src/extensions/edgeless/edgeless-deletion.ts#L28). An editor in an iframe/other window can fail target checks and lose selection or keyboard behavior. Consistently use the root's realm or node-type duck typing, and add a foreign-document integration test.

## Medium-priority correctness and API findings

### 17. There are no persisted parent/child/root constraints

`BlockDefinition` validates only block props ([types.ts:11](../packages/rivto-editor-core/src/managers/block-registry-manager/types.ts#L11)); core accepts any type anywhere. Invalid page/edgeless hierarchy can be persisted and every renderer must defend itself. Add minimal role/allowed-parent-child constraints at insert, move, and load boundaries. BlockSuite validates flavour against parent before add/move ([crud.ts:53](../blocksuite/packages/framework/store/src/model/store/crud.ts#L53)). Exact constraints are a product decision, so do not invent a large schema system first.

### 18. Core clipboard documentation promises flavors its API does not return

`ClipboardManager.copy` claims structured, HTML, and plain-text output ([clipboard-manager.ts:44](../packages/rivto-editor-core/src/managers/clipboard-manager/clipboard-manager.ts#L44)), while `ClipboardBundle` contains only Rivto structure ([types.ts:10](../packages/rivto-editor-core/src/managers/clipboard-manager/types.ts#L10)) and core commands write only custom MIME. React supplies interoperable formatting later, so either correct the core contract/docs or add explicit formatter injection; do not imply headless core provides HTML.

### 19. Plain-text paste bypasses registry defaults and type availability

Core inserts via `document.blocks.insertBlock` ([clipboard-manager.ts:255](../packages/rivto-editor-core/src/managers/clipboard-manager/clipboard-manager.ts#L255)) instead of the public block manager, bypassing registered/mode-available type validation and `blocksRegistry.prepare`. Missing text also becomes `""` and can create an empty root. Prepare the default input once through the public registry and no-op when no clipboard flavor exists.

### 20. “Portable” property typing and cloning accept values they corrupt

`BasicType` includes arbitrary `object` ([basic-types.ts:12](../packages/rivto-editor-core/src/store/crdt-doc/types/basic-types.ts#L12)), while clone turns every object into an enumerable record ([clone.ts:7](../packages/rivto-editor-core/src/store/document-model/core/utils/clone.ts#L7)). Dates, Maps, typed arrays, class instances, and an own `__proto__` key do not round-trip safely. Define recursive primitives/arrays/plain records, validate all props/plugin data/link meta/element props with one utility, then clone safely.

### 21. Link ID and malformed-record handling is inconsistent

Blocks/elements reject duplicate IDs, but `createLink` silently overwrites an existing ID and `loadLinks` is last-write-wins ([link-manager.ts:59](../packages/rivto-editor-core/src/store/document-model/core/managers/link-manager/link-manager.ts#L59)). Defensive reads stringify/cast malformed remote data. Require unique nonempty IDs, validate complete link records, and quarantine or skip malformed remote records deterministically.

### 22. `startsWithText` uses selection array order, not normalized document order

Normalization merges heterogeneous selection items by document order, but copy uses `current[0]?.type` ([clipboard-manager.ts:134](../packages/rivto-editor-core/src/managers/clipboard-manager/clipboard-manager.ts#L134)). A differently ordered mixed selection changes paste from text merge to structural insertion. Carry boundary ownership in the normalized result and derive the flag from the actual earliest boundary.

### 23. The CRDT event contract advertises unsupported events

`CRDTDoc.on` advertises `update | sync | snapshot` ([doc.ts:68](../packages/rivto-editor-core/src/store/crdt-doc/types/doc.ts#L68)), while `YjsDoc.on` only forwards `update | sync` to `Y.Doc` ([yjs-doc.ts:125](../packages/rivto-editor-core/src/store/crdt-doc/yjs-doc/yjs-doc.ts#L125)); snapshot is never emitted and provider sync does not belong to `Y.Doc`. Narrow the interface to real document events or implement provider-owned status aggregation separately.

### 24. Move/merge can attach visible content under an unreachable orphan

`moveBlock(..., "inside")` and merge validate target storage existence rather than target placement ([block-manager.ts:497](../packages/rivto-editor-core/src/store/document-model/core/managers/block-manager/block-manager.ts#L497); [block-manager.ts:443](../packages/rivto-editor-core/src/store/document-model/core/managers/block-manager/block-manager.ts#L443)). Require placed source and target for user operations; reserve orphan recovery for an explicit repair path.

### 25. Deleted block path-cache entries leak

`blockPaths` is long-lived, but recursive removal and complete load never clear affected entries ([block-manager.ts:47](../packages/rivto-editor-core/src/store/document-model/core/managers/block-manager/block-manager.ts#L47); [block-manager.ts:674](../packages/rivto-editor-core/src/store/document-model/core/managers/block-manager/block-manager.ts#L674); [block-manager.ts:922](../packages/rivto-editor-core/src/store/document-model/core/managers/block-manager/block-manager.ts#L922)). Delete entries with removed trees and clear on full load—or remove the cache until profiling proves it worthwhile.

### 26. Stable IDs accept empty and whitespace-only strings

Blocks, links, and elements use caller IDs without a shared nonempty validator ([block-manager.ts:735](../packages/rivto-editor-core/src/store/document-model/core/managers/block-manager/block-manager.ts#L735); [element-manager.ts:39](../packages/rivto-editor-core/src/store/document-model/core/managers/element-manager/element-manager.ts#L39)). Use one validator at create/load boundaries while otherwise preserving stable IDs exactly.

### 27. Element props cannot be deleted through the patch API

Element updates call `assignMap(..., false)` ([element-manager.ts:68](../packages/rivto-editor-core/src/store/document-model/core/managers/element-manager/element-manager.ts#L68)), and `assignMap` skips `undefined` instead of deleting ([crdt.ts:43](../packages/rivto-editor-core/src/store/document-model/core/utils/crdt.ts#L43)). Blocks interpret `undefined` as deletion. Align semantics or add a narrow `deleteElementProps` operation.

### 28. Common tree reads can become quadratic

`getBlock` finds a path then materializes descendants, while selection validation repeats it per ID and later walks the whole tree ([block-manager.ts:116](../packages/rivto-editor-core/src/store/document-model/core/managers/block-manager/block-manager.ts#L116); [selection-manager.ts:294](../packages/rivto-editor-core/src/managers/selection-manager/selection-manager.ts#L294)). Add narrow placed-ID/parent/order indexes or share one traversal result. Benchmark before introducing broader caching.

### 29. Provider identity prevents two same-kind providers on one document

Broadcast and WebRTC provider IDs are hardcoded by kind ([broadcast.ts:25](../packages/rivto-editor-core/src/store/crdt-doc/yjs-doc/providers/broadcast.ts#L25); [webrtc.ts:6](../packages/rivto-editor-core/src/store/crdt-doc/yjs-doc/providers/webrtc.ts#L6)), while the document rejects duplicate provider IDs ([yjs-doc.ts:32](../packages/rivto-editor-core/src/store/crdt-doc/yjs-doc/yjs-doc.ts#L32)). Use room/instance-qualified IDs or explicitly document singleton semantics.

### 30. `useKeyboardEvent` freezes most binding metadata after mount

The effect depends only on binding ID and editor; a ref refreshes only `when` and listener behavior ([use-keyboard-event.ts:20](../packages/react-rivto-editor/src/hooks/editor/use-keyboard-event.ts#L20)). Keys, phase, target, scope, mode, composition policy, and priority can change in React while dispatch keeps the old definition. Re-register on structural field changes, following `useDOMEvent`, or make mount-invariance explicit in the type/API.

### 31. Keyboard docs/types contradict live behavior

`KeymapOverrides` is described as creation-time ([keyboard-types.ts:5](../packages/react-rivto-editor/src/managers/events/keyboard-types.ts#L5)), although runtime replacement is public and tested. Unknown IDs are retained for future registrations, not simply ignored. Update docs and surface orphan/future overrides in the inventory so typos are visible.

### 32. Shortcut grammar mishandles plus and duplicate/empty components

The parser splits on every `+`, drops empty pieces, and deduplicates modifiers through a `Set` ([shortcut.ts:23](../packages/react-rivto-editor/src/managers/events/shortcut.ts#L23)). Some printable keys cannot be expressed and malformed forms normalize unexpectedly. Support a named `Plus`/code form and reject empty or duplicate components.

### 33. Edgeless popovers listen on the global window

Toolbar and properties UI use global `window`/`Node` ([tool-bar.tsx:58](../packages/react-rivto-editor/src/extensions/edgeless/visuals/components/tool-bar.tsx#L58); [visual-properties.tsx:35](../packages/react-rivto-editor/src/extensions/edgeless/visuals/components/visual-properties.tsx#L35)). Foreign-document/portal UI listens in the wrong realm. Use the panel's `ownerDocument.defaultView` or route through the event manager.

### 34. Caret geometry performs synchronous layout once per character

Vertical navigation measures a Range for each text offset ([block-dom.ts:171](../packages/react-rivto-editor/src/managers/events/block-dom.ts#L171)); pointer fallback repeats similar work ([editor-dom-selection.ts:384](../packages/react-rivto-editor/src/managers/selection/editor-dom-selection.ts#L384)). Prefer browser caret hit-testing, cache line geometry until layout/content changes, or binary-search positions. The complexity is certain; user-visible threshold still needs a benchmark.

### 35. Pointer listeners can survive component unmount

`useBlockEditing` adds window `pointermove/up/cancel` listeners and removes them only when a terminal event arrives ([use-block-editing.ts:218](../packages/react-rivto-editor/src/hooks/blocks/use-block-editing.ts#L218)). Deleting/unmounting a block mid-gesture retains detached state. Keep active cleanup in a ref and invoke it from effect teardown, or use pointer capture.

### 36. Event registration rebuilds every native listener group

Every registration/disposal calls `reconnect`, which detaches and recreates all groups ([event-manager.ts:92](../packages/react-rivto-editor/src/managers/events/event-manager.ts#L92); [event-manager.ts:186](../packages/react-rivto-editor/src/managers/events/event-manager.ts#L186)). Hook-heavy mounts are approximately quadratic in registration count. Reference-count groups and change only zero↔one transitions; defer until profiling if registrations remain creation-only.

### 37. Dynamic extension installation is explicitly blocked

`TODO.md` requests removal of the one-shot guard ([TODO.md:1](../TODO.md#L1)); `initialize` rejects subsequent calls and `install` is private ([extension-manager.ts:38](../packages/react-rivto-editor/src/managers/extensions/extension-manager.ts#L38)). Expose `install(extension): disposer`, preserving duplicate-ID checks, rollback, and owned registrations. Do this after fixing findings 14–15.

### 38. Dynamic uninstall would leave stale default-writing callbacks

`defaultWritingBlockExtension` installs global factories but its cleanup only unregisters the block contribution ([default-writing-block.tsx:75](../packages/react-rivto-editor/src/extensions/page/default-writing-block.tsx#L75)); `installDefaultWriting` has no disposer or ownership stack ([react-editor.tsx:104](../packages/react-rivto-editor/src/react-editor.tsx#L104)). Once extensions become dynamic, uninstall leaves callbacks for an unavailable type. Make default-writing installation an owned, reversible registration.

### 39. `EditorView` has one hard-coded layout bucket

The second TODO asks how to separate before/after content ([TODO.md:2](../TODO.md#L2)). Current order is host children, all extension components, then surface, all inside every editor wrapper ([editor-view.tsx:86](../packages/react-rivto-editor/src/editor-view.tsx#L86)). Add only two explicit positions—`beforeSurface` and `afterSurface`—to extension mounts or props; avoid a general layout framework until another placement is needed.

### 40. Global editor revision invalidates the entire `EditorView`

`EditorView` subscribes to the core editor revision at its top boundary ([editor-view.tsx:40](../packages/react-rivto-editor/src/editor-view.tsx#L40)). Every document update can re-enter surface and extension rendering even where focused hooks already provide narrower subscriptions. Measure typing and collaborative bursts, then move block data to selector-level subscriptions or memoized row boundaries; do not add a second state model.

## Lower-priority maintainability and delivery findings

### 41. Three modules own too many unrelated responsibilities

The core block store manager is 1,042 lines, edgeless visuals controller 901, and page drag 776. In particular the visuals controller owns commands, clipboard, validation, selection, grouping, geometry, tools, and persistence. Split by existing responsibilities (clipboard, groups/order, commands) with the controller coordinating; avoid interface/factory scaffolding.

### 42. The documented Jest commands currently run zero tests

Both `pnpm --filter @chulane/rivto test` and `pnpm --filter @chulane/rivto-react test` abort with “Preset ts-jest not found,” even though `ts-jest` is declared and resolvable from package directories. This may be the current install/toolchain state rather than a source bug, but CI must prove clean-install behavior. Pin/repair config resolution and add the exact package test commands to CI.

### 43. Lint currently fails

`pnpm lint` reports two `@typescript-eslint/no-this-alias` errors in [react-editor.test.ts:495](../packages/react-rivto-editor/src/__tests__/react-editor.test.ts#L495). Fix the test fake or locally justify/disable the rule; the repository's documented validation sequence is not green.

### 44. Demo ships a large single JavaScript chunk

`pnpm --dir demo build` succeeds but reports a 1,008.62 kB minified JS chunk (304.31 kB gzip), above Vite's 500 kB warning. Measure initial-load needs and lazy-load edgeless/Markdown syntax-highlighting UI if Demo/product startup matters; do not split solely to silence the warning.

### 45. Tests encode contradictory snapshot-version behavior

The model test expects non-v6 snapshots to throw ([document-model.v5.test.ts:14](../packages/rivto-editor-core/src/store/document-model/core/__tests__/document-model.v5.test.ts#L14)), while a block command test expects version 3 to succeed and clear blocks ([block-commands.test.ts:718](../packages/rivto-editor-core/src/editor/__tests__/block-commands.test.ts#L718)). Choose reject-versus-migrate behavior, update the stale assertion, and rename the misleading `v5` test file.

### 46. Snapshot documentation still says schema v5

The public `DocumentModel` comments say v5 although types and implementation use v6 ([document.ts:173](../packages/rivto-editor-core/src/store/document-model/core/types/document.ts#L173)). Correct API docs and search generated docs for the same drift.

### 47. `TODO.md` is too small and malformed as an issue ledger

It contains only the two React TODOs and no core defects, uses raw path-plus-sentence entries, and lacks a final newline ([TODO.md](../TODO.md)). Replace it with a small checked list containing owner, expected behavior, test, and status—or move confirmed defects into the real issue tracker and keep this file as links only.

## Recommended keyboard design

Keep the API small and runtime-derived:

```ts
interface KeyboardBindingSnapshot {
  readonly id: string;
  readonly defaultKeys: readonly KeyboardShortcut[];
  readonly keys: readonly KeyboardShortcut[];
  readonly overridden: boolean;
  readonly disabled: boolean;
  readonly phase: KeyboardEventPhase;
  readonly target: KeyboardEventTarget;
  readonly scope?: DOMEventScope;
  readonly mode?: EditorMode | readonly EditorMode[];
  readonly priority: number;
}

interface KeyboardCapability {
  register(definition: KeyboardEventDefinition, listener: Handler): () => void;
  delete(id: string): boolean;
  list(): readonly KeyboardBindingSnapshot[];
  readonly revision: number;
  subscribe(listener: () => void): () => void;
  replaceKeymap(keymap: KeymapOverrides): void;
  setKeymapOverride(id: string, keys: readonly KeyboardShortcut[] | undefined): void;
}
```

Implementation rules:

1. The owning extension declares its stable action ID and default keys in the same module as `register`.
2. `KeyboardManager` retains declared definitions plus parsed effective shortcuts. `list()` returns immutable data and stable identity until the registry/override revision changes.
3. Include orphan overrides as `installed: false` if future-registration behavior is retained; this makes typos visible.
4. Compute conservative potential conflicts from effective key, phase, target, mode, scope, and priority. Do not try to statically decide arbitrary `when` predicates.
5. Keep `setKeymapOverride` for instant edits. `undefined` restores declared defaults; `[]` disables. Persistence belongs to Demo/application state, not the editor package.
6. Make keydown/keyup pairing internal for stateful gestures such as paste-as-plain-text and pan.

Demo should add a `KeyboardPanel` that subscribes with `useSyncExternalStore`, lists default/effective bindings and status, edits a local input, calls `setKeymapOverride`, and offers Disable/Restore buttons. Replace the URL-only E2E with a test that edits a binding, uses it immediately, restores it, and confirms that the `ReactEditor` instance and page did not reload.

BlockSuite supplies the right ownership precedent (extension-local keymaps); Logseq supplies the useful inventory, display, persistence, and conflict precedent. Rivto does not need Logseq's heavyweight global reinstall because its manager already reparses overrides in place.

## Fix order

1. **Import safety:** findings 1–8, 20–22, 26. Create one portable validator and make snapshots/clipboard fully preflighted.
2. **CRDT structure:** findings 5–6, 17, 23–25. Add cycle-safe reconciliation and defined partial-update policy.
3. **Lifecycle:** findings 14–16, 35, 37–39. Make setup/teardown transactional in ownership, then expose dynamic extension install.
4. **Keyboard:** findings 9–13, 30–32. Move defaults to extensions, add reactive inventory/conflicts, then build Demo editing UI.
5. **Performance/delivery:** findings 28, 34, 36, 40–44 after benchmarks and green CI.

## Required regression coverage

- Snapshot: invalid late link/plugin data does not mutate; partial blocks cannot leave dangling links; duplicate/cyclic forests; missing anchors; remote conflicting moves/orphan cycles.
- Clipboard: caret copy/cut is a no-op; invalid JSON/version falls back to text; duplicate IDs/cycles rejected; plain paste applies registry defaults; edgeless invalid payload cannot partially insert.
- Lifecycle: failed standard preset rolls back direct subscriptions; throwing cleanup does not block others; dynamic install/uninstall restores writing factories and registrations.
- Keyboard: live inventory, register/delete notifications, disable/restore, wrong-platform `Primary`, collision visibility, remapped stateful keyup, dynamic hook metadata, no-reload Demo edit.
- DOM: selection, deletion, movement, toolbar, and popovers under a foreign `ownerDocument`.

## Verification results and limitations

| Check | Result |
|---|---|
| `pnpm check-types` | Passed for core, React, Demo, and docs |
| `pnpm --filter @chulane/rivto build` | Passed |
| `pnpm --filter @chulane/rivto-react build` | Passed |
| `pnpm --dir demo build` | Passed with 1.0 MB chunk warning |
| `pnpm exec playwright test e2e/keymap.spec.ts --project=chromium` | Passed, 1 test |
| `pnpm lint` | Failed, 2 test-file errors |
| Core Jest | Did not start: `Preset ts-jest not found` |
| React Jest | Did not start: `Preset ts-jest/presets/default-esm not found` |

The audit is static plus targeted runtime reproduction, not exhaustive browser QA or fuzzing. Performance findings 28, 34, 36, 40, and 44 need measurements before optimization. Parent/child constraints and same-kind provider multiplicity need product decisions. Jest failure means existing unit assertions were inspected but not executed in this checkout.

## Claim-to-source ledger and stopping point

Primary evidence is the current repository source/tests/config linked beside each claim. Comparative evidence is limited to local first-party implementation copies: BlockSuite extension keymaps/platform modifier handling and Logseq inventory/conflict handling. No web sources were needed because the question concerns this checkout and local reference copies.

Searches covered public managers, mutation callers, native event registration, selection/clipboard flows, keymap registrations and tests, TODO/history markers, package exports/scripts, direct cross-layer mutations, and known limitation docs. Targeted follow-up stopped after every report section had direct code evidence, the highest-impact core claims had executable reproduction, comparison patterns converged, and further broad searching was more likely to add low-confidence style observations than change priorities.
