# Выделение и буфер обмена в Rivto: учебный курс

Этот файл — точка входа, а не справочник. Материал рассчитан на frontend-разработчика,
который только начинает работать с DOM, React, `contenteditable` и браузерным
Selection API.

Полный курс находится в каталоге
[`tutorials/selection-and-clipboard`](./tutorials/selection-and-clipboard/README.md).
Общее оглавление всех учебников находится в
[`tutorials/README.md`](./tutorials/README.md).

Читайте главы строго по порядку:

1. [Что браузер называет выделением](./tutorials/selection-and-clipboard/00-browser-basics.md)
2. [Модель выделения внутри Rivto](./tutorials/selection-and-clipboard/01-runtime-model.md)
3. [Как работает выделение текста](./tutorials/selection-and-clipboard/02-text-selection.md)
4. [Как выбираются блоки и объекты canvas](./tutorials/selection-and-clipboard/03-block-and-edgeless-selection.md)
5. [Как React синхронизирует DOM и runtime](./tutorials/selection-and-clipboard/04-react-synchronization.md)
6. [Как работают Copy, Cut и Paste](./tutorials/selection-and-clipboard/05-clipboard.md)
7. [Как безопасно менять эту систему](./tutorials/selection-and-clipboard/06-contributing-and-debugging.md)

## Что вы будете понимать после курса

- чем курсор отличается от выделения;
- что такое DOM, DOM-узел, `contenteditable`, `Selection` и `Range`;
- зачем Rivto хранит своё выделение, если браузер уже умеет выделять текст;
- что означают `anchor`, `head`, `blockId` и `offset`;
- почему выделение снизу вверх нельзя просто «отсортировать»;
- как выделять текст через несколько независимых блоков;
- как выбираются целые блоки и объекты в edgeless-режиме;
- почему React иногда уничтожает браузерный курсор и как Rivto его восстанавливает;
- как одно выделение превращается в JSON, HTML и plain text для clipboard;
- как Cut и Paste изменяют несколько блоков одной транзакцией;
- какие тесты запускать и где искать ошибку.

Не пытайтесь сразу читать `src/editor/react/selection.ts` сверху вниз. Сначала
пройдите главы 00–02. После этого каждая функция в файле будет отвечать на уже
знакомую задачу, а не выглядеть набором случайных browser API.
