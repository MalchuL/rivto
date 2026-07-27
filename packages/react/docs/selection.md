# Selection in Rivto

How selection really works: portable core state, browser DOM ranges, and the
React plugins that keep them aligned. Written for developers who need to read
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
drives the visible caret                   drives commands, clipboard, plugins
```

Why both exist:

1. Each editable block is its **own** `contenteditable`. Browsers do not
   reliably keep one native range across several hosts.
2. React may replace text nodes after every remote/model update. Storing a
   `Text` node pointer would become stale.
3. Clipboard and structural commands need a serializer-friendly value that does
   not depend on the current DOM tree.

Core owns the portable list. React plugins own the bridge.

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

### Three item kinds

```ts
type EditorSelectionItem =
  | { type: "text"; anchor: EditorPosition; head: EditorPosition }
  | {
      type: "block";
      blockIds: string[];      // visible document order, top → bottom
      anchorBlockId: string;   // where the gesture started
      focusBlockId: string;    // active moving end
    }
  | { type: "edgeless"; blockIds: string[] };
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
document and active mode before publishing.

`reactEditor.selection` is DOM-only. Its `readDOM`, `restoreDOM`,
`clearDOMHighlight`, and `updateDOMHighlight` methods always resolve the current
surface root through the event manager. Structured state always goes through
`reactEditor.editor.selection`.

### Validation and reconciliation (`RivtoEditor`)

On `editor.selection.set()` (and its compatibility `selection.set` command):

- text positions must exist; offsets must be integers in
  `0 … content.length`;
- block IDs must exist; endpoints must be members of `blockIds`;
- `blockIds` are reordered to tree traversal order;
- edgeless items require `mode === "edgeless"`.

On every document change / mode change, `reconcileSelection()`:

- clamps text offsets if content shrank;
- drops items whose blocks disappeared;
- drops edgeless items when leaving edgeless mode;
- rebuilds surviving block selections with directional endpoint repair.

Collapse of page outline is handled separately in React by
`reconcileCollapsedSelection()` (`plugins/utils/page-selection.ts`): hidden
endpoints become their collapsed ancestor (often converting text → block).

---

## 3. Who owns which layer

| Layer | Owner | Responsibility |
| --- | --- | --- |
| Portable list and mutation range | `@chulane/rivto` `SelectionManager` | Store, validate, normalize, delete, notify |
| Reconcile after document changes | `RivtoEditor` | Repair IDs, offsets, mode, tree order |
| DOM ↔ portable bridge | `textSelectionPlugin` | Pointer + `selectionchange` |
| Page whole-block UX | `pageSelectionPlugin` | Ctrl/Cmd click toggle |
| Caret / Shift+Arrow | `caretNavigationPlugin`, `blockSelectionNavigationPlugin` | Keyboard |
| Delete expanded selection | `selectionDeletionPlugin` | Backspace/Delete |
| Canvas object UX | `edgelessSelectionPlugin` | Card click / marquee |
| Visual whole-block chrome | surfaces via `useBlockSelection` → `data-selected` | Outline/background |
| Cross-host text paint | `updateTextSelectionHighlight` | CSS Highlight or `data-text-selected` |

`EditorView` does **not** own selection sync. The plugins above do.

---

## 4. DOM contract the bridge relies on

Selection code does not care about React component trees. It queries:

| Marker | Source | Role |
| --- | --- | --- |
| `data-block-id` | `BlockView` | Locate block containers |
| `data-block-type` | `BlockView` | Type metadata |
| `data-selected` | `BlockView` when surface says selected | Whole-block chrome |
| `data-block-content` | `useBlockEditing()` | Editable host / offset origin |
| `data-block-selection-anchor` | `useBlockEditing({ textEdit: false })` | Structural drag anchor |
| `data-text-selected` | highlight fallback | Coarse cross-block paint |
| `data-block-selecting` | page block plugin | Root cursor while Ctrl/Cmd held |
| `data-edgeless-root` | edgeless surface | Object selection target |

Offsets are measured from the plain text of `[data-block-content]`, not from
Markdown preview HTML. That matches persisted `block.content`.

---

## 5. Text selection (page and inside cards)

Implementation: `plugins/text-selection-plugin.tsx` +
`managers/selection/selection-manager/utils/editor-dom-selection.ts`.

### Same-block (browser owns the gesture)

