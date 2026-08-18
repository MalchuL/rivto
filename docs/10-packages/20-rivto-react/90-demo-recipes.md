# Практические patterns из demo

`demo/` — integration consumer public packages, а не специальный runtime. Ниже перечислены patterns, которые стоит повторять в application.

## Runtime factory

```ts
function createAppEditor() {
  const editor = createRivtoEditor();
  const visuals = edgelessVisualsExtension(appVisualOptions);
  const reactEditor = createReactEditor({
    editor,
    extensions: [
      standardPreset({ writing: { onMarkdownLinkClick: handleLink } }),
      visuals,
      ...customBlockExtensions,
    ],
  });
  return { editor, reactEditor, visuals };
}
```

Factory концентрирует extension ordering и возвращает imperative extension handles, которые реально нужны host.

## Custom blocks

Demo Slider сочетает `MarkdownContent` и validated numeric property. Counter вызывает `useBlockEditing(..., { textEdit: false })` и spread structural attributes на non-editable region. Оба регистрируются через `blockExtension()` и получают slash conversion автоматически.

Core definitions находятся отдельно от React renderers. Это позволяет snapshot и validation работать без React.

## Application toolbar

Demo toolbar находится child `EditorView` и использует `useEditor()`/`useEditorMode()` для delete, undo и mode switch. UI state вроде видимости block IDs остаётся React state, а не pluginData документа.

## Decorator без duplicate block DOM

Demo block-ID extension регистрирует `BlockWrapper` и использует `BlockElementRefProvider` + portal. Он наблюдает существующий `.page-block-row`, не создаёт второй `BlockView` и не ломает selection contract.

## Несколько независимых editors

Каждый document получает собственные `{ editor, reactEditor }`. Один shared React context на два документа использовать нельзя:

```tsx
<EditorView editor={left.reactEditor} />
<EditorView editor={right.reactEditor} />
```

Cleanup выполняется для каждой пары. Cross-document transfer должен явно работать с source/destination APIs и проверять ID collisions.

## Collaboration

Demo sync создаёт отдельный `YjsDoc`, передаёт его core editor, затем подключает provider:

```ts
const document = new YjsDoc(documentId);
const editor = createRivtoEditor({ document });
const reactEditor = createReactEditor({ editor, extensions: [standardPreset()] });
await document.attachProvider(provider);
```

Cleanup:

```ts
reactEditor.destroy();
editor.destroy();
await document.detachProvider();
document.destroy();
```

Provider и CRDT lifecycle не принадлежат React package.

## Persistence

React-specific state не нужен для Markdown storage. Application сохраняет `editor.dump()` и загружает через `editor.load(snapshot)`. Persisted blocks/elements/links синхронно перерисуются; mode, DOM selection, toolbar state, keymap и snapping preferences остаются local.

## Что в demo не является API

CSS classes `demo-*`, query parameters, hidden state dump, journal dates, custom block IDs и browser events `rivto:markdown-link` принадлежат demo. Не стройте integration contract вокруг них.
