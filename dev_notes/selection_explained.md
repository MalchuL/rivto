# How selection works in Rivto

This document explains the current selection system from browser input to
runtime state, visual rendering, clipboard behavior, mutation, cleanup, and
tests. The implementation deliberately separates selection meaning from DOM
selection because one browser range is not reliable across Rivto's separate
`contenteditable` block hosts.

## Source map

| Responsibility | Source |
| --- | --- |
| Public selection types | `src/editor/editor/types.ts` |
| Validation, ordering, and cleanup | `src/editor/editor/rivto-editor.ts` |
| Detached local state and subscriptions | `src/editor/managers/selection-manager.ts` |
| DOM coordinate conversion, native ranges, and visual highlights | `src/editor/react/selection.ts` |
| Pointer, keyboard, block, and canvas gestures | `src/editor/react/renderers.tsx` |
| Browser `selectionchange`, restoration, formatting, copy, and paste bridge | `src/editor/react/rivto-editor.tsx` |
| Range normalization and clipboard slicing | `src/editor/managers/clipboard-bundle.ts` |
| Cut/paste range mutation and caret collapse | `src/editor/managers/clipboard-manager.ts` |
| Selection paint | `src/editor/react/styles.ts` |
| Runtime and browser behavior tests | `src/editor/__tests__/editor.test.ts`, `e2e/editor.spec.ts` |

## The central model

Selection has two synchronized representations:

```text
browser DOM selection / pointer gesture
                 │
                 │ DOM nodes and DOM offsets
                 ▼
        React selection adapter
                 │
                 │ block IDs and UTF-16 offsets
                 ▼
     EditorRuntime selection commands
                 │
                 │ validated detached value
                 ▼
          SelectionManager
                 │
                 ├── renderer selection paint
                 ├── toolbar target
                 ├── clipboard range
                 └── native DOM range restoration
```

The portable runtime value is authoritative for editor operations. The native
browser selection is still important for caret behavior, keyboard extension,
accessibility, and ordinary browser interaction, but it is treated as a view of
the portable value rather than the sole source of truth.

This separation solves four concrete problems:

1. Each text block is a separate `contenteditable`. Browsers disagree about
   selecting and painting a range across those hosts.
2. A DOM node is ephemeral. React may replace text nodes after a local command,
   remote CRDT update, Markdown render, or mode switch.
3. A `Range` sorts its endpoints into document order and therefore loses whether
   the user dragged from bottom to top.
4. Block selection and edgeless object selection have no natural native text
   range at all.

Selection is local editor-session state. It is not written to the CRDT document,
not included in snapshots, and not synchronized to collaborators.

## The three selection variants

`EditorSelection` is a discriminated union. Every caller must inspect `type`
before using variant-specific fields.

### Text selection

```ts
interface TextSelection {
  type: "text";
  anchor: { blockId: string; offset: number };
  head: { blockId: string; offset: number };
}
```

`anchor` is where the gesture began. `head` is its active end. Their direction
is meaningful and is never sorted when stored.

For a forward selection from offset 2 in block A to offset 3 in block B:

```text
A: AB|CDE       anchor = { blockId: A, offset: 2 }
B: FGH|IJ       head   = { blockId: B, offset: 3 }
```

For the same visible range selected upward:

```text
B: FGHI|J       anchor = { blockId: B, offset: 4 }
A: A|BCDE       head   = { blockId: A, offset: 1 }
```

The second value stays backward. Clipboard code later creates an ordered
`start` and `end`, but it does not mutate the stored direction.

A caret is represented as a collapsed text selection: anchor and head have the
same block ID and offset.

Offsets are UTF-16 code-unit offsets. That matches JavaScript string indexes,
DOM `Range` offsets, and browser `Selection` offsets. A visible Unicode symbol
can occupy two UTF-16 units, so these offsets are not user-perceived grapheme
indexes.

### Block selection

```ts
interface BlockSelection {
  type: "block";
  blockIds: string[];
  anchorBlockId: string;
  focusBlockId: string;
}
```

`blockIds` is always stored in visible depth-first document order. It is not
stored in gesture order. `anchorBlockId` and `focusBlockId` preserve gesture
direction separately.

