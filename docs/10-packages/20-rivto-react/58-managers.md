# React managers

Менеджеры регистрации принадлежат `EditorRuntime`; операции одного отображения доступны через `EditorViewApi`. Они не дублируют document state: каждый владеет только одной React/browser responsibility.

```text
EditorRuntime
  ├─ blockTypes + renderers   model/presentation registration
  ├─ extensions + surfaces   lifecycle/composition
  ├─ events + keyboard       browser input
  ├─ selection               portable document selection
  ├─ clipboardFormats        portable external formats
  ├─ pasteStrategies         shared paste algorithms
  └─ slashCommands           command definitions

EditorViewApi (implemented by EditorViewController)
  ├─ runtime                 explicit shared document managers
  ├─ events + keyboard       local registrations
  ├─ selection               local DOM bridge
  ├─ clipboard               copy/cut/paste in this view
  └─ slashCommands           availability and execution in this view
```

## Общие правила

- Registration получает stable ID или key и обычно возвращает idempotent disposer.
- Registration внутри extension `setup()` автоматически принадлежит этой extension.
- Dynamic registration после initialization допустима и принадлежит runtime до disposer/destroy.
- Registry mutation после `editorRuntime.destroy()` throws.
- Core document mutations проходят через focused managers вроде `editorRuntime.blocks` и `editorRuntime.elements`.
- Mode filters применяют events/keyboard/surfaces; managers не создают скрытый второй editor state.

Вложенные страницы описывают каждый manager, methods, arguments, returns, errors, lifecycle и взаимодействие с `block`/`edgeless` modes.
