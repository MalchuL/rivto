# Editor runtime

Каталог `packages/rivto-editor-core/src/editor` — composition root framework-neutral редактора. Он соединяет `DocumentModel`, focused public managers, command registry, local selection, clipboard, undo и runtime revision stream.

## Место в архитектуре

```text
createRivtoEditor(options)
  -> EditorRuntime
    -> one supplied DocumentModel
    -> BlockManager + BlockRegistryManager
    -> ElementManager + LinkManager
    -> CommandRegistry
    -> SelectionManager
    -> ClipboardManager + HistoryManager
      -> React surfaces / extensions / host integrations
```

Editor не владеет rendering и DOM. React-пакет подписывается на revision, читает focused managers и отправляет browser interactions как typed operations или named commands.

## Быстрый пример

```ts
const storage = new DocumentStorage({ registry: new YjsDocumentRegistry("workspace-id") });
const document = await storage.create("document-id");
const editor = createRivtoEditor({ document });

editor.blockRegistry.defineBlock({
  type: "paragraph",
  title: "Paragraph",
});

const first = editor.blocks.insertBlock({
  type: "paragraph",
  content: "Первый блок",
});

editor.selection.set([{
  type: "selection",
  blocks: [{ id: first, start: 0, end: -1 }],
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

- selection отдельного document core и её subscriptions;
- presentation surface choice хранится в React host;
- command registrations;
- undo stack конкретного editor;
- revision counter и subscribers;
- clipboard event objects.

## Владение lifecycle

`EditorRuntime.destroy()` уничтожает только runtime managers, registry, listeners и commands. Storage принадлежит host; views independently acquire документы, включая embeds и inactive tabs. Последний release уничтожает live document и отключает его providers. После завершения `editorStorage.destroy()` host вызывает `storage.destroy()` для cleanup workspace registry; storage не хранит editor consumers.

Вложенные страницы описывают каждый interface, property, method, argument, return value, exception, built-in command и interaction с остальными модулями.
