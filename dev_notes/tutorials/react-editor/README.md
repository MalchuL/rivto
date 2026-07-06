# Курс: React editor в Rivto

## Для кого этот курс

Курс рассчитан на junior React-разработчика. Предполагается знание components,
props, state и event handlers. Здесь подробно объясняются более сложные темы:

- почему runtime существует вне React;
- что делает `useSyncExternalStore`;
- чем render state отличается от collaborative document state;
- почему `contentEditable` нельзя контролировать как обычный `<input>`;
- как DOM event превращается в runtime event или command;
- как выбирается block/edgeless renderer;
- почему lifecycle editor нельзя бездумно привязывать к effect cleanup в
  Strict Mode.

## Порядок чтения

| Глава | Что изучаем | Главные файлы |
| --- | --- | --- |
| [00](./00-boundary-and-data-flow.md) | Граница React ↔ runtime и полный data flow | `react/rivto-editor.tsx`, `editor/rivto-editor.ts` |
| [01](./01-subscriptions-and-lifecycle.md) | external stores, revision, effects, ownership | `react/rivto-editor.tsx`, demo `App.tsx` |
| [02](./02-editable-block.md) | `contentEditable`, input, keydown, formatting | `react/renderers.tsx`, `markdown.ts` |
| [03](./03-renderers-and-interactions.md) | block tree, canvas, drag, resize, events, UI | `react/renderers.tsx` |
| [04](./04-customization-testing-debugging.md) | custom renderers, tests и диагностика | demo и E2E tests |

Selection и clipboard здесь рассматриваются только на границе React adapter.
Их алгоритмы подробно разобраны в отдельном
[курсе](../selection-and-clipboard/README.md).
Если пока непонятно, откуда берётся массив `blocks` и почему изменение CRDT
вызывает новый React render, сначала прочитайте курс
[DocumentModel и render](../document-model-to-render/README.md).

## Одна мысль заранее

`RivtoEditor` не является владельцем документа. Он проецирует long-lived
`EditorRuntime` в DOM.

```text
EditorRuntime хранит/координирует:
  document, commands, plugins, mode, selection, events, UI, history

React binding хранит:
  refs DOM, zoom и краткоживущую информацию жеста
```

Если React component unmount/remount, document не должен зависеть от случайной
перерисовки view. Ownership runtime определяет host application.

## Карта файлов

```text
src/editor/react/
├── rivto-editor.tsx   верхняя binding, toolbar, subscriptions, copy/paste
├── renderers.tsx      editable block, block page и edgeless canvas
├── selection.ts       DOM ↔ portable selection и visual highlight
├── markdown.ts        маленький escaped preview
├── styles.ts          встроенные editor styles
├── types.ts           props binding и renderer strategies
└── index.ts           public exports
```
