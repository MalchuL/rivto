# Rivto editor implementation TODO

Source: [docs/editor-implementation-audit.md](docs/editor-implementation-audit.md)  
Status: `pending` | `in progress` | `done` | `deferred`  
Owner: `core` | `react` | `demo` | `tooling`

Work proceeds in the audit fix order. Check an item only after the expected behavior is implemented and covered by the listed test.

## 1. Import safety

- [x] **#1 Snapshot loading mutates valid state before late validation can fail**
  - Owner: core
  - Expected: every snapshot section (blocks, links, elements, plugin data) and all cross-references are fully validated and normalized before the transaction begins; a thrown late check leaves the previous document unchanged
  - Test: colocated snapshot preflight — invalid late link/plugin data does not mutate
  - Status: done

- [x] **#2 Partial block snapshots preserve dangling links**
  - Owner: core
  - Expected: replacing `blocks` either removes invalid retained links in the same transaction or rejects the update before mutation; the chosen policy is documented
  - Test: `{version: 6, blocks: []}` cannot leave a link whose endpoints reference a deleted block
  - Status: done — omitted `links` with a `blocks` replacement removes dangling retained links

- [x] **#3 A missing `afterId` inserts at the root start instead of throwing**
  - Owner: core
  - Expected: `insertBlock` resolves and validates the exact container and anchor before starting insertion; a missing sibling throws
  - Test: inserting after `"missing"` throws and does not place the block before existing roots
  - Status: done

- [x] **#4 Block insertion and complete block loading are not failure-atomic**
  - Owner: core
  - Expected: preflight unique IDs, nonempty types, content, portable values, schema props, acyclic children, and every descendant before writing; `insertInto` / `loadBlocks` do not leave partial trees
  - Test: duplicate or invalid late descendant does not persist after a thrown load
  - Status: done

- [x] **#7 Collapsed-caret copy/cut claims the clipboard with an empty structured block**
  - Owner: core
  - Expected: copy/cut return `undefined` for a pure collapsed text selection so the system clipboard is untouched
  - Test: caret copy/cut is a no-op
  - Status: done

- [x] **#8 Structured clipboard input is not a real trust boundary**
  - Owner: core, react
  - Expected: one complete validator; reject invalid version, ambiguous IDs, and cycles before mutation; fall back to safe text when custom MIME is invalid
  - Test: invalid JSON/version falls back to text; duplicate IDs/cycles rejected; edgeless invalid payload cannot partially insert
  - Status: done

- [x] **#20 “Portable” property typing and cloning accept values they corrupt**
  - Owner: core
  - Expected: one recursive primitives/arrays/plain-records validator; all props, plugin data, link meta, and element props use it; clone is safe
  - Test: Dates, Maps, typed arrays, class instances, and `__proto__` keys are rejected or cloned without corruption
  - Status: done

- [x] **#21 Link ID and malformed-record handling is inconsistent**
  - Owner: core
  - Expected: unique nonempty IDs; complete link records validated; malformed remote records quarantined or skipped deterministically
  - Test: duplicate `createLink` ID throws; `loadLinks` is not last-write-wins
  - Status: done

- [x] **#22 `startsWithText` uses selection array order, not normalized document order**
  - Owner: core
  - Expected: boundary ownership lives in the normalized selection; the flag is derived from the actual earliest boundary
  - Test: a mixed selection ordered differently still pastes as a text merge when the earliest boundary is text
  - Status: done

- [x] **#26 Stable IDs accept empty and whitespace-only strings**
  - Owner: core
  - Expected: one nonempty-ID validator at create/load boundaries; otherwise preserve stable IDs exactly
  - Test: `""` and `"   "` are rejected for blocks, links, and elements
  - Status: done

## 2. CRDT structure

- [x] **#5 Remote structural conflicts are normalized only at construction, and cycles are unsafe**
  - Owner: core
  - Expected: deterministic post-remote-update reconciler; every traversal (`removeTree`, `collectTreeIds`, and similar) is cycle-safe
  - Test: remote conflicting moves and orphan cycles are repaired; traversals do not recurse forever
  - Status: done — remote `update` calls `normalize()`; tree walks use a visited set

- [x] **#6 `YjsDoc.fromJSON` manipulates Yjs root internals instead of collaborative content**
  - Owner: core
  - Expected: no generic in-place whole-doc replacement via `doc.share`; validate into a fresh `Y.Doc` and swap at a lifecycle boundary, or clear known typed roots after preflight
  - Test: `fromJSON` does not throw after local clearing; peers observe content replacement, not registry deletion
  - Status: done — typed roots are cleared after preflight

- [x] **#17 There are no persisted parent/child/root constraints**
  - Owner: core
  - Expected: minimal role/allowed-parent-child constraints at insert, move, and load; do not invent a large schema system
  - Test: disallowed parent/child combinations are rejected at those boundaries
  - Status: done — optional `BlockDefinition.allowedParents`

