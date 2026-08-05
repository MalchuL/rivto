# Глава 04. Обратный путь и отладка полного круга

## 1. Render не выдаёт mutable model objects

Когда пользователь меняет UI, renderer не присваивает новое value в `block`.
Он формирует command payload.

```text
read:  Block prop
write: Command payload
```

Так direction и validation остаются явными.

## 2. Полный пример: изменение image URL

JSX:

```tsx
<input
  value={url}
  onChange={(event) =>
    editor.commands.execute("block.prop.set", {
      id: block.id,
      key: "url",
      value: event.target.value,
    })
  }
/>
```

Полный круг:

```text
input onChange
  ↓
block.prop.set command
  ↓
runtime validates id/key
  ↓
DocumentModel.setBlockProp
  ↓
props validator from BlockRegistry
  ↓
CRDT props map updated in transaction
  ↓
CRDT update event
  ↓
runtime revision
  ↓
React rereads Block[]
  ↓
input value получает новый block.props.url
```

## 3. Полный пример: typing

Browser сначала меняет contentEditable DOM. `onInput` читает полный plain text
и вызывает `text.set`.

DocumentModel не переписывает всю CRDTText вслепую. `setBlockText`:

1. сравнивает current и next strings;
2. находит общий prefix;
3. находит общий suffix;
4. удаляет только изменившийся middle range;
5. вставляет только новый middle range.

Это сохраняет identity CRDTText и уменьшает конфликтующую область concurrent
editing.

После update React render видит то же content. Focused DOM уже совпадает, поэтому
layout effect не переписывает его и caret остаётся.

## 4. Полный пример: drag canvas element

Pointermove вычисляет geometry delta и выполняет:

```ts
editor.elements.updateElement(elementId, { frame: { x, y } })
```

Element manager patchит только supplied frame keys. После каждого update
renderer получает новый element frame и меняет absolute style.

```text
pointer coordinate
  → element frame partial
  → CRDT element frame map
  → revision
  → style left/top
```

Element geometry collaborative, поэтому remote client проходит read path и
видит движение.

## 5. Полный пример: Enter

```text
DOM keydown Enter
  ↓
React dispatch RuntimeEvent keydown
  ↓
global plugin handlers
  ↓
block handlers
  ↓
built-in fallback handleKeydown
  ↓
block.insert command
  ↓
BlockRegistry availability/defaults/schema
  ↓
DocumentModel.insertBlock
  ↓
CRDT update and React render
  ↓
editor.focus(newId) microtask
  ↓
query committed DOM by data-rivto-block
```

Microtask нужен, потому что command возвращает ID раньше, чем React обязательно
успел commit element нового block.

## 6. Почему event и command — два разных шага

Event отвечает:

> Кто должен обработать взаимодействие?

Command отвечает:

> Какое именованное действие выполнить и с каким payload?

Например, plugin может перехватить Enter и выполнить другую command. Renderer
при этом только нормализует browser event.

## 7. Validation находится до storage

Built-in command проверяет shape/primitives payload. Для block insertion
дополнительно проверяются definition и mode availability. BlockRegistry
применяет defaults/schema. DocumentModel проверяет domain invariants и
существование IDs.

Renderer не является trust boundary: command можно вызвать из plugin, host или
JavaScript без React.

## 8. Почему direct DocumentModel всё же public read boundary

`editor.document` доступен для:

- persistence snapshots;
- providers;
- advanced integrations;
- detached document reads.

UI и plugins должны использовать commands для mutations. Direct model change
всё равно вызовет document subscription и render, но может обойти command
validation, diagnostics и product policy.

```text
"render обновится" не означает "архитектурный путь правильный"
```

## 9. Command result и render timing

`block.insert` синхронно возвращает ID после model transaction. Это не означает,
что DOM element уже существует.

Различайте:

```text
model commit завершён
React render запланирован
React DOM commit завершён
browser paint завершён
```

Поэтому imperative DOM action выполняется после reconciliation, например через
runtime `focus()` microtask или layout effect.

## 10. Отладка: DOM не изменился после command

Проверяйте строго по цепочке.

### Шаг 1. Command выполнилась

Посмотрите `editor.commands.lastExecuted` или поймайте error. Unknown/unavailable
command не дошла до model.

### Шаг 2. Model value изменилась

```ts
editor.getBlocks()
```

Если нет, проблема в payload, validation или model operation.

### Шаг 3. CRDT update дошёл до runtime

