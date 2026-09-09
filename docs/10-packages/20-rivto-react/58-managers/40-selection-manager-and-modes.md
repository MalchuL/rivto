# ReactSelectionManager и modes

Core `editor.selection` хранит только whole-block selection. Browser text ranges
не входят в core state и никогда не смешиваются с block items.

`reactEditor.selection` предоставляет editing context:

- `get()`: block items либо один single-block text range.
- `set(context)`: проверяет single-block offsets или передаёт block items в core.
  Mixed и cross-block text ranges отклоняются.
- `clear()`: очищает editing context и core block selection.
- `subscribe(listener)`: подписка на text context и core block selection.
- `delete()`: удаляет выделенные символы одного блока либо выбранные block subtrees.
- `readDOM()`: читает native endpoints; несколько блоков превращаются в block range.
- `restoreDOM(context?)`: восстанавливает single-block text range, по умолчанию из `get()`.

Drag через несколько блоков, включая Alt-drag, выбирает целые блоки. Возврат
в исходный блок восстанавливает локальный text range. Cross-block text highlights
удалены. `useEditorSelection()` и `useBlockSelection()` читают только whole blocks.

Clipboard использует `editor.clipboard.copyText(range)` и
`editor.clipboard.paste({ textTarget: range, ... })`. Paste возвращает caret
для text insertion; React сохраняет его и восстанавливает после DOM commit.
Whole-block copy/paste остаётся структурным. Ctrl/Cmd+Shift+V переносит plain
text в один блок с сохранением переводов строк.

Page и editing внутри edgeless card используют одинаковые правила. Canvas
element/group selection остаётся в EdgelessSelectionRuntime и имеет приоритет,
пока активна. Clipboard временно проецирует выбранные cards в core block IDs,
затем восстанавливает предыдущий host context.

Все selections локальны и не входят в CRDT. Persisted mutations проходят через
core managers и отдельный document-model package.

Подробный контракт и migration examples:
[Selection in Rivto](../../../../packages/react-rivto-editor/docs/selection.md).
