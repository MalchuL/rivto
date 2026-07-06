# Глава 02. Все виды plugin contributions

## 1. Blocks

Plugin может передать:

```ts
blocks: [{
  type: "callout",
  content: "inline",
  title: "Callout",
  defaultProps: { tone: "info" },
  render: CalloutRenderer,
}]
```

`BlockRegistry` проверяет unique non-empty type. Definition не хранит сами
blocks; persisted values находятся в `DocumentModelImpl`.

### Availability по mode

Mode availability block выводится из renderer declaration:

```ts
render: {
  edgeless: CanvasShapeRenderer,
}
```

Такой block доступен для создания только в edgeless mode. Если `render` — одна
function или отсутствует, built-in default presentation может работать в обоих
modes.

Plugin-level `modes` не переписывает block definition. Для block creation
источником правды остаётся renderer availability.

### Unknown stored block

Если plugin uninstall, persisted block не удаляется автоматически. Renderer
может показать `Unknown block type`, а document сохраняет данные losslessly.
Lifecycle extension code не должен уничтожать user data при отключении plugin.

## 2. Commands

Plugin command имеет форму:

```ts
commands: {
  "demo.addCallout": (editor, payload) => {
    return editor.commands.execute("block.insert", {
      block: { type: "callout", content: "Hello" },
    });
  },
}
```

Manager оборачивает handler mode check и регистрирует его в общем
`CommandRegistry`.

### Runtime payload validation

Plugin сам отвечает за validation своего unknown payload:

```ts
if (!value || typeof value !== "object") {
  throw new Error("payload must be an object");
}
```

Static typing host может добавить explicit command map:

```ts
type DemoCommands = {
  "demo.addCallout": CommandSpec<{ text: string }, string>;
};

editor.commands.execute<DemoCommands>(
  "demo.addCallout",
  { text: "Hello" },
);
```

Generic помогает TypeScript caller, но не заменяет runtime validation.

### Commands должны использовать built-ins

Plugin обычно выражает mutation через существующие commands:

```text
plugin command
  → block.insert / block.prop.set / text.set
  → validated runtime boundary
  → DocumentModel
  → CRDT history
```

## 3. Global events

```ts
events: {
  keydown: (event, editor) => {
    if (event.key !== "Escape") return false;
    // действие
    return true;
  },
}
```

Global handler получает события этого type для любых blocks в active mode.

Возвращаемое значение:

```text
true             полностью обработал, остановить route
false/undefined  не претендую, продолжить route
```

Handler не должен возвращать `true` только потому, что он «увидел» событие.
Это запретит block behavior и built-in fallback.

## 4. Block events

```ts
blockEvents: {
  callout: {
    pointerdown: (event, editor) => false,
  },
}
```

Handler запускается только когда:

- event содержит `blockId`;
- runtime находит этот ID в detached document tree;
- persisted block type равен `callout`;
- mode restriction разрешает handler;
- более ранний global plugin handler не вернул `true`.

При регистрации block type уже должен находиться в `BlockRegistry`.

## 5. Slash items

```ts
slashItems: [{
  title: "Callout",
  aliases: ["note", "aside"],
  group: "Demo",
  block: { type: "callout" },
}]
```

`PluginManager.getSlashItems()` собирает items только active-mode plugins.
Но показ popup, query и выполнение action принадлежат отдельному slash-menu
plugin.

Это важное разделение:

```text
feature plugins       предоставляют slash actions
slash-menu plugin     владеет interaction state и policy
React renderer        рисует popup
```

Если slash-menu plugin не установлен, typing `/` не обязан показывать toolbar.
Contributions существуют, но нет interaction owner.

## 6. Custom slash action

Вместо `block` item может иметь `run`:

```ts
{
  title: "Insert template",
  run: (editor, blockId) => {
    editor.commands.execute(...);
  },
}
```

`run` подходит для compound actions. Mutation всё равно должна проходить через
commands.

## 7. UI contributions

```ts
ui: [{
  id: "demo.addCallout.toolbar",
  slot: "toolbar",
  title: "Add callout",
  command: "demo.addCallout",
  modes: ["edgeless"],
  blockTypes: ["callout"],
}]
```

Fields:

- `id` — unique identity contribution, не обязательно command name;
- `slot` — `toolbar` или `sideMenu`;
- `title` — label;
- `command` — что выполнить;
- `modes` — где показывать;
- `blockTypes` — для какого active block context показывать.

UIRegistry только фильтрует metadata. Он не проверяет наличие command и не
выполняет её. Это renderer responsibility при activation.

## 8. Наследование modes у UI

Manager регистрирует:

```ts
{
  ...item,
  modes: item.modes ?? plugin.modes,
}
```

То есть item-specific modes имеют приоритет. Если у item modes не указаны,
используется plugin default.

## 9. Setup

Setup подходит для resources, которые не выражаются registry contribution:

```ts
setup: (editor) => {
  const unsubscribe = editor.subscribe(() => { ... });
  return () => unsubscribe();
}
```

Другие примеры:

- window event listener;
- integration subscription;
- timer;
- connection, принадлежащий plugin.

Setup не нужен для commands/events/UI: для них manager уже умеет lifecycle.

## 10. Slash plugin как пример owned state

Slash plugin:

1. слушает normalized `input` event;
2. если text начинается с `/`, сохраняет `{ blockId, query }`;
3. уведомляет собственных subscribers;
4. React показывает menu;
5. `slash.execute` находит item;
6. выполняет custom `run` или block replacement commands;
7. закрывает state;
8. setup subscription закрывает menu, если target block исчез.

Это полноценная feature policy, реализованная обычными plugin mechanisms.

## 11. Contribution ownership table

| Contribution | Где хранится | Кто использует | Как удаляется |
| --- | --- | --- | --- |
| blocks | `BlockRegistry` | runtime и renderers | registry disposer |
| commands | `CommandRegistry` | UI/plugins/host | command handle dispose |
| events | `EventRouter` | renderer dispatch | router disposer |
| blockEvents | `EventRouter` by block type | router dispatch | router disposer |
| slashItems | installed plugin metadata | slash plugin query | plugin record removal |
| ui | `UIRegistry` | renderer | registry disposer |
| setup resource | внешний owner | plugin-specific | returned cleanup |