```text
pointerdown inside [data-block-content]
  → plugin records portable anchor (blockId + offset) in a ref
  → browser draws native caret/range inside that one host
  → document "selectionchange"
  → readEditorDOMSelection(root)
  → editor.selection.set(selection)
  → updateTextSelectionHighlight (no-op for same-block)
```

Inside one host, Rivto mostly trusts the browser. The portable value is still
recorded so commands/clipboard work after focus leaves the editable.

### Cross-block default = whole blocks (Logseq-like)

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
| `updateTextSelectionHighlight` | CSS `Highlight` named `rivto-text-selection`, else `data-text-selected` |
| `saveDOMSelection` / `restoreDOMSelection` | **intra-element** caret save while `textContent` is rewritten (`useBlockEditing`) |

Do not confuse the two restore paths:

- `restoreDOMSelection` — same contenteditable, text nodes replaced.
- `restoreEditorDOMSelection` — portable editor selection after React reparent.

---

## 6. Page whole-block selection

Implementation: `PageBlockSelectionPlugin` + `plugins/utils/page-selection.ts`.

### How users get a block selection

1. **Drag across blocks** (default text plugin path above).
2. **Ctrl/Cmd + click** a `BlockView` — toggles membership in a block
   selection (`toggleBlockSelection`). Capture-phase handler claims the event
   so the browser does not place a caret.
3. **Shift+Arrow** once a block selection exists
   (`BlockSelectionNavigationPlugin` / `extendBlockSelection`).
4. **Shift+Arrow from text** across a block boundary
   (`CaretNavigationPlugin.extendText`) converts to a block selection.
5. Slash delete / duplicate temporarily set a block selection around one ID.

While Ctrl/Cmd is held, the root gets `data-block-selecting="true"` so CSS can
show a block-select cursor.

After a block selection is committed, focus usually moves to the **surface
root** (`tabIndex={-1}`), not an editable. That is why deletion bindings must
allow “root focused + block selection”, not only “event inside editable”.

### What `useBlockSelection(blockId)` returns

Only `type: "block"` or `type: "edgeless"` items that include the ID.
**Text selections never make a block look selected**, even if the caret is
inside it. Surfaces pass that into `BlockView`’s `selected` → `data-selected`.

### Visible order

`pageEntries()` flattens the outline depth-first and **skips collapsed
children**. Arrow/extend/toggle all use that visible list, matching what the
user sees.

---

## 7. Edgeless (canvas) selection

Implementation: `EdgelessSelectionPlugin`.

Intent split:

```text
click card chrome / empty plane     → type: "edgeless" (object)
click [data-block-content] / input  → leave alone → text plugin / native focus
Ctrl/Cmd + click card               → toggle multi object selection
drag on empty plane                 → marquee; rootsInRect → edgeless IDs
Escape                              → clear edgeless selection
```

Guards that matter:

- Interactive targets (`contenteditable`, `input`, `button`, …) must **not**
  become object selection, or typing breaks after a text click bubbles to the
  card.
- Drag/resize handles are ignored by the selection plugin (transform plugin
  owns them).
- Space-pan (`data-panning-ready`) suppresses object gestures.
- Only `[data-edgeless-root]` cards are object targets; nested blocks are text
  endpoints, not independently movable objects.
- If something publishes a page-style `block` selection while in edgeless mode,
  an effect remaps it to owning root IDs via `owningRootIds`.

Text editing inside a card still uses `type: "text"` and the same text plugin.

---

## 8. Keyboard paths that change selection

| Binding family | Plugin | Behavior |
| --- | --- | --- |
| Arrows | `CaretNavigationPlugin` | Move caret; at block edges jump hosts; wrapped-line geometry via `verticalCaretPosition` |
| Shift+Up/Down (text) | same | Extend text head; crossing hosts → **block** selection |
| Arrows / Shift+Arrows (block) | `BlockSelectionNavigationPlugin` | Move or grow whole-block selection |
| Alt+Shift+Up/Down | `KeyboardBlockMovePlugin` | Move selected sibling group structurally |
| Backspace/Delete (expanded) | `SelectionDeletionPlugin` | `editor.deleteSelection()` then restore caret |
| Backspace at start / Delete at end | merge / outdent / empty-reset plugins | Only when selection is a collapsed caret |
| Edgeless arrows | `edgelessMovementPlugin` | Nudge selected roots; does not create text carets |

`firstKeyboardTarget(selection)` in
`managers/events/keyboard-event-manager/utils/selection.ts` reads
**only the first list item**. Enter creates one block after that target;
structural indent expands from the full selection in core.