For a selection initiated on block C and extended upward to A:

```text
blockIds     = [A, B, C]
anchorBlockId = C
focusBlockId  = A
```

This gives structural consumers a canonical ordered list while keyboard logic
still knows which end is active.

### Edgeless object selection

```ts
interface EdgelessSelection {
  type: "edgeless";
  blockIds: string[];
}
```

This means canvas objects are selected, not their text. The public type permits
multiple IDs. The current React canvas interaction selects one card at a time
and uses the first ID as its active object.

An edgeless object selection is valid only in `edgeless` mode. Text selection
remains valid in either mode because canvas cards may contain editable text.

## SelectionManager: storage, not policy

`SelectionManager` intentionally knows nothing about the document, modes, DOM,
or block order. It owns only:

- one `EditorSelection | null` value;
- `get()`;
- `set()`;
- `clear()`;
- subscriptions.

### Detached reads and writes

Both `get()` and `set()` copy nested mutable data:

- text positions are copied;
- block ID arrays are copied;
- the outer selection object is copied.

Therefore this is harmless:

```ts
const selection = editor.selection.get();
if (selection?.type === "block") selection.blockIds.length = 0;
```

It changes only the returned value, not manager state. A real change must pass
through `selection.set` or, for application code, the `selection.set` command.

`set()` always notifies. `clear()` notifies only when a non-null selection was
actually removed. Listeners are copied before invocation, so a listener may
unsubscribe while notification is in progress.

The manager trusts its caller. Runtime validation belongs one layer above it.
`ClipboardManager.collapse()` is one internal case that writes directly because
it has just produced a known-valid caret from a completed document transaction.

## The command and validation boundary

Public callers set selection through:

```ts
editor.commands.execute("selection.set", { selection });
editor.commands.execute("selection.clear");
```

`EditorRuntime.setSelection()` performs the checks before delegating to
`SelectionManager`.

### Text validation, step by step

For both `anchor` and `head`, the runtime:

1. Recursively finds the block in the detached document tree.
2. Rejects a missing block ID.
3. Requires an integer offset.
4. Rejects negative offsets.
5. Rejects an offset greater than `block.content.length`.
6. Preserves anchor/head direction.
7. Stores a detached copy.

Offset equality with `content.length` is valid and means the position after the
last UTF-16 unit.

### Block validation and canonical ordering

For a block selection, the runtime:

1. Requires at least one ID.
2. Verifies every supplied ID exists recursively.
3. Requires both anchor and focus IDs to occur in the supplied selected set.
4. Converts the supplied IDs to a `Set`, removing duplicates.
5. Traverses the document depth first in visible order.
6. Adds an ID only when it exists in the selected set.
7. Stores that ordered ID array with the original anchor and focus.

The runtime, not each renderer, therefore guarantees canonical block order.

### Edgeless validation

For an edgeless selection, the runtime:

1. Requires at least one block ID.
2. Verifies every ID exists.
3. Requires current mode to be `edgeless`.
4. Stores a detached ID array.

### Clearing invalid state

The runtime subscribes to both document and mode changes. On either change it
runs `reconcileSelection()` before publishing a view revision.

Reconciliation clears the complete selection when:

- any referenced block no longer exists, including after a remote deletion;
- an edgeless object selection exists after leaving edgeless mode.

It does not currently clamp text offsets after remote text shortening. Offset
bounds are checked when selection is set; reconciliation checks IDs and mode.
DOM restoration safely clamps oversized offsets to the end of rendered text.

## The rendered DOM contract

Selection adapters rely on a small stable DOM vocabulary:

```html
<div data-rivto-editor>
  <div class="rv-page">
    <div data-rivto-block="stable-block-id">
      <span class="rv-block-content" contenteditable="true">...</span>
    </div>
  </div>
</div>
```

- `data-rivto-editor` scopes native selection to one editor instance.
- `data-rivto-block` maps ephemeral DOM back to a stable document ID.
- `.rv-block-content` identifies the text host and defines offset zero.
- `data-selected=true` paints block or canvas-object selection.
- `data-rivto-pointer-selecting=true` temporarily declares that the page
  renderer, rather than the browser's `selectionchange`, owns the gesture.

