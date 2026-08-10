# Demo keymap

This file describes the functional extensions installed by `demo/src/App.tsx`.
The behavior is supplied by `@chulane/rivto-react`; consumers may omit extensions
or remap supported bindings.

`Primary` means `Ctrl` on Windows/Linux and `Command` on macOS.

## Editing

| Input | Context | Result |
| --- | --- | --- |
| Typing | Text caret or text selection | Uses the native `contenteditable` input path and synchronizes the block text. |
| `Enter` | Editable block | Splits at the caret and creates a paragraph. If the expanded block has children, the new block becomes its first child; a collapsed block creates a next sibling. An empty nested paragraph outdents until it becomes a root instead of inserting another blank block. |
| `Enter` | Expanded editor selection | Deletes the selection atomically, then applies the normal Enter behavior at the surviving caret. |
| `Shift+Enter` | Editable block | Inserts a native line break inside the same block. |
| `Backspace` | Expanded text or block selection originating in editable content | Deletes the complete selection in one transaction. |
| `Backspace` | Caret after the start of a block | Uses native character deletion. |
| `Backspace` | Caret at the start of a nested block | Outdents the block. |
| `Backspace` | Caret at the start of a root block | Merges it into the previous visible editable block. |
| `Backspace` | First empty custom block | Converts it to a paragraph. Structural deletion may leave the document empty; the trailing page affordance creates the next paragraph. |
| `Delete` | Expanded text or block selection originating in editable content | Deletes the complete selection in one transaction. |
| `Delete` | Caret before the end of a block | Uses native forward character deletion. |
| `Delete` | Caret at the end of an expanded block | Merges the next visible editable block into the current block. A collapsed parent remains unchanged. |
| `Tab` | Editable block or structural selection | Indents the selected structural roots when the move is valid. |
| `Shift+Tab` | Editable block or structural selection | Outdents the selected structural roots when the move is valid. |
| `Primary+Z` | Anywhere inside the active editor | Undoes the latest local CRDT history item and restores a valid editor selection. |
| `Primary+Shift+Z` | Anywhere inside the active editor | Redoes the latest undone CRDT history item. |
| `Primary+Y` | Anywhere inside the active editor | Redoes the latest undone CRDT history item on every platform. |

Unmodified Enter, Backspace, and Delete ignore IME composition. Their
`Primary`, `Alt`, and unsupported `Shift` variants are left to the browser.

## Caret and keyboard selection

| Input | Starting state | Result |
| --- | --- | --- |
| `Left` / `Right` | Collapsed text caret | Moves natively inside a block. At offset zero/end, crosses to the previous/next editable block. |
| `Left` / `Right` | Expanded text selection | Collapses to the selection's document-order start/end. |
| `Shift+Left` / `Shift+Right` | Text | Native character selection inside the current editable block. |
| `Up` / `Down` | Text caret | Moves by rendered caret geometry, preserving the horizontal position across wrapped lines and adjacent blocks. |
| `Shift+Up` / `Shift+Down` | Text | Extends text on the current visual line. Crossing a block boundary changes to an inclusive whole-block selection. |
| `Up` / `Down` | Block selection | Replaces it with the adjacent visible block. |
| `Left` / `Right` | Block selection | Places a text caret at offset zero on the focus block. The reverse (text → block via Left/Right) is not implemented. |
| `Shift+Up` / `Shift+Down` | Block selection | Grows the selection in that direction, or shrinks it when reversing toward the anchor. |
| `Alt+Up` / `Alt+Down` | Text caret/range | First selects the current complete block. Repeated presses grow the block selection. |
| `Alt+Up` / `Alt+Down` | Block selection | Grows or shrinks from its active end. |
| `Alt+Shift+Up` / `Alt+Shift+Down` | Active block or block selection | Moves the active block or eligible same-parent selected roots atomically. A mixed-level selection falls back to the active block. |
| `Primary+Up` | Edited block or block selection | Collapses blocks that have children. |
| `Primary+Down` | Edited block or block selection | Expands the selected blocks. |
| `Primary+;` | Edited block or block selection | Toggles all targets using the first target's current state. |

