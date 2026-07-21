# Demo keymap

This file describes the interactions currently installed by `demo/src/App.tsx`.
It is a reference for the demo page surface, not a list of commands guaranteed
by the UI-agnostic React package.

`Primary` means `Ctrl` on Windows/Linux and `Command` on macOS.

## Editing

| Input | Context | Result |
| --- | --- | --- |
| Typing | Text caret or text selection | Uses the native `contenteditable` input path and synchronizes the block text. |
| `Enter` | Editable block | Splits at the caret. List items continue the same list type; other blocks create a paragraph. If the expanded block has children, the new block becomes its first child; a collapsed block creates a next sibling. |
| `Enter` | Expanded editor selection | Deletes the selection atomically, then applies the normal Enter behavior at the surviving caret. |
| `Shift+Enter` | Editable block | Inserts a native line break inside the same block. |
| `Backspace` | Expanded text or block selection originating in editable content | Deletes the complete selection in one transaction. |
| `Backspace` | Caret after the start of a block | Uses native character deletion. |
| `Backspace` | Caret at the start of a nested block | Outdents the block. |
| `Backspace` | Caret at the start of a root block | Merges it into the previous visible editable block. |
| `Backspace` | First empty non-paragraph | Converts it to a paragraph. The final empty paragraph is retained. |
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
| `Primary+Shift+V` | Explicitly keeps structured partial-text data as blocks. Whole-block and external plain-text data retain their normal behavior. |

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

## Not currently bound

- `/` has no slash-command menu in the current demo.
- `Primary+A` has no editor-wide select-all command; native browser behavior applies.