Block controls and list prefixes use `user-select: none`. Otherwise a native
cross-block range can visually include glyphs such as `⋮`, `＋`, or indentation
buttons even though clipboard selection contains only block text.

## DOM endpoints and portable offsets

The browser describes a selection endpoint as a DOM node plus an offset inside
that node. Rivto converts that to `{ blockId, offset }`.

### Pointer coordinates to a DOM endpoint

`readDOMSelectionPoint(root, x, y)` performs these steps:

1. `contentNearPoint()` asks `document.elementFromPoint()` for the editable host
   under the pointer.
2. If the pointer is in a gap, it computes the distance to every
   `.rv-block-content` rectangle and chooses the nearest host. This keeps a drag
   continuous while crossing block padding or vertical gaps.
3. Firefox's `caretPositionFromPoint()` is tried first.
4. Chromium's older `caretRangeFromPoint()` is used as the alternative.
5. The endpoint is accepted only if its node belongs to the chosen host.
6. If the browser returns an endpoint constrained to another active
   `contenteditable`, `nearestTextPoint()` scans every text-node offset in the
   chosen host and selects the caret rectangle closest to the pointer.
7. An empty host falls back to the host element at offset zero.

The scan is deliberately limited to one block. It is a browser fallback, not
the normal hit-test path.

### DOM endpoint to block-relative offset

`readPosition()` performs the reverse conversion:

1. It finds the endpoint's closest `.rv-block-content`.
2. It finds that host's closest `data-rivto-block` ancestor.
3. It rejects endpoints outside the supplied editor root.
4. It creates a temporary `Range` covering the host.
5. It sets the range end to the browser endpoint.
6. It uses `range.toString().length` as the UTF-16 offset from the start of the
   editable host.

This handles multiple nested text nodes without storing a path through rendered
markup. The stable result survives React replacing those nodes.

`readEditorSelection()` converts `window.getSelection().anchorNode` and
`focusNode` independently, preserving browser anchor/focus direction.

## Ordinary same-block text selection

Same-block selection mostly uses native browser behavior.

1. The user clicks or drags inside one `.rv-block-content`.
2. The browser creates or updates its native `Selection`.
3. The document-level `selectionchange` listener in `RivtoEditor` runs.
4. `readEditorSelection(root)` rejects selections outside this editor and maps
   both native endpoints to block-relative positions.
5. React executes the `selection.set` command.
6. `EditorRuntime` validates IDs and offsets.
7. `SelectionManager.set()` stores a detached directed text selection.
8. Selection subscribers invalidate React and the runtime inspector.
9. `useLayoutEffect` restores the equivalent native selection after DOM
   reconciliation if restoration is safe.

The restore may look redundant, but model updates can rewrite editable DOM
between steps 7 and 9. Rebuilding the range from stable IDs and offsets prevents
the caret from remaining attached to a stale text node.

## Cross-block text selection

Cross-block selection cannot rely only on native behavior because each block is
an independent editing host. `BlockDOMRenderer` bridges the gesture.

### Pointer-down

The page's `onPointerDownCapture` runs before native contenteditable handling:

1. Non-primary buttons are ignored.
2. If the target is inside `.rv-block-content`, the gesture is classified as
   text selection.
3. `readDOMSelectionPoint()` resolves the exact DOM anchor immediately.
4. `readDOMPointPosition()` converts it to a stable block ID and UTF-16 offset.
5. The renderer stores the stable `anchorPosition`, original pointer
   coordinates, and gesture type in `pointerSelection.current`.

Capturing the portable anchor at pointer-down is important. Later Chromium
hit-tests at the old coordinates can return the current head because the active
editing host changed during the drag.

### Pointer movement within the first block

The global capture-phase `pointermove` handler ignores movement shorter than
three pixels. While the pointer remains in the anchor block, native browser
selection is sufficient, so the synthetic cross-block path returns.

### Pointer movement into another block

Once the pointer resolves to a different block:

1. Browser default handling is prevented for this movement.
2. The original DOM anchor is resolved or reused.
3. The current DOM head is resolved from pointer coordinates.
4. Anchor and head are converted to portable positions.
5. The page receives `data-rivto-pointer-selecting=true`.
6. A directed `TextSelection` is created from original anchor to current head.
7. The value is stored through `selection.set`.
8. `setNativeSelection(anchor, head)` asks the browser to display the matching
   native range.