`shouldDeleteSelection` is true unless the entire list is exactly one collapsed
text caret — so multi-item Alt selections delete as a range.

Timing quirk: a keypress right after click can beat `selectionchange`. Arrow
plugins call `currentSelection()` which falls back to
`readEditorDOMSelection(root)` when the manager is still empty.

---

## 9. How other features consume selection

### Clipboard

`editor.selection.normalize()` produces `{ start, end, blocks }`.

- Text (and mixed text+middle-blocks): character range from earliest to latest
  endpoint.
- Pure block/edgeless: whole blocks from first ID offset `0` through last ID
  `content.length`.

Copy/cut clone top-level subtrees once (children already covered by a selected
ancestor are not duplicated). Paste replaces the normalized range.

### Deletion

`editor.selection.delete()` owns the deletion; `editor.deleteSelection()` is
the compatibility command delegate. Both use the same normalization. Afterward
`SelectionDeletionPlugin` focuses the resulting caret on the next frame.

### Collapse

`PageCollapsePlugin` runs `reconcileCollapsedSelection` so a selection cannot
point at DOM that page mode no longer renders.

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
                 React selection plugins
                              │
              editor.selection.set() / clear()
                              │
                              ▼
                 RivtoEditor validation
                              │
                              ▼
                 SelectionManager  ──subscribe──► editor revision
                              │                         │
                              │                         ▼
                              │                   EditorView / hooks
                              │                         │
                              ▼                         ▼
                 restoreEditorDOMSelection      useBlockSelection → data-selected
                 updateTextSelectionHighlight   Markdown focus / preview
                 focus surface root or content
```

Important asymmetries:

- Losing the browser range clears **only text items**. A block/edgeless
  selection can remain while native ranges are empty (common after block
  select).
- Clicking a toolbar does not require clearing portable selection; text plugins
  ignore out-of-root `selectionchange` results instead of wiping state.
- `updateTextSelectionHighlight` runs from a layout effect on every selection
  change **and** during active cross-block pointermove, because Chromium may
  delay React commits until pointer-up.

---

## 11. Mental FAQs

**Why does dragging across paragraphs select whole blocks?**  
Product choice (Logseq-like). Hold Alt at pointer-down for partial text across
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
Offsets, text plugin, caret restore, and most keyboard targeting stop working.

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
| `src/editor/rivto-editor.ts` | Selection reconciliation and compatibility commands |
| `src/managers/clipboard-manager/clipboard-manager.ts` | Clipboard workflows and history boundary |
| `src/managers/clipboard-manager/utils/clipboard.ts` | Stateless clipboard transformations |
| `packages/react/.../text-selection-plugin.tsx` | DOM ↔ portable sync, cross-host gestures |
| `packages/react/src/managers/selection/selection-manager/` | Core delegate + active-root DOM API |
| `packages/react/.../selection-manager/utils/editor-dom-selection.ts` | Conversion, restore, highlight |
| `packages/react/.../selection-manager/utils/dom-text-selection.ts` | Save/restore inside one editable |
| `packages/react/.../PageBlockSelectionPlugin.tsx` | Ctrl/Cmd block toggle |
| `packages/react/.../PageArrowPlugin.tsx` | Caret + block keyboard navigation |
| `packages/react/.../SelectionDeletionPlugin.tsx` | Delete expanded selection |
| `packages/react/.../EdgelessSelectionPlugin.tsx` | Canvas object / marquee |
| `packages/react/.../page-selection.ts` | Visible order, toggle/extend/collapse reconcile |
| `packages/react/.../use-block-selection.ts` | Whole-block selected? for UI |
| `e2e/selection.spec.ts` | Browser-level selection regressions |

---

## 13. Suggested reading order for selection only

1. `src/editor/types.ts` — shapes.
2. `SelectionManager.set` + `RivtoEditor.reconcileSelection`.
3. `editor-dom-selection.ts` — conversion primitives.
4. `text-selection-plugin.tsx` top-to-bottom — same-block vs cross-block vs Alt.
5. `PageBlockSelectionPlugin` + `page-selection.ts`.
6. `PageArrowPlugin` caret vs block navigation.
7. `EdgelessSelectionPlugin`.
8. `SelectionManager.normalize` + its tests in `src/editor/__tests__/selection-manager.test.ts`.
9. `e2e/selection.spec.ts` for user-visible invariants.
