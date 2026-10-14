# Установка и первый редактор

## Packages

```sh
pnpm add @chulane/rivto @chulane/rivto-react react react-dom
```

React и React DOM — peer dependencies; поддерживаемая range: `>=18 <20`. Базовые стили импортируются один раз:

```ts
import "@chulane/rivto-react/styles.css";
```

## Создание через hook

Если модель уже загружена, используйте `useReactEditor({ document, extensions })`.
Не создавайте `ReactEditor` или `ReactPanel` вручную в компонентах.
Для React-интеграции создание редактора выполняется только через `useReactEditor`,
а панель создаёт внутренний хук `EditorPanel`/`EditorEmbed`. `useReactPanel` лишь
читает уже созданную панель из контекста. Ни render, ни `useMemo`, ни initializer
`useState` не должны создавать эти экземпляры.

Hook создаёт core и ReactEditor после commit, возвращает loading/ready/error,
очищает свои ресурсы при unmount или замене модели. Сам DocumentModel остаётся у caller.
Один ready editor можно передавать нескольким EditorPanel. Для смены extensions/keymap
перемонтируйте компонент-владелец с новым key. Preset и surface задаются явно.

```tsx
function MyEditor({ document }: { document: DocumentModel }) {
  const state = useReactEditor({ document, extensions: [standardPreset()] });
  if (state.status === "loading") return <p>Загрузка…</p>;
  if (state.status === "error") return <p>Не удалось создать редактор</p>;
  return <EditorPanel editor={state.editor}><PageSurface /></EditorPanel>;
}
```

Импортируйте DocumentModel из `@chulane/document-model`, остальные имена — из
`@chulane/rivto-react`.

## Создание runtime

Низкоуровневые фабрики предназначены для инфраструктуры managed storage и внутренних тестов,
а не для ручного создания экземпляров в React-компонентах. Для загрузки и кеширования
нескольких документов используйте EditorStorage с явным cleanup. `EditorPanel` использует готовый runtime, но не владеет им.

```tsx
import { useEffect, useState } from "react";
import { YjsDocumentRegistry } from "@chulane/crdt-doc";
import { DocumentStorage } from "@chulane/document-model";
import {
  createReactEditor, EditorStorage, EditorStorageContext, EditorPanel, PageSurface, standardPreset,
  type ReactEditorApi,
} from "@chulane/rivto-react";
import "@chulane/rivto-react/styles.css";

export function DocumentEditor() {
  const [view, setView] = useState<{ reactEditor: ReactEditorApi; editors: EditorStorage; releaseInitial: () => Promise<void> } | null>(null);
  useEffect(() => {
    let active = true;
    const documents = new DocumentStorage({ registry: new YjsDocumentRegistry("workspace-id") });
    documents.registerDocument("document-id");
    const editors = new EditorStorage({
      openDocument: (id) => documents.openDocument(id),
      createEditor: (editor) => createReactEditor({
        editor,
        extensions: [standardPreset()],
      }),
    });
    void editors.acquireEditor("document-id").then((acquisition) => {
      acquisition.editor.blocks.insertBlock({ type: "paragraph", content: "Hello **Rivto**!" });
      if (active) setView({ reactEditor: acquisition.editor, editors, releaseInitial: acquisition.release });
      else void acquisition.release();
    }).catch(console.error);
    return () => {
      active = false;
      void editors.destroy().then(() => documents.destroy()).catch(console.error);
    };
  }, []);
  return view ? <EditorStorageContext.Provider value={view.editors}>
    <EditorPanel editor={view.reactEditor}><PageSurface /></EditorPanel>
  </EditorStorageContext.Provider> : null;
}
```

## Начальные данные

`standardPreset()` регистрирует default writing type. После создания React runtime можно вставлять blocks:

```ts
reactEditor.blocks.insertBlock({
  type: DEFAULT_WRITING_BLOCK_TYPE,
  content: "# Первый документ",
});
reactEditor.history.clear();
```

`history.clear()` после seed/load делает начальные данные baseline.

## Application UI

Children `EditorPanel` находятся в том же context перед active surface:

```tsx
function Toolbar() {
  const reactPanel = useReactPanel();
  return <header>
    <button data-editor-control="" onClick={() => reactPanel.document.history.undo()}>Undo</button>
    <button data-editor-control="" onClick={() => reactPanel.document.history.redo()}>Redo</button>
  </header>;
}

<EditorPanel editor={reactEditor}><Toolbar /><PageSurface /></EditorPanel>
```

## Частые ошибки

- Runtime внутри каждого render теряет selection/history и создаёт listeners заново.
- `standardPreset()` устанавливает writing behavior. Surface задаётся явно; canvas interaction требует `...edgelessPreset()`.
- Без `standardPreset()` нужно самостоятельно зарегистрировать surface и writing behavior.
- Без styles layout, selection и overlays отображаются неверно.
- Prop `EditorPanel.editor` принимает `ReactEditor`, а не core editor.
- Cleanup идёт в порядке React runtime → core runtime → providers/CRDT.
