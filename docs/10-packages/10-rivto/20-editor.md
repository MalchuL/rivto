# Editor runtime

Каталог `packages/rivto-editor-core/src/editor` — composition root framework-neutral редактора. Он соединяет `DocumentModel`, focused public managers, command registry, local selection/mode, clipboard, undo и runtime revision stream.

## Место в архитектуре

```text
createRivtoEditor(options)
  -> EditorRuntime
    -> DocumentModelImpl
    -> BlockManager + BlockRegistryManager
    -> ElementManager + LinkManager
    -> CommandRegistry
    -> SelectionManager + ModeManager
    -> ClipboardManager + UndoManager
      -> React surfaces / extensions / host integrations
```

Editor не владеет rendering и DOM. React-пакет подписывается на revision, читает focused managers и отправляет browser interactions как typed operations или named commands.

## Быстрый пример

```ts
const editor = createRivtoEditor();

editor.blocksRegistry.defineBlock({
  type: "paragraph",
  title: "Paragraph",
});

const first = editor.blocks.insertBlock({
  type: "paragraph",
  content: "Первый блок",
});

editor.selection.set([{
  type: "block",
  blockIds: [first],
  anchorBlockId: first,
  focusBlockId: first,
}]);

const snapshot = editor.dump();
editor.load(snapshot);
await editor.destroy();
```

## Runtime и persisted state

Persisted в CRDT:

- blocks, hierarchy и Markdown content;
- elements, links и plugin data;
- versioned snapshot sections.

Остаётся локальным runtime state:

- selection;
- `block`/`edgeless` mode;
- command registrations;
- undo stack конкретного editor;
- revision counter и subscribers;
- clipboard event objects.

## Владение lifecycle

`EditorRuntime.destroy()` уничтожает runtime managers, registry, history, listeners и commands, затем вызывает `document.crdt.destroy()`. CRDT lifecycle отключает все providers и уничтожает внутренний документ. Поэтому переданный через options CRDT document становится owned runtime-ресурсом и не должен совместно использоваться после `await editor.destroy()`.

Вложенные страницы описывают каждый interface, property, method, argument, return value, exception, built-in command и interaction с остальными модулями.
