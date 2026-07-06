# React editor в Rivto: учебный курс

Этот файл — точка входа в курс
[`tutorials/react-editor`](./tutorials/react-editor/README.md).

Главы:

1. [Граница React и EditorRuntime](./tutorials/react-editor/00-boundary-and-data-flow.md)
2. [Subscriptions и lifecycle](./tutorials/react-editor/01-subscriptions-and-lifecycle.md)
3. [Как работает EditableText](./tutorials/react-editor/02-editable-block.md)
4. [Block renderer, canvas и interactions](./tutorials/react-editor/03-renderers-and-interactions.md)
5. [Customization, тесты и отладка](./tutorials/react-editor/04-customization-testing-debugging.md)

После курса будет понятно:

- почему runtime живёт вне React;
- как `useSyncExternalStore` превращает runtime subscriptions в rerender;
- почему browser сначала меняет `contentEditable` DOM, а model обновляется
  после `onInput`;
- как не сбрасывать caret при синхронизации DOM;
- зачем normal browser event превращается в portable runtime event;
- как один document отображается block и edgeless renderers;
- как работают drag, resize, toolbar и plugin UI contributions;
- почему editor lifecycle особенно осторожен в React Strict Mode;
- какие части проверять unit tests, а какие требуют настоящего browser E2E.

Для подробного алгоритма курсора, cross-block selection и clipboard после главы
02 перейдите к отдельному
[курсу selection и clipboard](./tutorials/selection-and-clipboard/README.md).

