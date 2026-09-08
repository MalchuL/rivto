# Глава 03. Lifecycle, тесты и отладка history

## 1. Когда history очищается

`clear()` удаляет undo и redo stacks, но не меняет текущий document.

В Rivto history очищается в двух важных случаях.

### После initial content

Constructor вставляет initial blocks обычными commands, затем вызывает:

```ts
this.history.clear();
```

Initial content — baseline документа, а не первое пользовательское действие.
Без очистки первый Undo после открытия пустого нового редактора удалил бы seed
content.

### После `document.load`

Built-in command делает:

```ts
this.document.loadSnapshot(snapshot);
this.history.clear();
```

Загруженный snapshot становится новым baseline. Старые history items могли
ссылаться на структуры и ID предыдущего состояния, поэтому переносить их через
load нельзя.

## 2. Чем `clear()` отличается от `destroy()`

```text
clear()    manager продолжает работать, stack становится пустым
destroy()  manager освобождает adapter subscriptions и больше не используется
```

`EditorRuntime.destroy()` вызывает `this.history.destroy()`.

После destroy runtime является завершённым объектом. Код не должен продолжать
рендерить его или выполнять commands.

## 3. Почему document не уничтожается runtime

Комментарий в `EditorRuntime.destroy()` подчёркивает ownership:

- runtime освобождает собственные subscriptions, plugins, definitions и
  history manager;
- внешний CRDT document, переданный host application, остаётся собственностью
  host.

В demo cleanup поэтому вызывает оба метода:

```ts
editor.destroy();
doc.destroy();
```

Это два разных ресурса.

## 4. Минимальный unit test Undo

Хороший тест проверяет observable document value, а не внутренний stack Yjs:

```ts
const editor = createRivtoEditor({
  initialContent: [{ id: "a", type: "paragraph", content: "Alpha" }],
});

editor.commands.execute("text.set", { id: "a", text: "Beta" });
expect(editor.getBlocks()[0].content).toBe("Beta");

editor.commands.execute("history.undo");
expect(editor.getBlocks()[0].content).toBe("Alpha");

editor.commands.execute("history.redo");
expect(editor.getBlocks()[0].content).toBe("Beta");
```

В конце настоящего теста полезно вызвать `editor.destroy()` там, где test
создаёт long-lived subscriptions.

## 5. Что тестировать у compound operation

Для formatting недостаточно проверить только prefix.

Проверка должна доказывать:

1. после command появились оба wrapper;
2. после одного ожидаемого Undo документ не остался наполовину formatted;
3. Redo восстанавливает согласованное значение.

Для удаления subtree проверяйте вместе:

- block records;
- порядок parent/roots;
- касающиеся subtree links.

Именно совместные assertions ловят случайное разбиение semantic operation.

## 6. Как тестировать remote isolation

Нужны два синхронизированных CRDT docs или прямое применение remote update.
Сценарий:

1. editor A делает local change;
2. editor B делает другое change;
3. update B приходит в A;
4. A вызывает Undo;
5. local change A отменён;
6. independent remote change B остаётся.

Не проверяйте только количество history items: adapter-neutral API специально
не раскрывает stack.

## 7. Симптом: Undo ничего не делает

Проверяйте по порядку.

### Шаг 1. Command вообще выполнилась?

Посмотрите `editor.commands.lastExecuted`. Если там нет mutation command,
возможно event handler не дошёл до command path.

### Шаг 2. Document действительно изменился?

Сравните `editor.document.getSnapshot()` до и после. No-op operation не создаёт
полезный history step.

### Шаг 3. Mutation прошла через model transaction?

Если plugin напрямую изменил native Yjs structure, `document.origin` мог не
участвовать.

### Шаг 4. Scope отслеживается?

Новая top-level CRDT structure должна быть добавлена в `undoScopes`, если она
является частью undoable collaborative document.

### Шаг 5. History не была очищена?

`document.load` и explicit `history.clear()` удаляют stacks.

## 8. Симптом: один Undo отменяет слишком много

Вероятная область — capture grouping.

Сначала сделайте воспроизводимый тест с реальной последовательностью commands.
Затем определите UX boundary. Если действия обязаны быть разными steps,
рассмотрите `editor.history.stopCapturing()` в одном смысловом месте.

Не пытайтесь чинить это setTimeout в React. History grouping принадлежит
history/transaction layer, а не view timing hacks.

## 9. Симптом: Undo отменяет чужое изменение

Проверьте origins:

- какой origin получает remote transaction;
- не переиспользуется ли `document.origin` provider code;
- создаётся ли Undo manager с `[document.origin]`;
- не обходит ли integration adapter boundary.

## 10. Симптом: после Undo UI не обновился

Если snapshot document изменился, но DOM старый, проблема вероятнее находится
не в Undo manager, а в update subscription:

```text
CRDT update
  → DocumentModel.subscribe
  → EditorRuntime.changed
  → revision
  → useSyncExternalStore
```

Проверяйте цепочку сверху вниз. Не добавляйте ручной React `forceUpdate` рядом
с Undo button — это скроет разрыв общей подписки.

## 11. Checklist для изменения history

Перед merge ответьте:

- Mutation проходит через command и DocumentModel?
- Все части compound mutation находятся в одной нужной transaction?
- Origin совпадает только для локальных операций?
- Нужная CRDT structure находится в scopes?
- Initial/load baseline не остаётся в history?
- Undo сохраняет независимые remote changes?
- Redo возвращает результат?
- Selection после изменения не содержит dangling block IDs?
- Runtime и history manager уничтожаются один раз владельцем?

Если ответы известны и закреплены observable tests, изменение обычно находится
на правильном архитектурном уровне.
