# `ReactSelectionManager` и selection в разных modes

Selection в Rivto имеет три представления, но только два хранилища:

```text
core portable selection        editor.selection
  text/block IDs + offsets     local, survives rerender/mode switch

browser DOM selection          window.getSelection()
  nodes + offsets              current mounted surface only

edgeless canvas selection      EdgelessSelectionRuntime
  element/group IDs            local React runtime state
```

`ReactSelectionManager` отвечает только за DOM bridge. Portable validation/deletion принадлежит core; canvas object interaction принадлежит edgeless extensions.

## Properties

Public state properties отсутствуют. Manager lazily получает current root из `EventManager`, поэтому не хранит stale element при switch mode.

## Methods

### `readDOM()`

- **Аргументы:** отсутствуют.
- **Возвращает:** portable `EditorSelection | undefined`.
- **Исключения:** malformed DOM/range resolution errors.

Без mounted root или valid endpoints возвращает `undefined`.

### `restoreDOM(selection?)`

- **Аргументы:** optional `EditorSelection`; default `editor.selection.get()`.
- **Возвращает:** `true`, если visible text endpoints resolved; иначе `false`.
- **Исключения:** browser Selection API errors.

Block-only selection не становится native text range.

### `clearDOMHighlight()`

- **Аргументы:** отсутствуют.
- **Возвращает:** `void`.
- **Исключения:** CSS Highlight/DOM cleanup errors.

Без root — safe no-op.

### `updateDOMHighlight(selection?)`

- **Аргументы:** optional portable selection; default current core selection.
- **Возвращает:** `void`.
- **Исключения:** range/highlight API errors.

Используется для partial cross-block text ranges, которые browser не может стабильно рисовать между несколькими contenteditable hosts.

## Page (`mode: "block"`)

Page использует core portable selection как единственный semantic selection state:

- caret/same-block text selection хранится как `TextSelection` и одновременно отражается native range;
- обычный drag через несколько blocks превращается в `BlockSelection`;
- Alt-drag сохраняет partial text endpoints и complete middle blocks;
- Ctrl/Cmd-click toggles whole blocks;
- Shift/arrow navigation сохраняет anchor/focus direction;
- collapse extension переносит hidden selection endpoints к visible collapsed ancestor.

`textSelectionExtension` перед browser copy/cut/paste синхронизирует DOM endpoints обратно в core, потому что `selectionchange` может приходить позже clipboard event.

## Edgeless: selection внутри card

Block content внутри card использует те же `TextSelection`/`BlockSelection`, DOM markers и `ReactSelectionManager`. Это важно: text editing semantics и offsets не меняются из-за canvas layout.

Когда user начинает text или explicit block selection внутри card, active canvas selection деактивируется, но его item IDs сохраняются для возможного возврата. Core selection становится видимой/авторитетной.

## Edgeless: canvas objects

`edgelessSelectionExtension()` устанавливает отдельный `EdgelessSelectionRuntime` со snapshot:

```ts
{ active: boolean; items: readonly string[] }
```

Items — IDs block cards, visuals или groups. Canvas click/marquee/Primary-toggle меняют этот store. Пока `active === true`, canvas selection управляет visual chrome, movement, resize, delete и clipboard. Core page selection сохраняется, но не очищает active canvas UI.

`deactivate()` сохраняет items, но передаёт ownership text/block selection. `clear()` активирует пустую canvas selection. При уходе в page mode canvas UI не рендерится; core selection остаётся доступным. При возврате extension может снова использовать retained canvas state, пока новое взаимодействие его не заменит.

## Mode switch

ModeManager сам не переводит selection между coordinate systems и не очищает её. Последовательность:

1. `EditorView` выбирает новую surface.
2. Old root unregisters, new root registers через EventManager.
3. Portable core selection сохраняется и может быть восстановлена, если endpoints visible в новой surface.
4. Canvas selection остаётся отдельным local snapshot и учитывается только edgeless behavior.

Не копируйте canvas IDs в `editor.selection` вручную. Clipboard extension временно проецирует selected block cards в core `BlockSelection` только на время placement operation и затем восстанавливает previous core selection.

## Что синхронизируется между peers

Ни core selection, ни canvas selection не входят в CRDT. Синхронизируются block/element mutations, вызванные selection commands, но не caret, marquee rectangle или active object IDs другого пользователя.
