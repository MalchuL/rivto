# ReactSelectionManager и modes

Core `editor.selection` хранит generic selection с block ranges, element IDs и
plugin data. React синхронизирует native DOM endpoints с тем же core state.

`reactEditor.selection` предоставляет editing context:

- `get()`: возвращает generic core selection.
- `set(context)`: валидирует и публикует generic selection.
- `clear()`: очищает selection.
- `subscribe(listener)`: подписывается на selection state.
- `delete()`: удаляет text range, whole blocks и selected elements.
- `readDOM()`: преобразует directed native endpoints в absolute per-block ranges.
- `restoreDOM(context?)`: восстанавливает directed native text range.

Shift+Alt drag/click сохраняет partial cross-block text. Полностью покрытые
editable middle blocks остаются text ranges без второго structural highlight;
contentless blocks получают `{ start: 0, end: -1 }`. Alt-drag выбирает whole blocks.

Clipboard использует `editor.clipboard.copyText(range)` и
`editor.clipboard.paste({ textTarget: range, ... })`. Paste возвращает caret
для text insertion; React сохраняет его и восстанавливает после DOM commit.
Whole-block copy/paste остаётся структурным. Ctrl/Cmd+Shift+V переносит plain
text в один блок с сохранением переводов строк.

Page и editing внутри edgeless card используют одинаковые правила. Canvas
element/group selection хранится в generic core selection через element IDs и
extension-owned plugin data.

Все selections локальны и не входят в CRDT. Persisted mutations проходят через
core managers и отдельный document-model package.

Подробный контракт и migration examples:
[Selection in Rivto](../../../../packages/react-rivto-editor/docs/selection.md).
