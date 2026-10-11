# Установка и первый редактор

## Packages

```sh
pnpm add @chulane/rivto @chulane/rivto-react react react-dom
```

React и React DOM — peer dependencies; поддерживаемая range: `>=18 <20`. Базовые стили импортируются один раз:

```ts
import "@chulane/rivto-react/styles.css";
```

## Создание runtime

Создавайте core и React runtime вне render body в effect с явным cleanup. `EditorView` использует готовый runtime, но не владеет им.

```tsx
import { useEffect, useState } from "react";
import { YjsDocumentRegistry } from "@chulane/crdt-doc";
import { DocumentStorage } from "@chulane/document-model";
import {
  createEditorRuntime, EditorStorage, EditorStorageContext, EditorView, PageSurface, standardPreset,
  type EditorRuntime,
} from "@chulane/rivto-react";
import "@chulane/rivto-react/styles.css";

export function DocumentEditor() {
  const [view, setView] = useState<{ editorRuntime: EditorRuntime; editors: EditorStorage; releaseInitial: () => Promise<void> } | null>(null);
  useEffect(() => {
    let active = true;
    const documents = new DocumentStorage({ registry: new YjsDocumentRegistry("workspace-id") });
    documents.registerDocument("document-id");
    const editors = new EditorStorage({
      openDocument: (id) => documents.openDocument(id),
      createEditor: (editor) => createEditorRuntime({
        editor,
        extensions: [standardPreset()],
      }),
    });
    void editors.acquireRuntime("document-id").then((acquisition) => {
      acquisition.runtime.blocks.insertBlock({ type: "paragraph", content: "Hello **Rivto**!" });
      if (active) setView({ editorRuntime: acquisition.runtime, editors, releaseInitial: acquisition.release });
      else void acquisition.release();
    }).catch(console.error);
    return () => {
      active = false;
      void editors.destroy().then(() => documents.destroy()).catch(console.error);
    };
  }, []);
  return view ? <EditorStorageContext.Provider value={view.editors}>
    <EditorView runtime={view.editorRuntime} onReady={view.releaseInitial}><PageSurface /></EditorView>
  </EditorStorageContext.Provider> : null;
}
```

## Начальные данные

`standardPreset()` регистрирует default writing type. После создания React runtime можно вставлять blocks:

```ts
editorRuntime.blocks.insertBlock({
  type: DEFAULT_WRITING_BLOCK_TYPE,
  content: "# Первый документ",
});
editorRuntime.history.clear();
```

`history.clear()` после seed/load делает начальные данные baseline.

## Application UI

Children `EditorView` находятся в том же context перед active surface:

```tsx
function Toolbar() {
  const editorView = useEditorView();
  return <header>
    <button data-editor-control="" onClick={() => editorView.runtime.history.undo()}>Undo</button>
    <button data-editor-control="" onClick={() => editorView.runtime.history.redo()}>Redo</button>
  </header>;
}

<EditorView runtime={editorRuntime}><Toolbar /><PageSurface /></EditorView>
```

## Частые ошибки

- Runtime внутри каждого render теряет selection/history и создаёт listeners заново.
- `standardPreset()` устанавливает writing behavior. Surface задаётся явно; canvas interaction требует `...edgelessPreset()`.
- Без `standardPreset()` нужно самостоятельно зарегистрировать surface и writing behavior.
- Без styles layout, selection и overlays отображаются неверно.
- Prop `EditorView.runtime` принимает `EditorRuntime`, а не core editor.
- Cleanup идёт в порядке React runtime → core runtime → providers/CRDT.