Проверьте изменение `editor.revision` и что runtime не destroyed.

### Шаг 4. React использует тот же editor instance

Host мог случайно создать новый runtime на render или передать другой instance.

### Шаг 5. Block definition resolve

Если data есть, но виден Unknown block, проверьте `editor.blocks.get(type)` и
plugin lifecycle.

### Шаг 6. Focused contentEditable reconciliation

Для текста сравните DOM `innerText` и `block.content`.

## 11. Отладка: DOM изменился, model нет

Это особенно вероятно с contentEditable, потому что browser мутирует DOM сам.

Проверьте:

- сработал ли `onInput`;
- извлечён ли правильный text;
- выполнена ли `text.set` command;
- не бросила ли validation/model;
- не был ли DOM mutation внутри custom renderer без command.

После следующего external rerender несохранённый DOM может исчезнуть — это
симптом разрыва write path.

## 12. Отладка: local работает, remote нет

Local DOM может выглядеть правильно даже до model round trip. Поэтому отдельно
проверьте canonical snapshot.

Затем:

- provider connected?
- remote CRDT update applied?
- DocumentModel subscribe получает update?
- runtime revision меняется?
- remote client имеет definition для block type?

Если remote client не имеет plugin, data может быть правильной, а presentation
будет Unknown block — это не потеря model.

## 13. Отладка: plugin установили, unknown block остался

Проверяйте:

1. plugin `use()` завершился без rollback;
2. definition type точно совпадает с persisted string;
3. runtime `changed()` вызван;
4. React подписан на этот runtime revision;
5. mode-specific renderer доступен;
6. custom renderer не бросает exception.

## 14. Отладка: лишние renders

Revision intentionally coarse: одно изменение может уведомить несколько
stores. Не оптимизируйте по ощущению.

Сначала profiler должен показать реальную проблему. Затем определите:

- materialization cost;
- React reconciliation cost;
- contentEditable imperative writes;
- слишком частые pointer layout commands.

Не вводите duplicated React blocks state как «оптимизацию»: correctness cost
обычно намного выше.

## 15. Tests по слоям

### DocumentModel unit tests

Проверяют:

- tree materialization;
- CRUD semantics;
- props/layout patching;
- links;
- snapshots;
- normalization;
- CRDT collaboration behavior.

### Runtime tests

Проверяют:

- commands;
- validation;
- mode availability;
- plugin lifecycle;
- selection reconciliation;
- undo/redo.

### Browser E2E

Проверяют:

- DOM input действительно вызывает model mutation;
- после render пользователь видит результат;
- focus/caret сохраняются;
- drag/resize работает;
- remote/persistence observable scenarios;
- mode switching выбирает правильный renderer.

## 16. Минимальный integration test полного круга

Сценарий:

1. открыть demo;
2. найти paragraph contentEditable;
3. ввести новый text;
4. проверить DOM text;
5. проверить snapshot inspector или reload persistence;
6. выполнить Undo;
7. проверить DOM снова.

Он доказывает несколько границ одновременно, но root cause при падении нужно
локализовать layer tests.

## 17. Checklist новой feature

- Какие поля feature хранит collaborative model?
- Какие значения только local presentation?
- Portable type не содержит DOM/React/Yjs objects?
- Mutation имеет named command?
- Payload проверяется вне renderer?
- Model operation atomic там, где нужен invariant?
- Update автоматически вызывает runtime revision?
- Persisted type имеет registered definition?
- Renderer читает detached props, а не live CRDT?
- Mode-specific presentation определена?
- Unknown plugin data остаются lossless?
- DOM-only imperative state синхронизируется после commit?
- Unit tests проверяют policy/model, E2E — browser bridge?

## 18. Финальная схема полного круга

```text
                         READ PATH

Yjs native structures
        ↓ adapter wrappers
DocumentModelImpl storage
        ↓ materialize
portable Block[] + Link[]
        ↓ runtime invalidation/revision
React useSyncExternalStore
        ↓
outer mode renderer
        ↓ type lookup in BlockRegistry
BlockView / custom block renderer
        ↓ commit
DOM

                         WRITE PATH

DOM event
        ↓ normalize
EventRouter
        ↓ choose behavior
CommandRegistry
        ↓ validate
DocumentModelImpl transaction
        ↓
Yjs native structures
        ↓ update event
READ PATH начинается снова
```

Если эта схема понятна, большая часть editor architecture перестаёт быть
набором случайных файлов: каждый module занимает конкретное место на одном из
двух направлений.
