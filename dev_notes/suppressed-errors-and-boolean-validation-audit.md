# Suppressed Errors and Boolean Validation Audit

Scope: `packages/document-model`, `packages/rivto-editor-core`, and
`packages/react-rivto-editor`. Test-only cleanup suppression is excluded unless
it can hide a production defect.

## Findings

### 1. `isPortableValue` discards validation diagnostics

- **Location:** `packages/document-model/src/core/utils/portable.ts:77`
- **Pattern:** Boolean validation utility; caught error is discarded.
- **Problem:** `isPortableValue` calls `assertPortableValue` and converts every
  thrown validation error to `false`. Callers cannot distinguish unsupported
  values, non-finite numbers, cycles, dangerous keys, or the failing property
  path, even though the assertion utility already produces that information.
- **Risk:** A boundary using this predicate can reject data without an actionable
  cause and may accidentally classify an unexpected implementation failure as
  ordinary invalid input.

### 2. List-property policy validation is boolean and masks thrown errors

- **Location:** `packages/rivto-editor-core/src/managers/block-list-props-manager/block-list-props-manager.ts:17,81`
- **Pattern:** Boolean validation callback; caught error is replaced without a
  cause.
- **Problem:** `ListPropsRegistration.isValid` can only accept or reject a
  complete record. `prepare` then catches both a normal `false` result and any
  exception thrown by a policy and replaces them with `Error("Invalid block
  list properties")`. The caller cannot identify the rejecting registration,
  the invalid field, or whether the validator itself crashed.
- **Risk:** Misconfigured extensions and invalid user data are indistinguishable,
  making an integration defect look like a routine rejected operation.

### 3. Structured clipboard failures silently become lossy fallback paste

- **Locations:**
  - `packages/react-rivto-editor/src/extensions/built-ins/clipboard/clipboard.ts:151`
  - `packages/rivto-editor-core/src/managers/clipboard-manager/clipboard-manager.ts:134`
  - `packages/react-rivto-editor/src/extensions/edgeless/visuals/controller.ts:634`
- **Pattern:** Parse/validation errors are caught and converted to an absent
  bundle.
- **Problem:** The React handler parses and validates Rivto MIME data, discards
  any error, and falls back to HTML/plain text. It still passes the original
  structured string to core, where `createPasteContext` repeats the parse and
  validation and again discards any error. The edgeless visual handler has a
  third catch that returns `false`, deferring to another paste handler. There is
  no diagnostic or error hook for any failure.
- **Risk:** Corrupt, incompatible, or internally generated invalid Rivto data
  can paste as a different and less expressive document while appearing to
  succeed. The original schema/path error is unavailable for diagnosis.

### 4. Block drag failures are treated as canceled drops

- **Location:** `packages/react-rivto-editor/src/extensions/block-drag/provider.tsx:406,430`
- **Pattern:** Mutation errors are caught and reduced to a boolean/no-op.
- **Problem:** Cross-document transfer catches every exception and only leaves
  `transferred` false. Same-document `moveBlocks` catches every exception and
  merely schedules focus restoration. Neither branch reports the cause or
  distinguishes an expected invalid destination from a programming/storage
  failure.
- **Risk:** A drop can disappear without feedback, and defects in atomic
  transfer, block validation, or document mutation are hidden as ordinary
  gesture rejection.

### 5. Extension release failures are discarded during teardown and rollback

- **Locations:**
  - `packages/react-rivto-editor/src/managers/extensions/extension-manager.ts:170,185`
  - `packages/react-rivto-editor/src/extensions/built-ins/built-ins.ts:381`
- **Pattern:** Best-effort cleanup catches errors without retaining or reporting
  them.
- **Problem:** An installed extension's disposer ignores every exception from
  owned registration releases, including when the extension's custom cleanup
  succeeded. Setup rollback in both the manager and standard preset also drops
  cleanup failures to preserve only the original setup error.
- **Risk:** Event handlers, renderers, or other registrations can remain active
  after teardown while the operation reports success. During failed setup, the
  original error is retained but evidence that rollback was incomplete is lost.

