# Selection in Rivto

How selection really works: portable core state, browser DOM ranges, and the
React extensions that keep them aligned. Written for developers who need to read
the code without already knowing browser selection APIs.

Sibling docs: [`developer-guide.md`](./developer-guide.md),
[`events.md`](./events.md), [`markdown-rendering.md`](./markdown-rendering.md).

Longer tutorial material under `dev_notes/tutorials/selection-and-clipboard/`
is useful for browser basics, but some file paths/attributes there are stale.
Prefer this document and the current source for contracts.

---

## 1. The one idea to keep

Rivto keeps **two** selections that must stay synchronized:

```text
Browser selection                          Rivto selection
window.getSelection()                      editor.selection.get()
DOM node + offset                          blockId + UTF-16 offset
dies when React replaces nodes             survives rerender / mode switch
drives the visible caret                   drives commands, clipboard, extensions
```

Why both exist:

1. Each editable block is its **own** `contenteditable`. Browsers do not
   reliably keep one native range across several hosts.
2. React may replace text nodes after every remote/model update. Storing a
   `Text` node pointer would become stale.
3. Clipboard and structural commands need a serializer-friendly value that does
   not depend on the current DOM tree.

Core owns the portable list. React extensions own the bridge.

---

## 2. Data model (core)

Types live in `src/editor/types.ts` (`@chulane/rivto`).

### Position

```ts
interface EditorPosition {
  blockId: string;
  offset: number; // UTF-16, 0 … content.length (length = caret after last char)
}
```

### Two item kinds

```ts
type EditorSelectionItem =
  | { type: "text"; anchor: EditorPosition; head: EditorPosition }
  | {
      type: "block";
      blockIds: string[];      // visible document order, top → bottom
      anchorBlockId: string;   // where the gesture started
      focusBlockId: string;    // active moving end
    };
```

### Selection is a list

```ts
type EditorSelection = EditorSelectionItem[];
```

Empty list `[]` means “no selection”. This is not `null`.

A list can be **heterogeneous**. The important case is Alt+cross-block text
drag:

```ts
[
  { type: "text", anchor: { blockId: "A", offset: 2 }, head: { blockId: "C", offset: 3 } },
  { type: "block", blockIds: ["B"], anchorBlockId: "B", focusBlockId: "B" },
]
```

Meaning:

- exact partial text at the ends (`A` and `C`);
- every fully covered middle block (`B`) as a whole-block item.

Commands that mutate content call `editor.selection.normalize()`, which
collapses the list into one document-order `start`/`end` range before
Copy/Cut/Paste/delete.

### Direction is intentional

`anchor` / `head` (and `anchorBlockId` / `focusBlockId`) are **not** sorted.

```text
gesture semantics:  where the user started → where they are now
document range:     earliest position → latest position in tree order
```

UI and Shift+Arrow need gesture direction. Clipboard needs document order.
Both are available because direction is preserved until a mutator normalizes.

### Selection is local, not collaborative

`SelectionManager` (`src/managers/selection-manager/selection-manager.ts`) stores a detached copy
per editor session. It is not in the CRDT document. Reasons: different users
have different carets; caret churn is high; reloads do not need old carets.

Use the editor-owned selection manager:

```ts
editor.selection.set(selection);
editor.selection.clear();
```

Never mutate the array returned by `editor.selection.get()` — it is a clone.
Because the manager owns its editor, `set()` validates against the latest
document before publishing.

`reactEditor.selection` is DOM-only. Its `readDOM`, `restoreDOM`,
`clearDOMHighlight`, and `updateDOMHighlight` methods always resolve the current
surface root through the event manager. Structured state always goes through
`reactEditor.editor.selection`.

### Validation and reconciliation (`Editor`)

On `editor.selection.set()`:

- text positions must exist; offsets must be integers in
  `0 … content.length`;
- block IDs must exist; endpoints must be members of `blockIds`;
- `blockIds` are reordered to tree traversal order;

On every document change, `reconcileSelection()`:

- clamps text offsets if content shrank;
- drops items whose blocks disappeared;
- rebuilds surviving block selections with directional endpoint repair.

Changing page/edgeless mode does not translate or clear selection. Both
surfaces render the same `BlockSelection`, including nested block IDs.

