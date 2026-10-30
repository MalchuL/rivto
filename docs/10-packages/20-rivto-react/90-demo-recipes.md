# Практические patterns из demo

`demo/` — integration consumer public packages, а не специальный runtime. Ниже перечислены patterns, которые стоит повторять в application.

## Runtime factory

```ts
async function createAppEditor() {
  const storage = new DocumentStorage({ registry: new YjsDocumentRegistry("workspace-id") });
  storage.registerDocument("document-id");
  const document = await storage.openDocument("document-id");
  const core = createDocumentEditor({ document });
  const reactEditor = createReactEditor({
    editor: core,
    extensions: [
      standardPreset({ writing: { onMarkdownLinkClick: handleLink } }),
      ...edgelessPreset({ visuals: appVisualOptions }),
      ...customBlockExtensions,
    ],
  });
  return { storage, core, editor: core, reactEditor };
}
```

Factory концентрирует extension ordering. Canvas-команды доступны через `useEdgelessOperations()`; регистрация расширения не служит отдельным imperative API.

## Custom blocks

Demo Slider сочетает `MarkdownContent` и validated numeric property. Counter вызывает `useBlockNode()` и `useBlockSelectionAnchor()` и spread structural attributes на non-editable region. Оба регистрируются через `blockExtension()` и получают slash conversion автоматически. Optional block drag и layout containers (`kanbanExtension`, `bentoExtension`, `tableExtension`, `columnsExtension`) регистрируются рядом в `customBlockExtensions`.

Core definitions находятся отдельно от React renderers. Это позволяет snapshot и validation работать без React.

## Application toolbar

Demo toolbar получает core editor от host для persistence/lifecycle и использует `useReactPanel()` для focused operations. Host React state выбирает `<PageSurface />` либо `<EdgelessSurface />`. UI state вроде видимости block IDs остаётся React state, а не pluginData документа.

## Decorator без duplicate block DOM

Demo block-ID extension регистрирует block slot. Page размещает его в существующей строке, без второго structural shell и отдельного ref provider; selection остаётся в панели.

## Несколько независимых editors

Один user получает EditorStorage с фабрикой отдельных ReactEditor для документов.
Два документа используют разные document-bound runtimes; два views одного
документа получают один cached ReactEditor и независимые ReactPanelApi:

```tsx
<EditorPanel editor={leftAcquisition.editor}><PageSurface /></EditorPanel>
<EditorPanel editor={rightAcquisition.editor}><PageSurface /></EditorPanel>
```

Владелец сохраняет acquisition до размонтирования зависимых EditorPanel; повторный consumer внутри EditorPanel не создаётся. Cross-document transfer
явно получает source/destination APIs и проверяет collisions до удаления source.

## Collaboration

Demo создаёт независимый кеш для каждого user и общий workspace channel.
Registry metadata синхронизируется постоянно; content provider подключается при
открытии соответствующего документа. EditorStorage создаётся с loader и фабрикой:

```tsx
const editors = new EditorStorage({
  openDocument: (id) => storage.openDocument(id),
  createEditor: (editor) => createReactEditor({
    editor,
    extensions: [standardPreset(), embeddingExtension()],
  }),
});
const acquisition = await editors.acquireEditor("document-id");
// Keep this acquisition until the dependent panels unmount, then call release().
<EditorStorageContext.Provider value={editors}>
  <EditorPanel editor={acquisition.editor}>
    <PageSurface />
  </EditorPanel>
</EditorStorageContext.Provider>;
// Final application cleanup:
await editors.destroy();
await storage.destroy();
```

`DBDocumentModel` из demo переопределяет protected-методы создания managers для database allocation и
проверки ID. База хранит documents, blocks и elements; блоки и элементы имеют
общую ID namespace внутри каждого документа и составные ключи `(documentId, id)`.
Одинаковые ID разных документов разрешены. Embedding хранит document ID и block ID; resolver
проверяет указанный документ первым, затем ищет в остальных и сообщает неоднозначность.
База пишет изменённые rows и incremental CRDT updates, а при открытии восстанавливает
native state до подключения provider. Другие страницы получают через workspace
metadata только ID и locations; полный content подключается отдельно.

## Persistence

React-specific state не нужен для Markdown storage. Application сохраняет `editor.dump()` и загружает через `editor.load(snapshot)`. Persisted blocks/elements/links синхронно перерисуются; mode, DOM selection, toolbar state, keymap и snapping preferences остаются local.

## Что в demo не является API

CSS classes `demo-*`, query parameters, hidden state dump, journal dates, custom block IDs и browser events `rivto:markdown-link` принадлежат demo. Не стройте integration contract вокруг них.