- [x] **#23 The CRDT event contract advertises unsupported events**
  - Owner: core
  - Expected: `CRDTDoc.on` matches real document events (`update` | `sync`) or implements provider-owned status separately
  - Test: type/docs no longer mention unimplemented `snapshot`
  - Status: done

- [x] **#24 Move/merge can attach visible content under an unreachable orphan**
  - Owner: core
  - Expected: user operations require a placed source and target; orphan recovery is an explicit repair path
  - Test: `moveBlock(..., "inside")` and merge throw when the target is not placed
  - Status: done

- [x] **#25 Deleted block path-cache entries leak**
  - Owner: core
  - Expected: delete `blockPaths` entries with removed trees and clear on full load
  - Test: remove/load no longer retain stale path-cache entries
  - Status: done

## 3. Lifecycle

- [x] **#14 Standard preset installation is not rollback-safe**
  - Owner: react
  - Expected: child `setup` is wrapped in a local rollback stack and disposed if a later child throws
  - Test: failed standard preset rolls back earlier direct subscriptions
  - Status: done

- [x] **#15 Extension cleanup exceptions abort the rest of teardown**
  - Owner: core, react
  - Expected: teardown is best-effort — every owned resource is released, errors are collected, one aggregate is thrown afterward if useful
  - Test: throwing cleanup does not block later extension or registration cleanup
  - Status: done

- [x] **#16 Cross-document DOM support is inconsistent**
  - Owner: react
  - Expected: selection and edgeless extensions use the root's realm or node-type duck typing, not global constructors/`Node` constants
  - Test: foreign-document integration — selection, deletion, movement, toolbar, and popovers under a foreign `ownerDocument`
  - Status: done — node-type helpers plus panel `defaultView` listeners

- [x] **#35 Pointer listeners can survive component unmount**
  - Owner: react
  - Expected: `useBlockEditing` keeps active pointer cleanup in a ref and invokes it from effect teardown (or uses pointer capture)
  - Test: deleting/unmounting a block mid-gesture does not retain detached listeners
  - Status: done

- [x] **#37 Dynamic extension installation is explicitly blocked**
  - Owner: react
  - Expected: `install(extension): disposer` is public after #14–#15; duplicate-ID checks, rollback, and owned registrations are preserved
  - Test: dynamic install/uninstall after creation
  - Status: done

- [x] **#38 Dynamic uninstall would leave stale default-writing callbacks**
  - Owner: react
  - Expected: default-writing installation is an owned, reversible registration
  - Test: uninstall restores writing factories so they no longer produce an unavailable type
  - Status: done

- [x] **#39 `EditorView` has one hard-coded layout bucket**
  - Owner: react
  - Expected: only two explicit positions — `beforeSurface` and `afterSurface` — on extension mounts or props
  - Test: extension UI can render before and after the surface
  - Status: done

## 4. Keyboard

- [x] **#9 The keyboard manager cannot report its installed/effective bindings**
  - Owner: react
  - Expected: `list()`, a stable cached snapshot, `revision`, and `subscribe()`; publish on register, delete, replace, and single override
  - Test: live inventory; register/delete notifications
  - Status: done

- [x] **#10 The central keymap is not the runtime source of truth**
  - Owner: react
  - Expected: each extension declares its stable action ID and default keys beside `register`; the complete list is derived from installed registrations
  - Test: third-party actions appear in `list()` without being added to the static catalog
  - Status: done

- [x] **#11 Runtime remapping can silently shadow unrelated actions**
  - Owner: react, demo
  - Expected: inventory exposes potential conflicts from shortcut plus phase/target/mode/scope/priority; Demo warns rather than rejecting overlaps
  - Test: collision visibility; remapping `history.undo` to `Enter` is reported
  - Status: done

- [x] **#12 `Primary` accepts both Ctrl and Meta on every platform**
  - Owner: react
  - Expected: `Primary` resolves from an injected/detected platform; explicit `Ctrl` and `Meta` remain
  - Test: wrong-platform `Primary` does not match
  - Status: done

- [x] **#13 Paste-as-plain-text mode can become stuck**
  - Owner: react
  - Expected: release is internal transport tied to the effective start binding; state clears on window keyup/blur; not a separate user preference
  - Test: remapped stateful keyup and blur clear plain-text mode
  - Status: done

- [x] **#30 `useKeyboardEvent` freezes most binding metadata after mount**
  - Owner: react
  - Expected: re-register on structural field changes (keys, phase, target, scope, mode, composition, priority), following `useDOMEvent`
  - Test: dynamic hook metadata updates dispatch
  - Status: done

- [x] **#31 Keyboard docs/types contradict live behavior**
  - Owner: react
  - Expected: docs describe runtime replacement; orphan/future overrides appear in the inventory
  - Test: unknown IDs are visible as `installed: false`
  - Status: done

- [x] **#32 Shortcut grammar mishandles plus and duplicate/empty components**
  - Owner: react
  - Expected: named `Plus`/code form; empty or duplicate components are rejected
  - Test: `+` as a key is expressible; malformed forms throw
  - Status: done