Collapse of page outline is handled separately in React by
`reconcileCollapsedSelection()` (`extensions/page/page-selection-utils.ts`): hidden
endpoints become their collapsed ancestor (often converting text → block).

---

## 3. Who owns which layer

| Layer | Owner | Responsibility |
| --- | --- | --- |
| Portable list and mutation range | `@chulane/rivto` `SelectionManager` | Store, validate, normalize, delete, notify |
| Reconcile after document changes | `Editor` | Repair IDs, offsets, and tree order |
| DOM ↔ portable bridge | `textSelectionExtension` | Pointer + `selectionchange` |
| Whole-block UX | selection extensions | Plain structural-anchor click and Ctrl/Cmd BlockView toggle |
| Caret / Shift+Arrow | `caretNavigationExtension`, `blockSelectionNavigationExtension` | Keyboard |
| Delete expanded selection | `selectionDeletionExtension` | Backspace/Delete |
| Canvas object UX | `edgelessSelectionExtension` | Card click / marquee |
| Visual whole-block chrome | surfaces via `useBlockSelection` → `data-block-selected` | Outline/background |
| Cross-host text paint | `updateTextSelectionHighlight` | CSS Highlight or `data-text-selection-fallback` |

`EditorView` does **not** own selection sync. The extensions above do.

---

## 4. DOM contract the bridge relies on

Selection code does not care about React component trees. It queries:

| Marker | Source | Role |
| --- | --- | --- |
| `data-block-id` | `BlockView` | Locate block containers |
| `data-block-type` | `BlockView` | Type metadata |
| `data-block-selected` | `BlockView` when surface says selected | Reflected whole-block presentation state |
| `data-block-content` | `useBlockEditing()` | Editable host / offset origin |
| `data-block-selection-anchor` | Every `useBlockEditing()` mode | Region from which a selection gesture may begin |
| `data-text-selection-fallback` | highlight fallback | Coarse paint only when CSS Highlight is unavailable |
| `data-block-selecting` | block selection extension | Root cursor while Ctrl/Cmd held |
| `data-edgeless-root` | edgeless surface | Object selection target |

Offsets are measured from the plain text of `[data-block-content]`, not from
Markdown preview HTML. That matches persisted `block.content`.

---

## 5. Text selection (page and inside cards)

Implementation: `extensions/selection/text-selection.ts` +
`managers/selection/editor-dom-selection.ts`.

### Same-block (browser owns the gesture)

```text
pointerdown inside [data-block-selection-anchor]
  → native isContentEditable chooses the text path
  → extension records portable anchor (blockId + offset)
  → browser draws native caret/range inside that one host
  → document "selectionchange"
  → readEditorDOMSelection(root)
  → editor.selection.set(selection)
  → updateTextSelectionHighlight (no-op for same-block)
```

Inside one host, Rivto mostly trusts the browser. The portable value is still
recorded so commands/clipboard work after focus leaves the editable.

### Cross-block default = whole blocks

If the pointer crosses into another editable host **without Alt** at
pointer-down:

```text
publish() sets wholeBlocks = true
  → createBlockSelection(orderedBlockIds(root), anchorBlockId, focusBlockId)
  → editor.selection.set([{ type: "block", … }])
  → removeAllRanges()  (no native text caret)
  → keep originating contenteditable focused during the gesture
  → on pointerup: focus the surface root
```

So a normal drag from paragraph A into paragraph C selects A…C as **blocks**,
not partial characters.

### Cross-block with Alt = partial text + middle blocks

Alt held at **pointer-down** sets `textAcrossBlocks`:

```text
createDOMSelectionItems(root, anchor, head)
  → [ TextSelection, optional middle BlockSelection ]
  → setNativeSelection(anchorDOM, headDOM) via setBaseAndExtent
  → updateTextSelectionHighlight(...)
```

Chromium often collapses/reverses native ranges across hosts. The plugin:

1. freezes the pointer-down DOM/portable anchor;
2. resolves every move with `readDOMSelectionPoint(root, x, y)`;
3. calls `preventDefault` once the gesture has crossed hosts;
4. republishes even if the pointer returns to the original block, so `head`
   follows the mouse instead of freezing.