## Pointer selection

| Gesture | Result |
| --- | --- |
| Click in text | Places a native caret. |
| Drag within one block | Creates a text selection. |
| Drag across blocks | Creates an inclusive whole-block selection. Selecting a parent visually covers its complete subtree as one rectangle. |
| `Alt+drag` across blocks | Preserves partial text at the endpoints and selects fully covered middle blocks. |
| `Shift+click` | Extends from the current anchor. It remains text in one block and becomes whole blocks after crossing a block boundary. |
| `Primary+click` | Toggles one complete block in a possibly non-contiguous block selection. |
| `Primary+Shift+click` | Same as `Primary+click`; Shift adds no second behavior while Primary is held. |

The cursor changes to a pointer while `Primary` is held. Drag handles are
excluded from click and text selection.

## Clipboard

| Input | Result |
| --- | --- |
| `Primary+C` | Copies the editor selection as Rivto structured data plus HTML and plain text. Selected parent blocks carry their complete subtrees. |
| `Primary+X` | Copies, then deletes the selection atomically. |
| `Primary+V` | Follows the copied selection type. Copied text pastes into a text target; copied blocks stay blocks. An expanded block with children receives pasted blocks as its first children; a collapsed block receives them after itself. |
| `Primary+Shift+V` | Pastes plain text into one block, preserving newline characters instead of creating sibling blocks. |

## Drag and drop

| Input | Result |
| --- | --- |
| Drag a block handle | Moves that block with its complete subtree. |
| Drag a handle belonging to an eligible same-parent block selection | Moves all selected roots together in visible order. Otherwise only the handle's block moves. |
| Drop over a block body | Appends inside the highlighted block. |
| Drop in a gap | Inserts at the horizontal line. Horizontal pointer movement chooses among structurally available indentation levels. |
| `Space` or `Enter` on a focused drag handle | Starts keyboard dragging through dnd-kit. |
| Arrow keys while keyboard dragging | Moves the candidate drop target. |
| `Space`, `Enter`, or `Tab` while keyboard dragging | Drops at the current candidate. |
| `Escape` while keyboard dragging | Cancels the drag. |

Dropping into a moved block's own subtree is rejected. There is no placement
animation after mouse or keyboard release. Dropping inside a collapsed block
keeps the inserted subtree hidden until that block is expanded.

## Slash commands

| Combination | Context | Result |
| --- | --- | --- |
| `/` | Anywhere in editable Markdown/Slider content | Inserts `/` as ordinary text and opens the command menu. |
| Text / `Backspace` | Open slash menu | Edits the collaborative query and filters commands. |
| `ArrowUp` / `ArrowDown` | Open slash menu | Moves through matching commands. |
| `Enter` | Open slash menu | Removes the active `/query` and executes the command as one undo step. |
| `Escape` | Open slash menu | Closes the menu and preserves `/query` in the block. |

Commands convert the current block to Markdown, Slider, or Counter; duplicate
or delete its complete subtree; and collapse or expand it when applicable.

## Edgeless canvas

