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
  createReactEditor, EditorStorage, EditorStorageContext, EditorView, PageSurface, standardPreset,
  type ReactEditor,
} from "@chulane/rivto-react";
import "@chulane/rivto-react/styles.css";

export function DocumentEditor() {
  const [view, setView] = useState<{ reactEditor: ReactEditor; editors: EditorStorage; releaseInitial: () => Promise<void> } | null>(null);
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
    <EditorView reactEditor={view.reactEditor} onReady={view.releaseInitial}><PageSurface /></EditorView>
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

Children `EditorView` находятся в том же context перед active surface:

```tsx
function Toolbar() {
  const reactEditor = useReactEditor();
  return <header>
    <button onClick={() => reactEditor.history.undo()}>Undo</button>
    <button onClick={() => reactEditor.history.redo()}>Redo</button>
  </header>;
}

<EditorView reactEditor={reactEditor}><Toolbar /><PageSurface /></EditorView>
```

## Частые ошибки

- Runtime внутри каждого render теряет selection/history и создаёт listeners заново.
- `standardPreset()` устанавливает writing behavior. Surface задаётся явно; canvas interaction требует `...edgelessPreset()`.
- Без `standardPreset()` нужно самостоятельно зарегистрировать surface и writing behavior.
- Без styles layout, selection и overlays отображаются неверно.
- Prop `EditorView.reactEditor` принимает `ReactEditor`, а не core editor.
- Cleanup идёт в порядке React runtime → core runtime → providers/CRDT.