### Ownership guard during synthetic drag

While `ownsCrossBlockSelection` is true, the `selectionchange` listener
**ignores** browser noise. Without that guard:

```text
plugin publishes A:2 → C:3
browser emits temporary selection only inside C
selectionchange would overwrite and lose A
```

After pointer-up, a zero-delay timer keeps owning one more task because Firefox
and Chromium may emit a late `selectionchange`.

### Shift-click extend

- Existing **block** selection + Shift+click → extend block range from stored
  `anchorBlockId` to clicked block.
- Existing **text** selection + Shift+click → keep text anchor, publish new
  head (may become whole-block or Alt-style text depending on `altKey` at this
  click’s pointer-down — Alt is read from the new event).

Ctrl/Cmd at pointer-down aborts text gesture setup so page block toggle can run
(see below).

### Reading / writing DOM helpers

| Function | Purpose |
| --- | --- |
| `readDOMSelectionPoint` | viewport (x,y) → DOM endpoint (caret APIs + nearest-text fallback) |
| `readDOMPointPosition` | DOM endpoint → `{ blockId, offset }` |
| `readEditorDOMSelection` | native Selection → portable list (uses anchor/focus, **not** Range start/end, to keep direction) |
| `createSelectionItems` / `createDOMSelectionItems` | directed text + middle blocks |
| `createBlockSelection` | inclusive whole-block range |
| `setNativeSelection` | `setBaseAndExtent`, Range fallback if rejected |
| `resolveDOMSelectionPoint` | portable position → live DOM endpoint |
| `restoreEditorDOMSelection` | after structural commands: re-resolve + focus head + highlight |
| `updateTextSelectionHighlight` | CSS `Highlight` named `rivto-text-selection`, else `data-text-selection-fallback` |
| `saveDOMSelection` / `restoreDOMSelection` | **intra-element** caret save while `textContent` is rewritten (`useBlockEditing`) |

Do not confuse the two restore paths:

- `restoreDOMSelection` — same contenteditable, text nodes replaced.
- `restoreEditorDOMSelection` — portable editor selection after React reparent.

---

## 6. Page whole-block selection

Implementation: `extensions/selection/block-selection.ts` and
`extensions/page/page-selection-utils.ts`.

### How users get a block selection

1. **Drag across blocks** (default text plugin path above).
2. **Plain-click a non-editable `data-block-selection-anchor` region** — replaces
   the current selection with that complete block. Buttons, inputs, links, and
   other interactive descendants keep their native activation.
3. **Ctrl/Cmd + click** a `BlockView` — toggles membership in a block
   selection (`toggleBlockSelection`). Capture-phase handler claims the event
   so the browser does not place a caret.
4. **Shift+Arrow** once a block selection exists
   (`registerBlockSelectionNavigation` / `extendBlockSelection`).
5. **Shift+Arrow from text** across a block boundary
   (`registerCaretNavigation`) converts to a block selection.
6. Slash delete / duplicate temporarily set a block selection around one ID.

While Ctrl/Cmd is held, the root gets `data-block-selecting="true"` so CSS can
show a block-select cursor.

After a block selection is committed, focus usually moves to the **surface
root** (`tabIndex={-1}`), not an editable. That is why deletion bindings must
allow “root focused + block selection”, not only “event inside editable”.

### What `useBlockSelection(blockId)` returns

Only a `type: "block"` item that includes the ID.
**Text selections never make a block look selected**, even if the caret is
inside it. Surfaces pass that into `BlockView.isSelected`, which reflects
presentation state as `data-block-selected`.

### Visible order

`pageEntries()` flattens the outline depth-first and normally **skips collapsed
children**. Page arrow/extend/toggle use that visible list. Edgeless block
toggle includes collapsed descendants because cards render their complete
subtrees.

---

## 7. Edgeless (canvas) selection

Implementation: `extensions/edgeless/edgeless-selection.tsx`.

Intent split:

```text
click card chrome                   → root BlockSelection
click [data-block-content] / input  → leave alone → text plugin / native focus
Ctrl/Cmd + click any BlockView      → toggle that root or nested block
drag on empty plane                 → marquee; rootsInRect → root BlockSelection
Escape                              → clear block selection
```

