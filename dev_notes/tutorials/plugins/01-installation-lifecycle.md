# Глава 01. Atomic installation и lifecycle

## 1. Почему установка состоит из нескольких шагов

Plugin contributions живут в разных owners:

```text
blocks       в BlockRegistry
commands     в CommandRegistry
events       в EventRouter
ui           в UIRegistry
setup        во внешних subscriptions/resources
```

Каждая регистрация может завершиться ошибкой. Например:

- block type уже занят;
- command name уже занят;
- block event ссылается на неизвестный block type;
- UI contribution ID уже занят;
- setup hook сам бросил exception.

## 2. Что означает atomic install

После `editor.use(plugin)` допустимы только два результата:

```text
успех: все contributions установлены
ошибка: ни одной contribution plugin не осталось
```

Недопустимо:

```text
block зарегистрирован
command конфликтует и бросает error
block случайно остаётся в runtime
```

Такой half-installed plugin очень трудно диагностировать.

## 3. Массив disposers

В начале `use()` создаётся:

```ts
const remove: Array<() => void> = [];
```

Каждый registry возвращает disposer. После успешной регистрации manager
добавляет его в массив:

```ts
remove.push(this.blocks.register(block));
remove.push(command.dispose);
remove.push(this.events.registerPlugin(...));
remove.push(this.ui.register(...));
```

Disposer — функция, удаляющая ровно тот ресурс, который создала регистрация.

## 4. Почему disposer связан с exact entry

Например, command registration хранит ссылку на конкретный handler:

```ts
if (this.handlers.get(name) === stored) {
  this.handlers.delete(name);
}
```

Даже если disposer случайно вызывается поздно, он не удалит чужой новый
handler под тем же именем. Registries также делают disposal idempotent там,
где это требуется: повторный вызов не повреждает runtime.

## 5. Порядок регистрации

Текущий manager устанавливает:

1. blocks;
2. commands;
3. global events;
4. block events;
5. UI;
6. setup hook;
7. запись в `installed` map.

Blocks идут до block events, потому что `EventRouter.registerBlock()` проверяет
существование native block type.

Setup идёт последним: hook может рассчитывать, что собственные commands и
definitions plugin уже доступны.

## 6. Rollback при ошибке

Весь installation body находится в `try`. При exception:

```ts
remove.reverse().forEach((dispose) => dispose());
throw error;
```

Почему reverse:

```text
установили A → B → C
откатываем C → B → A
```

Поздний ресурс может зависеть от раннего. Обратный порядок повторяет обычную
логику stack cleanup.

После rollback исходная ошибка пробрасывается caller. Manager не маскирует её
общим сообщением.

## 7. Важный предел текущей atomicity

Manager может rollback только resources, disposers которых он уже получил.

Если `setup()` успел создать side effect, а затем сам бросил error до возврата
cleanup, manager не знает, как этот незавершённый side effect убрать.

Поэтому хороший setup:

- сначала валидирует необходимые условия;
- аккуратно создаёт resources;
- не бросает после необратимого внешнего действия;
- всегда возвращает cleanup для созданных subscriptions/listeners.

## 8. Successful installation

После setup manager записывает:

```ts
this.installed.set(plugin.id, { plugin, cleanup, remove });
```

Затем вызывает `onChange()`. Runtime увеличивает revision, и renderers могут
увидеть новые block definitions или UI actions.

Caller получает:

```ts
return () => this.unuse(plugin.id);
```

Типичный host lifecycle:

```ts
const disposePlugin = editor.use(plugin);

// позже
disposePlugin();
```

## 9. Uninstall

`unuse(id)`:

1. находит installed record;
2. ничего не делает для неизвестного ID;
3. вызывает setup cleanup;
4. вызывает registry disposers в reverse order;
5. удаляет record из `installed`;
6. вызывает `onChange()`.

## 10. Почему setup cleanup запускается первым

Комментарий в коде объясняет: cleanup может нуждаться в собственных commands
или definitions, пока освобождает subscription.

Если сначала удалить registries, cleanup мог бы вызвать уже неизвестную
command или не найти собственный block type.

```text
cleanup setup resources
  ↓
remove UI/events/commands/blocks
```

## 11. Destroy всех plugins

`PluginManager.destroy()` проходит installed IDs в reverse installation order:

```ts
[...this.installed.keys()]
  .reverse()
  .forEach((id) => this.unuse(id));
```

Если plugin B был установлен после A и опирался на A, B освобождается первым.

`EditorRuntime.destroy()` вызывает `plugins.destroy()` до удаления runtime-owned
block definitions и очистки commands.

## 12. Проверка atomic rollback в tests

Существующий test сначала занимает command name:

```ts
editor.commands.register("taken", ...);
```

Затем пытается установить plugin:

```ts
{
  id: "broken",
  blocks: [{ type: "temporary", content: "none" }],
  commands: { taken: ... },
}
```

Block успевает зарегистрироваться, command конфликтует. После exception test
проверяет:

```ts
expect(editor.blocks.has("temporary")).toBe(false);
```

Это и есть доказательство atomicity на observable public state.

## 13. Ownership diagram

```text
PluginManager InstalledPlugin
│
├── plugin metadata
├── setup cleanup
└── remove[]
    ├── unregister block A
    ├── dispose command B
    ├── unregister event C
    └── unregister UI D
```

Сам manager не копирует реализации specialized registries. Он только связывает
их ownership в одну lifecycle boundary.

