# Глава 05. Как работают Copy, Cut и Paste

Clipboard — потребитель selection. Он должен понять один и тот же диапазон для
трёх задач:

- создать plain text;
- сохранить rich block structure;
- изменить DocumentModel при Cut или Paste.

Главные файлы:

- `src/editor/managers/clipboard-bundle.ts` — чистые преобразования данных;
- `src/editor/managers/clipboard-manager.ts` — browser clipboard и mutations.

## 1. Почему browser text недостаточно

Блок Rivto содержит больше, чем строку:

```ts
{
  id,
  type,
  content,
  props,
  pluginData,
  children,
  layout,
}
```

Plain text Copy потеряет всё кроме content. Поэтому Rivto пишет несколько MIME
formats одновременно.

## 2. Четыре clipboard formats

### application/x-rivto+json

Собственный MIME:

```text
application/x-rivto+json
```

Содержит versioned bundle, blocks и internal links. Другой Rivto editor может
восстановить types и metadata.

### text/html

Fallback для rich editors, которые не знают Rivto MIME. Descendants сохраняют
иерархию через вложенные `ul`/`li` lists.

### text/markdown

Markdown-aware applications получают roots как raw block text, а descendants
как вложенные list items.

### text/plain

Universal fallback для terminal, textarea, messenger и любого приложения.
Descendants получают отступ в два пробела на каждый уровень hierarchy.

Все четыре создаются из одного normalized selection. Иначе JSON и text могли бы
описывать разные границы.

## 3. ClipboardBundle

```ts
interface ClipboardBundle {
  version: 3;
  blocks: Block[];
  links: Link[];
  elements?: DocumentElement[];
  selectedElementIds?: string[];
}
```

Clipboard schema version не связана с document snapshot version. Их evolution
может идти отдельно.

## 4. Зачем нормализовать direction

Runtime хранит gesture direction:

```text
anchor = B:4
head   = A:1
```

Mutation не может применяться «с B назад до A». Ей нужны более ранний start и
более поздний end:

```text
start = A:1
end   = B:4
```

`editor.selection.normalize()` создаёт временный `NormalizedSelection`, не
меняя состояние `SelectionManager`.

## 5. NormalizedSelection

```ts
interface NormalizedSelection {
  start: EditorPosition;
  end: EditorPosition;
  blocks: Block[];
}
```

- `start` всегда раньше в document order;
- `end` всегда позже;
- `blocks` содержит touched blocks depth-first от first до last.

## 6. flattenBlocks

DocumentModel хранит tree. Clipboard нужен линейный visible order.

```text
A
├── B
└── C
D
```

становится:

```ts
[A, B, C, D]
```

Это depth-first traversal, совпадающий с block renderer.

## 7. Нормализация TextSelection

Алгоритм:

1. Flatten document.
2. Найти index anchor block.
3. Найти index head block.
4. Если один block раньше — он содержит start.
5. Если block один, сравнить offsets.
6. Скопировать более раннюю position в `start`.
7. Скопировать более позднюю position в `end`.
8. Взять inclusive slice blocks между indexes.

Пример backward selection:

```text
A = Alpha
B = Beta
anchor = B:2
head = A:2
```

Normalized:

```text
start = A:2
end = B:2
blocks = [A, B]
```

Selected text: `pha\nBe`.

Stored runtime selection всё ещё `B:2 → A:2`.

## 8. Нормализация BlockSelection

Для structural selection offsets отсутствуют. Clipboard считает каждый block
выбранным полностью:

1. IDs превращаются в Set.
2. Flattened document фильтруется по Set.
3. Start = offset 0 первого selected block.
4. End = content length последнего selected block.

`blocks` остаётся в visible order.

## 9. createClipboardPayload

Copy не должен менять document. Поэтому функция работает с detached clones.

Порядок:

1. Normalize selection.
2. Найти top-level selected subtrees.
3. Глубоко скопировать blocks.
4. Найти boundary blocks внутри copies.
5. Обрезать content first/last по offsets.
6. Собрать internal links.
7. Получить portable text каждого block через `BlockDefinition.toRawText` с
   fallback на `content`.
8. Создать JSON, hierarchical HTML, Markdown и plain text.

## 10. Почему selected parent подавляет selected child

Если selection содержит parent A и child B, копирование A уже включает B в
`A.children`.

Если также добавить B как отдельный root clipboard bundle, Paste создаст B два
раза.

