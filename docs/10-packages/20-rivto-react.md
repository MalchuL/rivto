# `@chulane/rivto-react` package

`@chulane/rivto-react` owns browser presentation and interaction behavior around an existing `@chulane/rivto` runtime. It does not own canonical document state.

## Responsibilities

- Page and edgeless surfaces.
- React block renderers and component lifecycle.
- DOM events, keyboard bindings, and DOM/editor selection conversion.
- Clipboard formatting, slash commands, drag behavior, and browser overlays.
- Functional extensions with setup and cleanup ownership.
- Built-in writing, separator, error, and edgeless visual behavior.

## Basic setup

```tsx
import { createRivtoEditor } from "@chulane/rivto";
import {
  createReactEditor,
  EditorView,
  standardPreset,
} from "@chulane/rivto-react";
import "@chulane/rivto-react/styles.css";

const editor = createRivtoEditor();
const reactEditor = createReactEditor({
  editor,
  extensions: [standardPreset()],
});

export function RivtoView() {
  return <EditorView editor={reactEditor} />;
}
```

The host owns both lifecycles. Destroy the React runtime before destroying the core runtime:

```ts
reactEditor.destroy();
editor.destroy();
```

## Extension model

Optional behavior is installed through `ReactEditorExtension` values. An extension registers its renderers, blocks, surfaces, events, keyboard actions, slash commands, or mounted UI during `setup`, and returns cleanup when necessary. `standardPreset()` installs the normal page and edgeless editing experience.

## Package commands

```sh
pnpm --filter @chulane/rivto-react check-types
pnpm --filter @chulane/rivto-react test
pnpm --filter @chulane/rivto-react build
```