9. `updateCrossBlockHighlight()` paints immediately from the same portable
   value.

The ownership marker suppresses the outer `selectionchange` listener. Chromium
can emit intermediate selection events containing only its active host during
an upward drag. Accepting one would replace the correct cross-block value with
a temporary same-block range.

### Preserving bottom-to-top direction

`setNativeSelection()` first uses `Selection.setBaseAndExtent()`. Unlike a
`Range`, this API accepts a base and extent and preserves direction.

If the browser rejects the cross-editable endpoints or the nodes were detached,
Rivto falls back to a sorted `Range`. The visual native range may then be
forward, but `EditorSelection.anchor` and `.head` remain backward, so clipboard
and runtime semantics are still correct.

### Pointer-up

On pointer-up:

1. The live gesture is removed from `pointerSelection.current`.
2. Rectangle-selection paint is cleared if present.
3. For completed cross-block text selection,
   `restoreEditorSelection()` rebuilds the browser range from the portable
   value.
4. A zero-delay task restores it once more for Firefox, which may emit a late
   `selectionchange` after pointer-up.
5. Only after that task is the ownership marker removed.

The browser can now use the restored native range for copy, cut, and keyboard
extension, while the runtime keeps the same stable directed value.

## Native selection restoration and focus

`restoreEditorSelection(root, selection)` maps portable offsets back to DOM
endpoints with `pointAtOffset()`.

`pointAtOffset()` walks text nodes in rendered order, subtracting each node's
length until it reaches the requested offset. If the request is beyond current
text, it returns the end of the last node. Empty content uses the content host
at offset zero.

Restoration has focus guards:

- A collapsed caret is not restored if focus has left editable content. This
  prevents an old caret from stealing focus back after a toolbar click.
- If a collapsed caret belongs to another rendered block while editing focus is
  still inside Rivto, that block is focused with `preventScroll`.
- A cross-block selection does not move focus because the browser permits only
  one active contenteditable.

After those checks, restoration calls `setNativeSelection()` with live DOM
endpoints.

## Supplemental cross-block highlighting

Browsers may maintain a cross-host native range but paint only the active
`contenteditable`. Rivto therefore adds a presentation-only highlight.

`updateCrossBlockHighlight()`:

1. Removes the previous Rivto highlight.
2. Ignores null, non-text, and same-block selections.
3. Lists editable hosts in rendered order.
4. Finds anchor and head host indexes.
5. Determines forward visual order independently from gesture direction.
6. Builds one DOM `Range` per selected block:
   - first block: boundary offset to block end;
   - middle blocks: full content;
   - last block: block start to boundary offset.
7. Uses the CSS Custom Highlight API when available:
   `CSS.highlights.set("rivto-cross-selection", new Highlight(...ranges))`.
8. Otherwise sets `data-rivto-cross-selected=true` on each affected host as a
   coarse full-block fallback.

No marker spans are inserted into editable content, so highlighting does not
change text offsets or generate input mutations.

`useLayoutEffect` updates this paint after selection or mode changes. The live
cross-block pointer handler also updates it immediately because Chromium may
defer React's external-store commit until the native gesture ends.

## Whole-block selection from handles

The `⋮` side button is both the drag handle and the block-selection control.

### Plain click

1. `selectBlock(blockId, false, false)` uses the clicked block as anchor and
   focus.
2. The selected ID list is `[blockId]`.
3. The runtime validates and stores a block selection.
4. `BlockView` sees the ID in `selection.blockIds` and emits
   `data-selected=true`.

### Shift-click

1. If the current selection is a block selection, its `anchorBlockId` remains
   fixed. Otherwise the clicked block becomes the new anchor.
2. Anchor and clicked focus are located in `visibleBlockIds`, a depth-first
   flattening of the rendered tree.
3. The inclusive slice between their minimum and maximum indexes becomes
   `blockIds`.
4. Anchor/focus direction is retained separately even when focus is above
   anchor.
5. Runtime ordering makes the ID list canonical again.

### Control/Command-click toggle