### 6. Caret fallback succeeds but the operation still reports failure

- **Location:** `packages/react-rivto-editor/src/components/place-caret-at-point.ts:37`
- **Pattern:** A caught browser-selection error triggers a fallback, but the
  boolean result is not updated.
- **Problem:** When `Selection.setBaseAndExtent` throws, the catch creates and
  installs a collapsed Range at the start of the element. `placed` remains
  `false`, so `placeCaretAtPoint` reports failure even when that fallback
  succeeded.
- **Risk:** Any caller that starts using the documented boolean contract will
  retry or apply another fallback after the caret has already moved. The current
  caller ignores the result, which hides the contract defect.

### 7. TODO property validation returns a boolean that every caller ignores

- **Location:** `packages/react-rivto-editor/src/extensions/todo-item/todo-item.tsx:255,405`
- **Pattern:** `safeParse` validation failure becomes `false`; callers discard
  the boolean.
- **Problem:** `commitPropertiesPatch` returns `false` for a missing block,
  absent/unchanged patch, and Zod validation failure. Both the modal-close and
  inline-edit callers ignore that result. In the modal path, the UI closes
  before validation is attempted, and `result.error` is discarded.
- **Risk:** Invalid edits vanish without feedback, and callers cannot distinguish
  a harmless no-op from rejected data or a stale block reference.

### 8. Type-change validation silently replaces rejected property values

- **Location:** `packages/rivto-editor-core/src/managers/block-registry-manager/block-registry-manager.ts:188`
- **Pattern:** Boolean `safeParse(...).success` check followed by automatic data
  replacement.
- **Problem:** `prepareTypeChange` tests each destination-owned field with Zod,
  but on failure it discards the value and installs the registered default. The
  Zod issues and the fact that repair occurred are not returned or reported;
  final whole-object validation only sees the repaired object.
- **Risk:** Changing a block type can silently lose an existing property value.
  Schema regressions and genuinely incompatible user data both look like a
  successful conversion with defaults.

### 9. DOM selection errors silently fall back to stale or changed selection

- **Locations:**
  - `packages/react-rivto-editor/src/managers/selection/editor-dom-selection.ts:214`
  - `packages/react-rivto-editor/src/managers/selection/dom-text-selection.ts:176`
  - `packages/react-rivto-editor/src/managers/events/selection.ts:76`
  - `packages/react-rivto-editor/src/extensions/built-ins/slash/slash-menu.tsx:76`
- **Pattern:** Browser Range/Selection errors become `undefined` or a void
  return, with no failure signal.
- **Problem:** A rejected native endpoint makes `readDOM` yield no selection;
  `readKeyboardSelection` can then use the previously stored portable selection.
  Separately, `restoreDOMSelection` ignores `setBaseAndExtent` failures and gives
  callers no result indicating that restoration was skipped. Slash-menu caret
  measurement likewise discards a Range error and returns no offset, which
  suppresses command discovery for that update.
- **Risk:** A command immediately following a rerender can act on the formerly
  focused block, while content reconciliation or prompt decoration can leave a
  changed caret/selection without either caller being able to retry deliberately.

### 10. Connector endpoint validation is boolean, shallow, and causes silent skips

- **Location:** `packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform-connectors.ts:46,74`
- **Pattern:** Boolean persisted-data validator; rejected values are skipped.
- **Problem:** `isConnectorEndpoint` only verifies that an object has `anchor`
  and `position` keys; it does not validate either value or optional `elementId`.
  Both transform consumers silently `continue` when the predicate returns
  `false`, with no invalid-element signal.
- **Risk:** Bad connector data can be accepted by the shallow guard or omitted
  from move/resize/rotate reconciliation. Either path can leave connector
  geometry stale while the rest of the transform succeeds.

### 11. Boolean CRDT guards turn malformed stored records into missing data