- [x] **Demo `KeyboardPanel`**
  - Owner: demo
  - Expected: subscribe with `useSyncExternalStore`, list default/effective bindings and status, edit locally, `setKeymapOverride`, Disable/Restore; no editor/page reload
  - Test: e2e edits a binding, uses it immediately, restores it, and confirms the `ReactEditor` instance and page did not reload
  - Status: done

## 5. Correctness, API, and delivery

- [x] **#18 Core clipboard documentation promises flavors its API does not return**
  - Owner: core
  - Expected: core contract/docs match `ClipboardBundle` (Rivto structure only), or explicit formatter injection is added; do not imply headless core provides HTML
  - Test: docs/types no longer claim HTML/plain-text output from `copy`
  - Status: done

- [x] **#19 Plain-text paste bypasses registry defaults and type availability**
  - Owner: core
  - Expected: prepare the default input once through the public registry; no-op when no clipboard flavor exists
  - Test: plain paste applies registry defaults; missing text does not create an empty root
  - Status: done

- [x] **#27 Element props cannot be deleted through the patch API**
  - Owner: core
  - Expected: align `undefined` with block deletion semantics or add a narrow `deleteElementProps` operation
  - Test: patching an element prop to `undefined` removes it
  - Status: done

- [ ] **#28 Common tree reads can become quadratic**
  - Owner: core
  - Expected: after a benchmark, add narrow placed-ID/parent/order indexes or share one traversal result
  - Test: benchmark first; no broader cache without measurement
  - Status: deferred — needs benchmark

- [x] **#29 Provider identity prevents two same-kind providers on one document**
  - Owner: core
  - Expected: room/instance-qualified IDs, or documented singleton semantics
  - Test: two broadcast rooms can attach, or docs state the singleton rule
  - Status: done — IDs are `broadcast:${roomId}` / `webrtc:${roomId}`

- [x] **#33 Edgeless popovers listen on the global window**
  - Owner: react
  - Expected: toolbar and properties UI use the panel's `ownerDocument.defaultView` or the event manager
  - Test: foreign-document popovers dismiss in the correct realm
  - Status: done

- [ ] **#34 Caret geometry performs synchronous layout once per character**
  - Owner: react
  - Expected: after a benchmark, prefer caret hit-testing, cache line geometry, or binary-search positions
  - Test: benchmark first
  - Status: deferred — needs benchmark

- [ ] **#36 Event registration rebuilds every native listener group**
  - Owner: react
  - Expected: after profiling, reference-count groups and change only zero↔one transitions
  - Test: defer until registrations are shown not to be creation-only
  - Status: deferred — needs profile

- [ ] **#40 Global editor revision invalidates the entire `EditorView`**
  - Owner: react
  - Expected: after measuring typing and collaborative bursts, move block data to selector-level subscriptions or memoized row boundaries; do not add a second state model
  - Test: measure first
  - Status: deferred — needs measurement

- [ ] **#41 Three modules own too many unrelated responsibilities**
  - Owner: core, react
  - Expected: split block store manager, edgeless visuals controller, and page drag by existing responsibilities; controller coordinates; no interface/factory scaffolding
  - Test: existing suites still pass after the split
  - Status: deferred — follow-up split after CI is green

- [x] **#42 The documented Jest commands currently run zero tests**
  - Owner: tooling
  - Expected: pin/repair ts-jest config resolution; add the exact package test commands to CI
  - Test: `pnpm --filter @chulane/rivto test` and `pnpm --filter @chulane/rivto-react test` run on a clean install
  - Status: done — package-local Jest transformers plus CI workflow

- [x] **#43 Lint currently fails**
  - Owner: react
  - Expected: fix the `@typescript-eslint/no-this-alias` errors in `react-editor.test.ts` so `pnpm lint` is green
  - Test: `pnpm lint` passes
  - Status: done

- [ ] **#44 Demo ships a large single JavaScript chunk**
  - Owner: demo
  - Expected: measure initial-load needs; lazy-load edgeless/Markdown syntax-highlighting UI if startup matters
  - Test: measure first; do not split solely to silence the Vite warning
  - Status: deferred — needs measurement

- [x] **#45 Tests encode contradictory snapshot-version behavior**
  - Owner: core
  - Expected: choose reject-versus-migrate; update the stale assertion; rename the misleading `v5` test file
  - Test: snapshot-version tests agree with the chosen policy
  - Status: done — reject non-v6; `document-model.v6.test.ts`

- [x] **#46 Snapshot documentation still says schema v5**
  - Owner: core
  - Expected: public `DocumentModel` comments and generated docs say v6
  - Test: search docs for leftover v5 snapshot claims
  - Status: done

- [x] **#47 `TODO.md` is too small and malformed as an issue ledger**
  - Owner: tooling
  - Expected: this file is the checked ledger (owner, expected behavior, test, status)
  - Test: file is a complete audit-backed list with a trailing newline
  - Status: done
