# Глава 00. Модель расширения runtime

## 1. Зачем editor нужны plugins

Core редактора не должен знать все возможные продукты и block types. Одному
приложению нужен callout, другому database row, третьему diagram shape.

Если добавлять всё в core, он быстро становится набором product-specific
условий:

```ts
if (block.type === "callout") ...
if (product === "wiki") ...
if (mode === "edgeless" && pluginEnabled) ...
```

Plugin system даёт extension code заранее определённые точки входа.

## 2. Plugin не равен block definition

`BlockDefinition` описывает один persisted native block type:

- type;
- inline content или none;
- default props;
- prop schema;
- renderer.

Plugin является контейнером lifecycle и может владеть несколькими definitions,
commands, handlers и UI actions.

```text
один plugin
  ├── callout block
  ├── warning block
  ├── insert-callout command
  ├── keyboard handler
  └── toolbar action
```

## 3. Полный `RivtoPlugin` contract

Упрощённо interface выглядит так:

```ts
interface RivtoPlugin {
  id: string;
  modes?: EditorMode[];
  blocks?: BlockDefinition[];
  commands?: Record<string, PluginCommand>;
  events?: Partial<Record<RuntimeEventType, RuntimeEventHandler>>;
  blockEvents?: Record<string, Partial<Record<RuntimeEventType, RuntimeEventHandler>>>;
  slashItems?: SlashItem[];
  ui?: UIContribution[];
  setup?: (editor: RivtoEditorApi) => void | (() => void);
}
```

Все поля, кроме `id`, optional. Минимальный plugin:

```ts
const plugin = { id: "acme.empty" };
```

Он технически валиден, хотя ничего полезного не добавляет.

## 4. Зачем нужен уникальный `id`

`id` определяет owner lifecycle unit.

```ts
editor.use({ id: "acme.callouts", ... });
```

Если второй plugin использует тот же ID, `PluginManager` бросает ошибку:

```text
Plugin acme.callouts is already registered
```

Без уникальности disposer не знал бы, какой набор contributions удалять, а
debugging event ownership был бы двусмысленным.

Практический формат:

```text
organization.feature
rivto.slash-menu
acme.diagram
```

## 5. Plugin-level `modes`

```ts
{
  id: "acme.canvas-tools",
  modes: ["edgeless"],
}
```

Это default restriction для:

- commands;
- global events;
- block events;
- UI items без собственных `modes`.

Важно: mode не означает, что plugin физически uninstall при переключении.
Contributions остаются зарегистрированными, но mode-aware lookup или wrapper
не даёт им участвовать.

Почему commands остаются зарегистрированными:

- command name ownership остаётся стабильным;
- другой plugin не может занять имя, пока owner установлен;
- попытка выполнить inactive command даёт ясную ошибку `unavailable`, а не
  случайный `Unknown command`.

## 6. Кто владеет состоянием plugin

Есть два основных варианта.

### Состояние внутри closure

Slash plugin хранит открытый query:

```ts
let state: SlashMenuState | null = null;
const listeners = new Set<() => void>();
```

Это локальное ephemeral state. Оно не collaborative и не должно находиться в
DocumentModel.

### Collaborative plugin data

Если данные должны синхронизироваться и сохраняться, plugin выполняет built-in
commands, которые меняют block plugin data или document snapshot structures.

Нельзя делать collaborative state обычной переменной closure: другой client
её не увидит, persistence её потеряет.

## 7. Кто рендерит plugin UI

`PluginManager` ничего не рисует.

Plugin регистрирует декларативную metadata:

```ts
{
  id: "demo.addCallout",
  slot: "toolbar",
  title: "Add callout",
  command: "demo.addCallout",
}
```

React binding спрашивает `UIRegistry`, получает actions и превращает их в
buttons. Другой renderer может показать те же actions как menu items или
keyboard palette.

Это разделение важно:

```text
plugin говорит ЧТО доступно;
renderer решает КАК это показать.
```

## 8. Как plugin получает editor

Command handler:

```ts
"demo.addCallout": (editor, payload) => { ... }
```

Event handler:

```ts
pointerdown: (event, editor) => { ... }
```

Setup hook:

```ts
setup: (editor) => { ... }
```

Везде передаётся публичный `RivtoEditorApi`, а не private fields
`EditorRuntime`. Plugin должен использовать registries и commands, доступные
через этот contract.

## 9. Почему `getEditor` в constructor manager — функция

`PluginManager` создаётся внутри constructor `EditorRuntime`, пока runtime ещё
инициализируется:

```ts
this.plugins = new PluginManager(() => this, ...);
```

Lazy accessor не читает editor немедленно. Он вызывается позже, когда plugin
handler или setup действительно нужен и runtime уже полностью сконструирован.

Это не глобальный service locator. Функция имеет узкую задачу: разорвать
construction-order problem между manager и объектом, которому manager
принадлежит.

## 10. Plugin installation entry point

Host вызывает:

```ts
const dispose = editor.use(plugin);
```

`EditorRuntime.use()` только делегирует:

```ts
use(plugin: RivtoPlugin): () => void {
  return this.plugins.use(plugin);
}
```

Наличие runtime method делает нормальный public flow коротким и оставляет
atomic lifecycle внутри `PluginManager`.

## 11. Что plugin не должен делать

Обычно plugin не должен:

- напрямую импортировать native Yjs;
- мутировать `editor.document` из UI в обход commands;
- вставлять React DOM самостоятельно вне renderer contract;
- оставлять window listeners без cleanup;
- использовать mode как persisted document field;
- считать, что block расположен только на root level;
- выполнять side effect прямо при создании object literal.

Side effects принадлежат `setup`, потому что только тогда manager может связать
их с lifecycle установленного plugin.

