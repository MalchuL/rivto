# Глава 03. EventRouter подробно

## 1. Зачем нормализовать события

Browser и React имеют свои event objects. Runtime managers не должны зависеть
от React types или DOM nodes.

React adapter строит portable event:

```ts
{
  type: "keydown",
  blockId: block.id,
  key: event.key,
  shiftKey: event.shiftKey,
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
  payload: { defaultBlockType, empty },
}
```

`EventRouter` может обработать его без import React.

## 2. Три фазы dispatch

Строгий порядок:

```text
1. active global plugin handlers
2. active handlers для current persisted block type
3. built-in fallback handlers
```

Каждая следующая фаза запускается, только если предыдущие handlers не вернули
`true`.

## 3. Global phase

Global plugins могут переопределить поведение независимо от block type.

Например, slash menu первым видит Escape. Если menu открыт, handler закрывает
его и возвращает `true`. Built-in key fallback уже не должен интерпретировать
тот же Escape.

## 4. Block phase

Router получает только `blockId`, а block type хранится в document. Поэтому он:

1. читает detached `editor.getBlocks()`;
2. рекурсивно flatten tree;
3. находит block по ID;
4. читает `block.type`;
5. запускает handlers для этого type.

Flatten нужен, потому что block может быть nested child, а не root.

Router специально не обращается к CRDT containers и остаётся на
DocumentModel boundary.

## 5. Fallback phase

Built-in fallback реализует default editor behavior:

- Enter добавляет block;
- empty Backspace удаляет block;
- Tab indent/outdent;
- Ctrl/Cmd+Z undo;
- drop перемещает block.

Plugin может забрать событие раньше, но если никто не забрал, core остаётся
работоспособным.

## 6. Short-circuit

Основной цикл концептуально выглядит так:

```ts
for (const handler of handlers) {
  if (handler(event, editor) === true) return true;
}
```

Проверяется именно `=== true`. Случайное truthy значение вроде объекта не
считается официальным claim.

Результат `dispatch()` сообщает renderer:

```ts
const handled = editor.events.dispatch(...);
if (handled) event.preventDefault();
```

Router сам не может вызвать `preventDefault`, потому что normalized event не
обязан содержать native DOM event.

## 7. Priority

Router entries имеют числовой priority. Большие values выполняются раньше
внутри plugin phase.

При равном priority современная stable sort сохраняет installation order.

Обычный `PluginManager` сейчас регистрирует contributions с default priority
`0`. Direct runtime integrations могут использовать methods router с explicit
priority, но plugin contract не содержит отдельного priority field.

## 8. Mode filtering

Перед handler router проверяет:

```ts
!entry.modes || entry.modes.includes(mode)
```

Inactive handler остаётся в registry, но пропускается. При смене mode не нужно
uninstall/reinstall plugins, а disposer остаётся тем же.

Built-in fallbacks не имеют mode metadata в router. Если fallback зависит от
mode, он проверяет mode внутри handler, как drop behavior.

## 9. `lastEvent`

В начале dispatch router записывает:

```ts
this.currentLastEvent = event.type;
```

и уведомляет diagnostics subscribers ещё до выполнения handlers.

Поэтому `lastEvent` означает «последний event дошёл до runtime», а не
«последний event был кем-то handled».

Даже unhandled event появляется в inspector.

## 10. Plugin cleanup

Disposer удаляет exact entry из array. После plugin disposal следующий
dispatch больше не вызывает handler.

Для block handler router дополнительно удаляет пустую map block type, когда во
всех event arrays больше нет entries. Это cleanup внутреннего индекса, не
изменение document.

## 11. Пример полного route

Есть:

- global plugin `analytics`, возвращает false;
- block plugin для `callout`, возвращает false;
- fallback pointerdown, возвращает true.

Event:

```ts
{ type: "pointerdown", blockId: "block-7" }
```

Если block-7 имеет type callout:

```text
analytics handler
  false
    ↓
callout handler
  false
    ↓
fallback
  true
    ↓
dispatch returns true
```

Если analytics вернёт true:

```text
analytics handler
  true
    ↓
dispatch returns true

callout и fallback НЕ запускаются
```

## 12. Unit test порядка

Существующий test складывает labels в array:

```ts
const calls: string[] = [];
```

После dispatch ожидается:

```ts
["plugin", "block", "fallback"]
```

Затем global plugin dispose, новый dispatch и expectation:

```ts
["block", "fallback"]
```

Так один test доказывает и порядок, и cleanup.

## 13. Частые ошибки handler

### Возвращать true всегда

Это блокирует core behavior даже для keys, которые plugin не обрабатывает.

### Мутировать document напрямую

Event policy должна вызвать command, иначе typing/history/validation paths
расходятся.

### Полагаться только на event.blockId

ID не сообщает block type. Используйте block-scoped contribution, когда type
важен, или безопасно найдите detached block.

### Хранить native event после dispatch

Portable runtime state не должно зависеть от lifetime React SyntheticEvent.
Извлеките необходимые простые values во время normalization.