Guards that matter:

- Interactive targets (`contenteditable`, `input`, `button`, …) must **not**
  become object selection, or typing breaks after a text click bubbles to the
  card.
- Drag/resize handles are ignored by selection (the transform extension
  owns them).
- Space-pan (`data-panning-ready`) suppresses object gestures.
- Nested blocks remain independently selectable even though only
  `[data-edgeless-root]` cards have canvas geometry.
- Move/resize commands project selected nested IDs to unique owning roots via
  `owningRootIds`; they do not rewrite the selection.

Text editing inside a card still uses `type: "text"` and the same text-selection extension.

---

## 8. Keyboard paths that change selection

| Binding family | Extension | Behavior |
| --- | --- | --- |
| Arrows | `caretNavigationExtension` | Move caret; at block edges jump hosts; wrapped-line geometry via `verticalCaretPosition` |
| Shift+Up/Down (text) | same | Extend text head; crossing hosts → **block** selection |
| Up/Down / Shift+Up/Down (block) | `blockSelectionNavigationExtension` | Move or grow whole-block selection |
| Left/Right (block) | same | Enter a text caret at offset 0 on the focus block (one-way) |
| Alt+Shift+Up/Down | `keyboardBlockMoveExtension` | Move selected sibling group structurally |
| Backspace/Delete (expanded) | `selectionDeletionExtension` | `editor.deleteSelection()` then restore caret |
| Backspace at start / Delete at end | merge / outdent / empty-reset extensions | Only when selection is a collapsed caret |
| Backspace/Delete (empty writing after structural sibling) | merge extensions | Remove the root empty writer; promote its first child unless collapsed; select predecessor |
| Edgeless arrows | `edgelessMovementExtension` | Nudge selected roots; does not create text carets |
| Edgeless Backspace/Delete (block) | `edgelessDeletionExtension` | Clear selected top-level blocks first; delete them only when all are already empty leaves |

`firstKeyboardTarget(selection)` in
`managers/events/selection.ts` reads
**only the first list item**. Enter creates one block from that target; in
edgeless mode a root always receives it as the first child. Structural indent
expands from the full selection in core.

`shouldDeleteSelection` is true unless the entire list is exactly one collapsed
text caret — so multi-item Alt selections delete as a range.

Edgeless two-stage deletion applies only to `BlockSelection`. It first reduces
the selection to blocks without another selected ancestor. If any survivor has
content or children, one batch clears every survivor and keeps the selection;
the next Backspace/Delete removes those now-empty blocks. Text carets and ranges
continue through the ordinary character/range deletion paths.

Timing quirk: a keypress right after click can beat `selectionchange`. Arrow
plugins call `currentSelection()` which falls back to
`readEditorDOMSelection(root)` when the manager is still empty.

---

## 9. How other features consume selection

### Clipboard

`editor.selection.normalize()` produces `{ start, end, blocks }`.

- Text (and mixed text+middle-blocks): character range from earliest to latest
  endpoint.
- Pure block: whole blocks from first ID offset `0` through last ID
  `content.length`.

Copy/cut clone top-level subtrees once (children already covered by a selected
ancestor are not duplicated). Paste replaces the normalized range.

### Deletion

`editor.deleteSelection()` delegates to the selection manager's normalized
deletion workflow. Afterward
The selection-deletion extension focuses the resulting caret on the next frame.

### Collapse

The collapse extension runs `reconcileCollapsedSelection` after a collapse
change so a newly hidden endpoint moves to its collapsed ancestor. A mode
switch alone never rewrites selection.

### Drag / keyboard move

`selectedMoveRoots` prefers a sibling group of selected roots; selected
descendants of a selected ancestor are omitted so the parent carries the
subtree.

---

## 10. Bidirectional sync map

```text
                 pointer / keys / selectionchange
                              │
                              ▼
                 React selection extensions
                              │
              editor.selection.set() / clear()
                              │
                              ▼
                 Editor validation
                              │
                              ▼
                 SelectionManager  ──subscribe──► focused selection hooks
                              │                         │
                              ▼                         ▼
                 restoreEditorDOMSelection      useBlockSelection → data-block-selected
                 updateTextSelectionHighlight   Markdown focus / preview
                 focus surface root or content
```