`indexParents()` строит child → parent map. `copySelectedSubtrees()` исключает
block, если любой его ancestor уже selected.

## 11. Clone перед trimming

Boundary content обрезается только в clipboard representation.

Например:

```text
Document A.content = "Alpha"
Selected A:2 → A:5
Clipboard copy A.content = "pha"
Document A.content остаётся "Alpha"
```

Поэтому `cloneBlock()` копирует block, props, pluginData и children. Геометрия
не является частью блока и переносится только через `elements` edgeless bundle.

## 12. Обрезка boundary blocks

### Один block

```ts
content.slice(start.offset, end.offset)
```

### Несколько blocks

First block:

```ts
content.slice(start.offset)
```

Last block:

```ts
content.slice(0, end.offset)
```

Middle blocks остаются целыми.

## 13. Links

Bundle включает link только если оба endpoint block IDs входят в copied tree.

Почему нельзя копировать link с одним endpoint: после Paste второй endpoint мог
бы ссылаться на block, которого в destination document нет.

## 14. HTML и escaping

Каждый visible copied block превращается в `<p>...</p>`.

Символы `& < > " '` escape-ятся. Иначе block content мог бы стать HTML markup,
а не текстом.

Plain text соединяет visible contents через newline.

## 15. Browser Copy event

React root получает `onCopy`.

Путь:

1. Определить context block из current selection.
2. Отправить normalized `copy` event plugins.
3. Если plugin вернул `true`, builtin Copy не выполняется.
4. Иначе command вызывает `handleCopyEvent()`.
5. Создаётся payload.
6. Проверяется `event.clipboardData`.
7. Вызывается `event.preventDefault()`.
8. Через `setData` записываются JSON, HTML и plain text.

Synchronous event path важен: browsers часто разрешают запись custom MIME
только внутри user-triggered clipboard event.

## 16. Async copy() command

Есть отдельная команда `clipboard.copy`, полезная не только native event.

Если доступен modern Clipboard API:

1. Создаётся `ClipboardItem` с тремя Blob.
2. Вызывается `navigator.clipboard.write()`.

Если `ClipboardItem`/write отсутствует, используется `writeText()`.

В Node/test environment функция всё равно возвращает plain text, даже без
`navigator`.

## 17. Cut: сначала Copy, потом mutation

`cut()` сохраняет selection до async Copy:

```ts
const payload = editor.clipboard.copy();
if (payload) editor.selection.delete();
```

Core не ожидает browser API: React сначала синхронизирует DOM selection, затем
`ClipboardManager` копирует и удаляет одну и ту же текущую selection.

## 18. Cut целых блоков

Если original type не `text`:

1. Каждый normalized selected block удаляется.
2. Удаления выполняются внутри одной transaction.
3. Selection очищается.

Нельзя использовать text replacement для BlockSelection. Иначе первый selected
block остался бы пустым, хотя пользователь выбрал его как structural object.

## 19. Cut text range

Если range non-collapsed, вызывается:

```ts
replaceRange(range, "")
```

### Same block

```text
Al[ph]a → Ala
```

### Cross-block

```text
A: Al[pha
B: Be]ta
```

Сохраняются:

```text
prefix = "Al"
suffix = "ta"
result = "Alta"
```

Block A остаётся, block B удаляется, caret становится A:2.

## 20. replaceRange подробно

1. `target` = первый normalized block.
2. `end` = последний normalized block.
3. `prefix = target.content.slice(0, start.offset)`.
4. `suffix = end.content.slice(end.offset)`.
5. Начинается document transaction.
6. Все touched blocks после target удаляются.
7. Target text становится `prefix + value + suffix`.
8. Transaction завершается.
9. Selection collapses после inserted value.

Type, ID, props и pluginData target не меняются.

## 21. Почему mutation одна transaction

Cross-block replacement состоит из нескольких низкоуровневых изменений.

Без outer transaction collaborator мог бы временно увидеть:

```text
blocks уже удалены
target text ещё старый
```

Transaction делает user operation атомарной для CRDT observers и history.

## 22. Browser Paste event

До ClipboardManager React синхронно читает свежий native caret.

Затем:

1. Plugins получают paste event первыми.
2. Builtin handler вызывает `preventDefault()`.
3. Проверяет custom Rivto MIME.
4. Если его нет, берёт plain text.

