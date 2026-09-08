# Глава 02. Transactions, scopes, origin и границы шага

## 1. Где начинается transaction

`DocumentModelImpl` предоставляет:

```ts
transact(operation: () => void): void {
  this.crdt.transact(operation, this.origin);
}
```

Любой model method использует этот helper:

```ts
insertText(...)
removeBlock(...)
moveBlock(...)
updateElement(...)
createLink(...)
```

Это даёт всем локальным изменениям одну origin policy.

Если каждый method самостоятельно передавал разные случайные origins, local
Undo manager перестал бы видеть часть операций.

## 2. Почему `origin` — это `Symbol`

В model объявлено:

```ts
readonly origin = Symbol("rivto-document");
```

`Symbol` гарантирует уникальную identity. Две разные модели могут иметь
одинаковое описание `rivto-document`, но symbols всё равно не равны.

```ts
Symbol("rivto-document") !== Symbol("rivto-document")
```

Undo manager получает именно object identity текущей model. Это надёжнее
общей строки, которую мог случайно использовать чужой код.

## 3. Почему scopes четыре

Document storage разделён по ответственности.

### `blocks`

Map всех block records. Внутри records находятся content, props, layout,
children и metadata.

### `roots`

Array ID корневых блоков в порядке документа. Вставка или перемещение блока
может менять `roots`, даже если его record уже существует в `blocks`.

### `links`

Map first-class связей. Удаление блока может одновременно удалить links,
касающиеся его subtree.

### `pluginData`

Document-level collaborative данные plugins.

Если забыть scope, изменения этой части документа будут видимы, но не будут
корректно участвовать в локальной history.

## 4. Одна команда может затронуть несколько scopes

Рассмотрим `removeBlock(id)`:

1. находится container блока;
2. собираются ID всего удаляемого subtree;
3. удаляются block records;
4. ID удаляется из roots или children array;
5. удаляются links, указывающие на удалённые blocks.

Все шаги находятся внутри одной model transaction. Поэтому collaborator не
должен увидеть промежуточное состояние «block уже исчез, но link пока остался».
Undo также получает согласованную операцию, охватывающую затронутые structures.

## 5. Nested transactions

Публичный runtime открывает внешнюю transaction через `batchUpdates()`:

```ts
editor.batchUpdates(() => {
  editor.updateBlock(firstId, firstPatch);
  editor.updateBlock(secondId, secondPatch);
});
```

При этом editor operations сами вызывают методы модели, открывающие вложенные
transactions.

Получается вложенность:

```text
outer transaction: batchUpdates
├── nested transaction: first update
└── nested transaction: second update
```

Yjs выполняет вложенные вызовы в рамках активной outer transaction. Для
наблюдателей обе вставки образуют атомарное изменение.

```text
Alpha
     ↑ from + length
```

После вставки suffix исходный `from` остаётся правильным. Затем prefix
вставляется в начало. Если сначала вставить prefix, старый offset конца
сдвинется и потребует дополнительного пересчёта.

## 6. Structured paste тоже должна быть атомарной

Clipboard manager может:

- удалить выделенный диапазон;
- вставить несколько блоков;
- перенести suffix последнего блока;
- remap ID;
- восстановить links;
- поставить новый collapsed selection.

Document changes объединяются общей transaction. Локальный selection при этом
не является CRDT scope и обновляется отдельно.

Это означает, что Undo отвечает за collaborative content, но не обещает
вернуть точное прежнее browser selection.

## 7. Capture grouping и `stopCapturing()`

Yjs может объединять близкие по времени tracked transactions в один history
item. Это удобно при обычном наборе текста: пользователь ожидает, что Undo
отменит осмысленный фрагмент ввода, а не обязательно ровно один внутренний
`onInput`.

`CRDTUndoManager` поэтому предоставляет:

```ts
stopCapturing(): void
```

Вызов завершает текущую capture group. Следующая подходящая transaction начнёт
новый history item.

В текущем Rivto этот метод публично доступен через `editor.history`, но
built-in commands не вызывают его после каждой команды. Это важно знать при
изменении UX: граница command и граница Undo item не обязаны автоматически
совпадать один к одному.

Не добавляйте `stopCapturing()` повсюду «для надёжности». Сначала определите
ожидаемую пользовательскую семантику и закрепите её тестом.

## 8. Local и remote transaction

Сравним два пути.

### Локальная command

```text
editor.commands.execute("text.set")
  → DocumentModelImpl.setBlockText
  → document.transact(..., document.origin)
  → trackedOrigins совпал
  → операция может попасть в local history
```

### Remote provider update

```text
provider получил update
  → Y.Doc применил remote transaction с другим origin
  → document изменился и React обновился
  → trackedOrigins не совпал
  → операция не становится локальным Undo step
```

Это не означает, что remote operation игнорируется при вычислении результата
Undo. CRDT всё равно корректно объединяет состояние. Она лишь не выбирается
как «последнее действие этого пользователя».

## 9. Прямое изменение CRDT — опасная граница

Если integration обходит `DocumentModelImpl.transact()` и меняет CRDT с другим
origin, изменение может не попасть в history. Если использует неправильный
origin, оно может ошибочно считаться локальным.

Поэтому normal editor UI и plugins должны мутировать документ через commands,
а commands — через `DocumentModelImpl`.

## 10. No-op operations

Некоторые methods рано возвращаются:

```ts
if (!text) return;
if (length <= 0) return;
if (id === afterId) return;
```

No-op не должен создавать бессмысленную history entry. Иначе пользователь
нажимает Undo, но визуально ничего не происходит, и интерфейс кажется
сломавшимся.

## 11. Что не следует объединять

Не вся последовательность commands должна находиться в одной transaction.

Например, пользователь отдельно:

1. переместил блок;
2. через секунду изменил текст;
3. удалил link.

Это разные намерения. Outer transaction нужна, когда одна semantic operation
иначе временно нарушает инвариант или состоит из нескольких обязательных
model changes.

Хороший вопрос при review:

> Может ли observer безопасно увидеть документ после каждой внутренней
> операции?

Если нет, операции обычно должны находиться в общей transaction.