1. The existing selected IDs become a `Set`.
2. The clicked ID is added or removed.
3. Remaining IDs are filtered through `visibleBlockIds` to restore document
   order.
4. If no IDs remain, `selection.clear` runs.
5. If the old anchor was removed, the clicked block becomes the replacement
   anchor.
6. The clicked block becomes focus.

## Block selection from blank-space dragging

A pointer-down directly on `.rv-page`, rather than inside a block or descendant,
starts rectangle selection.

### Gesture steps

1. Existing selection is cleared.
2. Initial viewport `x` and `y` are stored with `moved=false`.
3. Movement under three pixels is ignored, allowing a blank-space click to be
   just a clear action.
4. On real movement, browser default is prevented and `moved=true`.
5. The renderer sets `data-rivto-pointer-selecting=true`.
6. Any native text selection inside this editor is cleared.
7. A viewport rectangle is formed using minimum x/y and absolute width/height,
   so all drag directions work.
8. React paints `.rv-selection-rect` after converting viewport coordinates to
   page-relative coordinates.
9. `blockIdsInRect()` resolves intersecting block elements.
10. No hits clear selection; hits create a block selection.
11. Dragging upward swaps anchor/focus assignment while leaving `blockIds` in
    document order.
12. Pointer-up removes rectangle paint, clears native selection again in a
    zero-delay task, and releases the ownership marker.

### Nested-block rectangle rules

`blockIdsInRect()` follows structural rules designed to avoid selecting both a
parent subtree and the same descendants:

1. It gathers every rendered `data-rivto-block` with its viewport rectangle.
2. Strict intersection is used; touching an edge alone is not selection.
3. If the gesture is vertically contained inside a parent and both vertical
   boundaries land in direct children, it selects the contiguous child slice.
4. Otherwise the containing ancestor is selected.
5. After intersection, a selected block is removed when one of its selected
   ancestors is also present.

This matters for copy and delete: selecting a parent already denotes its
subtree, so also returning its children would duplicate work and clipboard
content.

## Keyboard behavior for block selection

`BlockDOMRenderer` handles keys only while current selection type is `block`:

- `Escape` clears selection.
- `Backspace` or `Delete` removes each selected ID through `block.remove`, then
  clears selection. Removing an ancestor can make a later descendant removal a
  harmless no-op.
- `ArrowUp` and `ArrowDown` move from `focusBlockId` to the adjacent visible ID.
- Holding Shift extends from the preserved anchor to that next focus.
- Without Shift, the next focused block becomes a new one-block selection.

The side handle has focus after a click, so these keys can arrive at the page's
bubbling `onKeyDown` handler.

## Edgeless object selection versus text editing

Canvas cards contain two interaction layers:

- card chrome represents the object;
- `contenteditable`, inputs, links, and buttons keep native text/focus behavior.

Clicking card chrome calls `setSelected(blockId)`, which executes:

```ts
selection.set({ type: "edgeless", blockIds: [blockId] })
```

The selected card receives `data-selected=true` and an outline. Clicking the
drag strip selects the card before or alongside movement interaction.

`BlockView.onClick` explicitly ignores events whose target is inside:

```text
contenteditable, input, textarea, select, a, button
```

Without this guard, a click intended to place a caret or edit an image URL would
bubble to the card and replace text selection with object selection. This was
the cause of the earlier “cannot edit in edgeless mode” regression.

When the user clicks canvas text:

1. The browser places a native caret.
2. `selectionchange` maps it to `TextSelection`.
3. Runtime state changes from `edgeless` to `text`.
4. Typing follows normal text commands.

When the user clicks card chrome again, runtime state changes back to
`edgeless`.

Switching to block mode clears an edgeless object selection through
`reconcileSelection()`. Text selection is not cleared solely because the mode
changed.

## Selection and text input

### Normal typing in one block

The browser mutates the focused contenteditable first. `onInput` then reads
`innerText`, executes `text.set`, and routes a normalized input event. The
selection remains browser-driven and is synchronized by `selectionchange`.

The editable layout effect avoids rewriting equal focused text because doing so
would replace DOM nodes and reset the caret on every keystroke. It rewrites only
when model content and visible text differ, such as after paste or a remote CRDT
update.