Priority нужен, чтобы Paste из Rivto сохранял structure, но Paste из других apps
всё равно работал.

## 23. Plain text Paste

### Есть valid range/caret

Используется `replaceRange(range, value)`.

Newlines остаются внутри content того же block. Они не создают автоматически
несколько blocks.

### Selection отсутствует

1. Создаётся новый block `defaultBlockType`.
2. Его content = pasted value.
3. Selection collapses в конце нового block.

Default type используется только потому, что существующего destination block
нет.

## 24. Structured Paste: зачем remap IDs

Copied block IDs уже существуют в source document. Paste обратно в тот же
document не может вставить дубликат ID.

`remapClipboardBundle()` создаёт новый UUID для каждого inserted block и map:

```text
old ID → new ID
```

Links затем переписываются через эту map.

В edgeless paste remap также охватывает element IDs, group children и
`blockIds`. Frames вставленных top-level elements сдвигаются, чтобы pasted
objects не оказались точно под original. Page/block paste игнорирует элементы
и не переносит canvas geometry.

## 25. Structured Paste без destination selection

Если selection нельзя нормализовать:

1. Все copied roots получают новые IDs.
2. Они вставляются как новые blocks.
3. Их links вставляются с remapped endpoints.
4. Caret collapses в конце последнего inserted block.

Первый copied block не «поглощается», потому что нет существующего target.

## 26. Structured Paste в caret/range

Пример:

```text
Target: "Hello |world"
Copied block 1: "First"
Copied block 2: "Second"
```

Желаемый результат:

```text
Target: "Hello First"
New block: "Second|world"
```

Почему первый copied block не вставляется отдельно: обычный editor paste в
caret должен продолжить current paragraph и сохранить его type/metadata.

## 27. Structured Paste пошагово

1. Normalize current selection.
2. `target` = первый touched block.
3. Вычислить unselected prefix target.
4. Вычислить unselected suffix последнего touched block.
5. Remap clipboard bundle, но old ID первого copied root сопоставить с
   существующим target ID.
6. Начать transaction.
7. Удалить selected continuation blocks.
8. Поставить target text:
   `prefix + firstCopiedContent`.
9. Children первого copied root вставить и indent под target.
10. Остальные copied roots вставить как siblings с новыми IDs.
11. Добавить old suffix к последнему inserted block. Если copied root один,
    suffix остаётся в target.
12. Вставить remapped links.
13. Завершить transaction.
14. Collapse caret после copied content, но перед old suffix.

## 28. Почему target metadata сохраняется

Paste меняет только target text. Он не заменяет block object.

Это сохраняет:

- target type;
- target ID;
- props;
- pluginData;
- layout;
- external links к target.

First copied block даёт content и children, но не захватывает identity target.

## 29. collapse после mutation

ClipboardManager напрямую вызывает SelectionManager:

```ts
{
  type: "text",
  anchor: { blockId, offset },
  head: { blockId, offset },
}
```

Это internal path: manager только что закончил transaction и точно знает
существующий destination ID и рассчитанный offset.

Selection subscribers запускают React, а layout effect восстанавливает native
caret в новом DOM.

## 30. Error boundaries и доверие

Structured JSON version 3 и arrays проверяются в `remapClipboardBundle()`.
Старые edgeless payloads намеренно отклоняются без миграции plugin data.

Однако custom clipboard data всё равно рассматривается как внешние данные.
При расширении schema нельзя доверять TypeScript cast: runtime browser может
передать любой JSON.

## 31. Полный Copy → Paste пример

Source:

```text
Heading H: "Title"
Paragraph P: "Hello"
Link H → P
```

BlockSelection `[H, P]`.

Copy создаёт:

```text
JSON: types, props, content, H/P tree, internal link
HTML: <p>Title</p><p>Hello</p>
Text: Title\nHello
```

Paste без destination:

```text
H' с новым ID
P' с новым ID
Link H' → P' с новым ID
```

Original H/P не изменяются.

## 33. Итог главы

Clipboard pipeline:

```text
directed selection
→ normalized ordered range
→ cloned/trimmed payload для Copy
→ remapped IDs для Paste
→ atomic DocumentModel transaction
→ collapsed portable caret
→ React restores native caret
```

Финальная глава объясняет, как безопасно менять этот pipeline и быстро находить
ошибку: [contributing и debugging](./06-contributing-and-debugging.md).