Important asymmetries:

- Losing the browser range clears **only text items**. A block selection can
  remain while native ranges are empty (common after block select).
- Clicking a toolbar does not require clearing portable selection; text selection
  ignore out-of-root `selectionchange` results instead of wiping state.
- `updateTextSelectionHighlight` runs from a layout effect on every selection
  change **and** during active cross-block pointermove, because Chromium may
  delay React commits until pointer-up.

---

## 11. Mental FAQs

**Why does dragging across paragraphs select whole blocks?**  
Product choice. Hold Alt at pointer-down for partial text across
hosts.

**Why is selection an array?**  
So partial ends + full middle blocks can coexist for Alt-drag and for future
multi-range work. Mutators normalize to one range.

**Why focus the page root after block select?**  
Block selection is structural, not a text caret. Root focus lets Delete/Backspace
bindings run without a contenteditable caret fighting the UI.

**Why `useBlockSelection` ignores text?**  
Caret inside a paragraph must not paint the whole row as selected.

**Why store direction if clipboard sorts it away?**  
Shift+Arrow and reverse drags need the active end. Clipboard only needs
geometry.

**Why not put selection in Yjs?**  
It is per-user, high-churn, session UI state.

**What breaks if I remove `data-block-content`?**  
Text offsets, caret restore, and keyboard targeting stop working. Pointer
eligibility still comes from `data-block-selection-anchor`.

**What is `ownsCrossBlockSelection`?**  
A short-lived “plugin owns the truth” flag so noisy browser
`selectionchange` events cannot clobber a synthetic cross-host gesture.

**Same-block typing vs remote update?**  
`useBlockEditing` skips rewriting DOM when focused text already matches
the model (caret stays). On mismatch it saves offsets, writes `textContent`,
restores with `restoreDOMSelection`.

---

## 12. File map

| Path | Role |
| --- | --- |
| `src/editor/types.ts` | Position + selection item types |
| `src/managers/selection-manager/selection-manager.ts` | Detached list, validation, normalization, deletion |
| `src/editor/rivto-editor.ts` | Selection reconciliation and typed editor methods |
| `src/managers/clipboard-manager/clipboard-manager.ts` | Clipboard workflows and history boundary |
| `src/managers/clipboard-manager/utils/clipboard.ts` | Stateless clipboard transformations |
| `packages/react-rivto-editor/src/extensions/selection/text-selection.ts` | DOM ↔ portable sync, cross-host gestures |
| `packages/react-rivto-editor/src/managers/selection/selection-manager.ts` | Core delegate + active-root DOM API |
| `packages/react-rivto-editor/src/managers/selection/editor-dom-selection.ts` | Conversion, restore, highlight |
| `packages/react-rivto-editor/src/managers/selection/dom-text-selection.ts` | Save/restore inside one editable |
| `packages/react-rivto-editor/src/extensions/selection/block-selection.ts` | Ctrl/Cmd block toggle on both surfaces |
| `packages/react-rivto-editor/src/extensions/page/page-navigation.ts` | Caret + block keyboard navigation |
| `packages/react-rivto-editor/src/extensions/selection/selection-deletion.ts` | Delete expanded selection |
| `packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection.tsx` | Canvas object / marquee |
| `packages/react-rivto-editor/src/extensions/page/page-selection-utils.ts` | Visible order, toggle/extend/collapse reconcile |
| `packages/react-rivto-editor/.../use-block-selection.ts` | Whole-block selected? for UI |
| `e2e/selection.spec.ts` | Browser-level selection regressions |

---

## 13. Suggested reading order for selection only

1. `src/editor/types.ts` — shapes.
2. `SelectionManager.set` + `Editor.reconcileSelection`.
3. `editor-dom-selection.ts` — conversion primitives.
4. `text-selection.ts` top-to-bottom — same-block vs cross-block vs Alt.
5. `block-selection.ts` + `page-selection-utils.ts`.
6. `page-navigation.ts` caret vs block navigation.
7. `edgeless-selection.tsx`.
8. `SelectionManager.normalize` + its tests in `src/editor/__tests__/selection-manager.test.ts`.
9. `e2e/selection.spec.ts` for user-visible invariants.