- **Locations:**
  - `packages/document-model/src/core/utils/crdt.ts:10`
  - `packages/document-model/src/core/managers/block-manager/block-manager.ts:788`
  - `packages/document-model/src/core/managers/element-manager/element-manager.ts:81`
- **Pattern:** Boolean duck-type validation; failed validation is mapped to
  `undefined` or filtered out.
- **Problem:** `isCRDTMap`, `isCRDTArray`, and `isCRDTText` only test for a small
  set of method names. Block and element read paths use the map predicate to
  treat a malformed stored value as absent. `readBlock` also returns
  `undefined` for a repeated/cyclic ID and filters that child from the detached
  snapshot; `getElements` similarly omits invalid top-level entries.
- **Risk:** Corrupted collaborative state can look like a missing block/element
  or a shortened tree during reads, while required mutation paths throw for the
  same record. The silent partial snapshot can then drive destructive operations
  without exposing the underlying storage invariant failure.

### 12. Hierarchy reads coerce invalid IDs instead of reporting corruption

- **Location:** `packages/document-model/src/core/managers/block-manager/utils.ts:108`
- **Pattern:** Validation is replaced by unconditional string coercion.
- **Problem:** `strings` maps every collaborative-array value through `String`.
  Root and child reads therefore accept non-string values and turn them into
  identifiers. `getBlocks`/`readBlock` subsequently omit a coerced ID when no
  matching record exists, while `getRootIds` can still publish and cache it.
- **Risk:** Consumers can observe IDs that have no block, or a materialized tree
  that silently differs from the hierarchy arrays. Objects also collapse to
  values such as `"[object Object]"`, creating accidental identity collisions.

### 13. Rollback cleanup can mask the original setup error and stop early

- **Locations:**
  - `packages/react-rivto-editor/src/managers/blocks/block-type-manager.ts:79`
  - `packages/react-rivto-editor/src/react-editor.tsx:171`
- **Pattern:** Cleanup is invoked while handling an error without protecting or
  aggregating the primary failure.
- **Problem:** Failed block-type registration calls reversed disposers with a
  plain `forEach`; the first throwing disposer aborts the remaining rollback and
  replaces the original registration error. React editor construction likewise
  calls `destroy()` in its catch, so a teardown error prevents rethrow of the
  initialization error.
- **Risk:** The actionable root cause is lost, and partially installed managers
  or registrations can survive because cleanup stopped at its first failure.

### 14. Canvas paste silently drops elements and unresolved relationships

- **Locations:**
  - `packages/react-rivto-editor/src/extensions/built-ins/clipboard/element-paste-strategy.ts:68`
  - `packages/react-rivto-editor/src/extensions/edgeless/visuals/controller.ts:672`
- **Pattern:** Validated paste continues after filtering unresolved references.
- **Problem:** `ElementPasteStrategy` skips a block element when none of its
  referenced block IDs were mapped, while continuing to create the remaining
  elements. The visual controller's paste path similarly removes unresolved
  group children, clears unmapped connector `elementId` values, and filters
  unmapped selected IDs without reporting any repair.
- **Risk:** Paste can report success with missing block cards, changed group
  membership, and detached connectors. Because the source bundle passed its
  top-level validator, this partial import hides gaps in cross-reference
  validation.

### 15. Foreign-update normalization silently deletes and relocates hierarchy references

- **Locations:**
  - `packages/document-model/src/core/document-model.ts:76`
  - `packages/document-model/src/core/managers/block-manager/block-manager.ts:653`
- **Pattern:** Automatic repair mutates invalid state without returning a repair
  result or reporting affected IDs.
- **Problem:** Every non-local CRDT update invokes `blocks.normalize()`. That
  operation removes missing and duplicate root/child references, keeps only one
  placement, and appends every unreferenced stored block to the root list. It
  also coerces hierarchy entries with `String` before deciding what to remove.
- **Risk:** Collaboration conflicts or corrupt updates can visibly delete a
  placement or move content to the document root while appearing as an ordinary
  remote update. Callers cannot surface, log, or review what was repaired.
