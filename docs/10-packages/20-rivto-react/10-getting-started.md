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

Создавайте core и React runtime вне render body либо через lazy state initializer. `EditorView` использует готовый runtime, но не владеет им.

```tsx
function createRuntime() {
  const editor = createRivtoEditor();
  const reactEditor = createReactEditor({ editor, extensions: [standardPreset()] });
  return { editor, reactEditor };
}

export function DocumentEditor() {
  const [runtime] = useState(createRuntime);

  useEffect(() => () => {
    runtime.reactEditor.destroy();
    runtime.editor.destroy();
  }, [runtime]);

  return <EditorView editor={runtime.reactEditor} />;
}
```

## Начальные данные

`standardPreset()` регистрирует default writing type. После создания React runtime можно вставлять blocks:

```ts
editor.blocks.insertBlock({
  type: DEFAULT_WRITING_BLOCK_TYPE,
  content: "# Первый документ",
});
editor.history.clear();
```

`history.clear()` после seed/load делает начальные данные baseline.

## Application UI

Children `EditorView` находятся в том же context перед active surface:

```tsx
function Toolbar() {
  const editor = useEditor();
  const { mode, setMode } = useEditorMode();
  return <header>
    <button onClick={() => editor.undo()}>Undo</button>
    <button onClick={() => editor.redo()}>Redo</button>
    <button onClick={() => setMode(mode === "block" ? "edgeless" : "block")}>Mode</button>
  </header>;
}

<EditorView editor={reactEditor}><Toolbar /></EditorView>
```

## Частые ошибки

- Runtime внутри каждого render теряет selection/history и создаёт listeners заново.
- Без `standardPreset()` нужно самостоятельно зарегистрировать surface и writing behavior.
- Без styles layout, selection и overlays отображаются неверно.
- Prop `EditorView.editor` принимает `ReactEditor`, а не core editor.
- Cleanup идёт в порядке React runtime → core runtime → providers/CRDT.