### Replacing a cross-block range by typing

Native contenteditable cannot atomically replace text spanning independent
hosts. Rivto intercepts this in two places:

1. `onBeforeInput` handles browser insertion/deletion input types when a stored
   text selection crosses blocks and composition is not active.
2. `onKeyDown` covers printable keys, Backspace, and Delete when the browser
   path does not provide a usable before-input mutation.

Both prevent native default and execute `clipboard.paste` with either the typed
character or an empty deletion string. Clipboard range replacement then:

1. Normalizes anchor/head into ordered start/end.
2. Keeps the unselected prefix of the first block.
3. Keeps the unselected suffix of the last block.
4. Removes every later block touched by the range.
5. Sets the first block text to `prefix + insertedText + suffix`.
6. Preserves the first block's ID, type, props, plugin data, and layout.
7. Collapses selection immediately after inserted text.
8. React restores the native caret in the surviving block.

For `ABCDE` selected from offset 2 through offset 3 of `FGHIJ`, typing `X`
produces `ABXIJ` in the first block and removes the second block.

IME composition is not intercepted by this cross-block `beforeinput` path.

## Selection and toolbar formatting

The toolbar identifies its active block differently for each variant:

- text: anchor block;
- block: focus block;
- edgeless: first selected object.

Markdown formatting itself accepts only a text selection whose anchor and head
are in the same block. It computes:

```text
from   = min(anchor.offset, head.offset)
length = abs(head.offset - anchor.offset)
```

and executes `text.format`. Cross-block formatting currently does nothing.

Clicking a toolbar button moves DOM focus away from editable text. The stored
selection still supplies formatting coordinates, while the restoration focus
guard prevents the old caret from stealing focus back afterward.

## Clipboard normalization

Gesture direction and mutation order serve different needs. The runtime keeps
direction; `normalizeSelection()` creates a temporary ordered range for
clipboard operations.

### Text normalization

1. The document tree is flattened depth first.
2. Anchor and head block indexes are found.
3. If anchor's block is earlier, selection is forward.
4. In one block, the smaller offset determines forward order.
5. Ordered `start` and `end` are copied without changing manager state.
6. `blocks` becomes the inclusive visible slice between boundary blocks.

### Block and edgeless normalization

For a non-text selection:

1. Selected IDs become a set.
2. The flattened document is filtered through that set.
3. Start is offset zero of the first selected block.
4. End is the content length of the last selected block.
5. The filtered blocks remain in visible order.

Thus block copy/cut naturally selects whole boundary contents.

## Copy

The React root handles native copy as follows:

1. It derives a current block ID from the selection.
2. It routes a normalized `copy` event through global plugins, block-scoped
   plugins, and fallbacks.
3. If no plugin claims it, `clipboard.copyEvent` runs.
4. `createClipboardPayload()` normalizes the selection.
5. Selected top-level subtrees are cloned; descendants whose ancestor is
   already selected are not duplicated as roots.
6. The first and last cloned block contents are trimmed to exact text offsets.
7. Links are included only when both endpoints are in the copied block set.
8. One slice produces all three formats:
   - `application/x-rivto+json` for lossless typed block data;
   - `text/html` for interoperable rich paste;
   - `text/plain` for universal fallback.
9. The native event is prevented and all formats are written synchronously.

For a reverse selection from offset 2 in `Beta` to offset 2 in `Alpha`, the
stored direction remains reverse while copied plain text is `pha\nBe`.

## Cut

Cut first copies, then uses the original selection shape:

- A block or edgeless selection removes every normalized selected block and
  clears selection. It does not leave an empty first boundary block.
- A non-collapsed text selection calls the same `replaceRange(range, "")` used
  by paste. Same-block text is deleted normally. Cross-block text keeps the
  first prefix and last suffix, removes later touched blocks, and collapses the
  caret at the join.

All cross-block document mutations are grouped in a document transaction.

## Paste

The root re-reads native selection synchronously before paste because the
browser may dispatch paste before its asynchronous `selectionchange` event.
That freshly read text selection is stored first.

Paste then follows this order:

1. Route a normalized plugin event.
2. If unclaimed, execute the native paste command.
3. Prefer Rivto structured JSON.
4. Otherwise convert HTML to visible text.
5. Otherwise use plain text.

