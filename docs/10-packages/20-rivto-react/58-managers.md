# React managers

Managers — public extension boundary `ReactEditor`. Они не дублируют document state: каждый владеет только одной React/browser responsibility.

```text
ReactEditor
  ├─ blocks + renderers       model/presentation registration
  ├─ extensions + surfaces   lifecycle/composition
  ├─ events + keyboard       browser input
  ├─ selection               DOM bridge
  ├─ clipboard               portable external formats
  └─ slashCommands           contextual UI actions
```

## Общие правила

- Registration получает stable ID или key и обычно возвращает idempotent disposer.
- Registration внутри extension `setup()` автоматически принадлежит этой extension.
- Dynamic registration после initialization допустима и принадлежит runtime до disposer/destroy.
- Registry mutation после `reactEditor.destroy()` throws.
- Core document mutations всё равно проходят через `reactEditor.editor` или `reactEditor.blocks`.
- Mode filters применяют events/keyboard/surfaces; managers не создают скрытый второй editor state.

Вложенные страницы описывают каждый manager, methods, arguments, returns, errors, lifecycle и взаимодействие с `block`/`edgeless` modes.
