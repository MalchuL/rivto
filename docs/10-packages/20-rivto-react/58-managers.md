# React managers

Менеджеры регистрации принадлежат `ReactEditor`; операции одного отображения доступны через `ReactPanelApi`. Они не дублируют document state: каждый владеет только одной React/browser responsibility.

```text
ReactEditor
  ├─ blockTypes + renderers   block model/presentation registration
  ├─ elementTypes            element definition, renderer and editing contributions
  ├─ extensions + surfaces   lifecycle/composition
  ├─ events + keyboard       browser input
  ├─ selection               portable document selection
  ├─ clipboardFormats        portable external formats
  ├─ pasteStrategies         shared paste algorithms
  └─ slashCommands           command definitions

ReactPanelApi (implemented by ReactPanel)
  ├─ editor                  shared ReactEditorApi
  ├─ blocks + elements       bounded core operations, inherited from PanelAPI
  ├─ edgeless                typed canvas actions for this occurrence
  ├─ events + keyboard       local registrations
  ├─ selection               local DOM bridge
  ├─ clipboard               copy/cut/paste in this view
  └─ slashCommands           availability and execution in this view
```

## Общие правила

- Registration получает stable ID или key и обычно возвращает idempotent disposer.
- Registration внутри extension `setup()` автоматически принадлежит этой extension.
- Dynamic registration после initialization допустима и принадлежит runtime до disposer/destroy.
- Registry mutation после `reactEditor.destroy()` throws.
- Core document mutations проходят через focused managers вроде `reactEditor.blocks` и `reactEditor.elements`.
- Mode filters применяют events/keyboard/surfaces; managers не создают скрытый второй editor state.

Вложенные страницы описывают каждый manager, methods, arguments, returns, errors, lifecycle и взаимодействие с `block`/`edgeless` modes.
