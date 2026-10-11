# `@chulane/rivto-react`

`@chulane/rivto-react` — пользовательский React-слой Rivto. Он превращает framework-neutral runtime из `@chulane/rivto` в редактируемые page и edgeless surfaces, подключает block renderers, DOM selection, keyboard, clipboard, slash commands и extensions.

## Архитектурная граница

```text
@chulane/rivto
  document, CRDT, blocks, history, portable selection
             ↓
@chulane/rivto-react
  React runtime, rendering, DOM events, browser interaction
             ↓
application / demo
  lifecycle, toolbar, persistence, providers, product extensions
```

React-пакет не создаёт и не уничтожает core editor автоматически. Application владеет обоими runtime.

## Минимальная интеграция

```tsx
import { createRivtoEditor } from "@chulane/rivto";
import { DocumentStorage } from "@chulane/document-model";
import { YjsDocumentRegistry } from "@chulane/crdt-doc";
import {
  createEditorRuntime,
  EditorView,
  PageSurface,
  standardPreset,
} from "@chulane/rivto-react";
import "@chulane/rivto-react/styles.css";

const storage = new DocumentStorage({ registry: new YjsDocumentRegistry("workspace-id") });
storage.registerDocument("document-id");
const document = await storage.openDocument("document-id");
const editor = createRivtoEditor({ document });
const editorRuntime = createEditorRuntime({
  editor,
  extensions: [standardPreset()],
});

export function RivtoView() {
  return <EditorView runtime={editorRuntime}><PageSurface /></EditorView>;
}
```

Application владеет обоими lifecycle. Сначала уничтожайте React runtime:

```ts
editorRuntime.destroy();
editor.destroy();
await document.destroy();
await storage.destroy();
```

## Как читать раздел

Вложенные страницы идут от общего public API к конкретным сценариям: quick start, runtime lifecycle, blocks/rendering, hooks, extensions, capability и manager reference, browser interaction, page и edgeless surfaces, patterns из `demo` и карта exports.

Для большинства приложений достаточно quick start, runtime, blocks и extensions. Low-level managers нужны авторам собственных extensions и surfaces.