### Plain text paste

With a valid selection, plain paste calls `replaceRange` and preserves the
first block's identity and metadata. Newlines remain content inside that block;
they do not implicitly create block siblings.

Without a valid destination, it inserts a new block of `defaultBlockType` and
collapses the caret at the end.

### Structured paste at a caret or range

Given target `Hello |world` and copied blocks `First`, `Second`:

1. The selected target prefix is `Hello `.
2. The selected final suffix is `world`.
3. The first copied root is consumed into the existing target, preserving the
   target's ID, type, props, plugin data, and layout.
4. Children of that first copied root are remapped and attached below target.
5. Remaining copied roots receive fresh IDs and become new siblings.
6. The old suffix is appended to the final pasted block.
7. Internal links are remapped to target and fresh IDs.
8. The caret collapses after copied content and before the preserved suffix.

The result is target `Hello First`, then copied block `Secondworld`, with the
caret between `Second` and `world`.

Without any valid selection, every copied root is inserted with fresh IDs
because there is no target whose native type should be retained.

## Render invalidation and feedback-loop prevention

Selection participates in two subscription paths:

1. `SelectionManager.subscribe()` drives `selectionRevision` in React, serialized
   as JSON so `useSyncExternalStore` receives a stable primitive snapshot.
2. The runtime also subscribes to selection and increments its general
   `revision`, updating consumers such as the demo inspector and plugin UI.

After a selection update, React's layout effect projects runtime state back into
the DOM. That projection may cause a browser `selectionchange`, which maps the
same value back into the runtime. During synthetic cross-block gestures, the
ownership marker blocks the dangerous intermediate events. Outside that window,
re-storing an equivalent value is tolerated; manager `set()` currently notifies
even when structurally equal.

## Cleanup and multi-editor safety

- DOM-to-selection conversion requires both endpoints inside the supplied root.
- Clearing a native range happens only when at least one endpoint belongs to
  that editor.
- Document `selectionchange` listeners are removed when `RivtoEditor` unmounts.
- Global pointer listeners are removed when `BlockDOMRenderer` unmounts.
- Pointer ownership data attributes are removed on completion and cleanup.
- CSS custom highlights and fallback attributes are removed by
  `clearCrossBlockHighlight()`.
- Runtime selection subscriptions are released by `destroy()`.

These rules prevent one editor instance from clearing or adopting another
editor's native selection.

## Important invariants

When changing selection code, preserve all of these:

1. Runtime selections contain stable block IDs, never DOM nodes or CRDT objects.
2. Text anchor/head and block anchor/focus preserve gesture direction.
3. Block ID arrays are canonical visible-order arrays without duplicates.
4. Clipboard ordering is derived by normalization, never by rewriting stored
   direction.
5. DOM offsets and model string offsets both use UTF-16 units.
6. A cross-block replacement retains the first block's identity and metadata.
7. Selected ancestors suppress duplicate selected descendants.
8. Browser selection events cannot overwrite a live synthetic cross-block
   gesture.
9. Toolbar interaction must not cause caret restoration to steal focus.
10. Edgeless form and text controls must not bubble into object selection.
11. Selection remains local and never enters collaborative state or snapshots.
12. Deleting selected blocks, locally or remotely, cannot leave dangling IDs.

## Tests that define behavior

Unit tests verify:

- validation of all three variants;
- canonical ordering and duplicate removal for block IDs;
- rejection of edgeless selection in block mode;
- cleanup after mode changes and block deletion;
- reverse text selection preservation;
- exact clipboard normalization;
- whole-block cut behavior.

Chromium and Firefox tests verify browser-specific behavior:

- native selection spanning separate block hosts;
- exact forward and reverse partial endpoints;
- bottom-to-top paint before pointer-up;
- copy without side-control glyphs;
- atomic cross-block replacement by typing;
- handle selection upward and downward;
- Shift+Arrow block extension;
- blank-page rectangle selection;
- caret-aware multiline paste;
- edgeless text editing versus object selection;
- form controls retaining focus without selecting their canvas card.

Those E2E cases are not merely presentation tests. They protect the browser
timing and direction assumptions that motivate the portable selection model.