| Input | Result |
| --- | --- |
| Click card chrome | Selects the complete root subtree as one canvas object. |
| Click text or a control | Edits text or activates the control without selecting the canvas object. |
| `Enter` in editable content | Uses the shared block splitter. A root always receives the split result as its first child; nested blocks retain page-mode insertion behavior. |
| `Tab` / `Shift+Tab` in editable content | Uses the shared structural indent/outdent behavior inside the card outline. |
| Caret / block-selection arrows, Alt+Shift reorder, merge/outdent Backspace/Delete | Same as page mode, scoped to the active card — navigation never crosses into another canvas element. |
| `Primary+click` inside a card | Toggles its owning root object; controls do not activate. |
| Drag empty canvas | Rectangle-selects intersecting root cards. |
| Drag `Move` | Moves one root, or every selected root when the handle belongs to the selection. |
| Drag a block `⋮⋮` handle | Uses the shared structural drag/drop behavior within the exact card under the pointer, including cross-card reorder and nesting. Blank canvas is not a drop target. |
| Drag resize corner | Resizes one root card, with a minimum size of 180×100. |
| Arrow keys (canvas selection active) | Moves selected roots by one canvas pixel. |
| `Shift+Arrow` (canvas selection active) | Moves selected roots by ten canvas pixels. |
| `Backspace` / `Delete` | For a structural block selection, the first press clears content and descendants while preserving each selected block; a second press deletes the empty blocks. Canvas object selection deletes selected elements. Text selections keep character / range deletion. |
| `Escape` | Cancels an active transform or clears object selection. |
| Native scroll / wheel | Scrolls the 2400×1600 canvas viewport. |
| Space+drag / middle-button drag | Pans by changing native viewport scroll offsets. |
| `Primary+wheel` | Zooms around the pointer between 50% and 200%. |

Page/Edgeless mode buttons clear local selection but retain the same document,
hierarchy, layouts, custom properties, and undo history. Collapse shortcuts work
inside a card the same way as on the page.

## Not currently bound

- `Primary+A` has no editor-wide select-all command; native browser behavior applies.

## Binding IDs and remapping

Built-in actions are remapped once when `createReactEditor` is called. An empty
array disables an action. Unknown IDs are ignored, so one preferences object
can be shared by applications with different extension sets.

```ts
createReactEditor({
  editor,
  extensions: [standardPreset()],
  keymap: {
    "block.indent": ["Primary+ArrowRight"],
    "history.redo": [],
  },
});
```

| Binding ID | Default |
| --- | --- |
| `history.undo` / `history.redo` | `Primary+Z` / `Primary+Shift+Z`, `Primary+Y` |
| `clipboard.paste-as-plain-text` | `Primary+Shift+V` |
| `block.create` | `Enter` |
| `selection.delete` | `Backspace`, `Delete` |
| `block.outdent-at-start` | `Backspace` |
| `block.merge-backward` / `block.merge-forward` | `Backspace` / `Delete` |
| `block.reset-empty` | `Backspace` |
| `block.indent` / `block.outdent` | `Tab` / `Shift+Tab` |
| `caret.left`, `caret.right`, `caret.up`, `caret.down` | Corresponding unmodified arrow |
| `caret.extend-up` / `caret.extend-down` | `Shift+ArrowUp` / `Shift+ArrowDown` |
| `selection.block-up` / `selection.block-down` | `ArrowUp` / `ArrowDown` |
| `selection.block-caret-left` / `selection.block-caret-right` | `ArrowLeft` / `ArrowRight` |
| `selection.block-extend-up` / `selection.block-extend-down` | `Shift+ArrowUp` / `Shift+ArrowDown` |
| `selection.block-grow-up` / `selection.block-grow-down` | `Alt+ArrowUp` / `Alt+ArrowDown` |
| `block.move-up` / `block.move-down` | `Alt+Shift+ArrowUp` / `Alt+Shift+ArrowDown` |
| `block.collapse` / `block.expand` / `block.toggle-collapse` | `Primary+ArrowUp` / `Primary+ArrowDown` / `Primary+;` |
| `slash.previous` / `slash.next` / `slash.execute` / `slash.close` | `ArrowUp` / `ArrowDown` / `Enter` / `Escape` |
| `edgeless.selection-clear` / `edgeless.selection-delete` | `Escape` / `Backspace`, `Delete` |
| `edgeless.move-*` | Arrow keys |
| `edgeless.move-fast-*` | `Shift+Arrow` keys |
| `edgeless.transform-cancel` | `Escape` |
| `edgeless.pan-start` / `edgeless.pan-stop` | `Space` keydown / keyup |
