# Глава 02. От model update до React render

## 1. Getter сам никого не уведомляет

`editor.getBlocks()` только читает current storage. Он не push stream и
не React state.

Нужен отдельный сигнал:

```text
"данные могли измениться — перечитай getter"
```

Этим сигналом служит цепочка subscription и runtime `revision`.

## 2. DocumentModel subscription

```ts
subscribe(listener: () => void): Unsubscribe {
  return this.crdt.on("update", listener);
}
```

Model делегирует adapter-neutral CRDT update event.

Listener вызывается для:

- local command transaction;
- undo/redo;
- loaded snapshot;
- remote provider update;
- допустимого direct DocumentModel change.

React не нужно знать источник изменения.

## 3. Runtime подключает subscription

В конце constructor:

```ts
this.cleanup.push(
  this.document.subscribe(() => {
    this.reconcileSelection();
    this.changed();
  }),
  this.selection.subscribe(() => this.changed()),
  this.mode.subscribe(() => {
    this.reconcileSelection();
    this.changed();
  }),
);
```

Document update делает две вещи.

### Reconcile selection

Удалённый или локальный update мог удалить block, на который ссылается local
selection. Runtime очищает dangling selection.

### Changed

Все renderer subscribers получают invalidation signal.

## 4. Почему subscription ставится после initialization

До этого runtime:

- регистрирует commands;
- регистрирует fallback events;
- устанавливает validator;
- добавляет default block definitions;
- устанавливает plugins;
- вставляет initial content;
- очищает initial history.

Если renderer мог подписаться посередине constructor, он увидел бы half-built
runtime: content без definitions или часть plugins.

После factory return object уже готов. Первый React render напрямую читает
current state; отдельное notification о constructor initialization ему не
нужно.

## 5. Что делает `changed()`

```ts
private changed(): void {
  this.currentRevision += 1;
  [...this.listeners].forEach((listener) => listener());
}
```

Revision всегда растёт. Он не кодирует, что именно изменилось.

```text
revision 12 → revision 13
```

означает только:

> Как минимум одна часть runtime, влияющая на view, могла измениться.

## 6. Почему revision — number, а не весь Block[]

`useSyncExternalStore` должен быстро сравнить snapshots. Если runtime каждый
раз возвращал полный freshly materialized `Block[]`, reference всегда была бы
новой даже без реального изменения.

Number:

- дешёвый;
- stable между notifications;
- легко сравнивается `Object.is`;
- не дублирует document data.

После нового number React отдельно читает canonical model.

## 7. Runtime subscribe

```ts
subscribe(listener: () => void): () => void {
  this.listeners.add(listener);
  return () => this.listeners.delete(listener);
}
```

Это framework-neutral observer API. React — только один consumer. Demo
persistence и diagnostics также могут подписываться.

## 8. React hook

В `RivtoEditor`:

```ts
useSyncExternalStore(
  (listener) => editor.subscribe(listener),
  () => editor.revision,
  () => 0,
);
```

Последовательность после update:

1. runtime вызывает hook listener;
2. React вызывает `getSnapshot`;
3. получает новый revision number;
4. планирует render;
5. component function выполняется снова;
6. вызывает `editor.getBlocks()`;
7. получает новый detached tree.

## 9. Почему результат hook можно не присваивать

Component не использует сам number в JSX. Hook нужен ради subscription и
render scheduling.

```ts
useSyncExternalStore(...);
```

не означает, что value потеряно. React внутри hook сравнивает snapshots и
перезапускает component.

## 10. React читает blocks после hook

```ts
const blocks = editor.getBlocks();
```

Каждый render получает coherent current view model. Renderer props дальше
строятся из этого local constant.

```ts
const rendererProps = {
  editor,
  blocks,
  defaultBlockType,
  slash,
  selected,
  setSelected,
  zoom,
};
```

## 11. Mode и selection имеют дополнительные stores

Runtime revision уже invalidates view, но binding также получает typed current
mode через `editor.mode.subscribe()` и stable serialized selection snapshot
через `editor.selection.subscribe()`.

Причины:

- mode непосредственно выбирает renderer;
- selectionRevision является dependency DOM restoration layout effect;
- specialized managers можно использовать независимо.

Document blocks всё равно читаются через общую model.

## 12. Local command update example

```text
onClick Delete
  ↓
commands.execute("block.remove")
  ↓
DocumentModel.removeBlock
  ↓
CRDT transaction emits update
  ↓
runtime document listener
  ↓
revision + 1
  ↓
React rerender
  ↓
new Block[] больше не содержит block
  ↓
React unmount BlockView
```

React code не удаляет component вручную. Исчезновение block из current data
делает JSX tree другим.

## 13. Remote update example

```text
remote collaborator inserts block
  ↓
provider applies Yjs update
  ↓
CRDT "update" event
  ↓
тот же runtime listener
  ↓
тот же revision path
  ↓
React показывает новый block
```

Для renderer local и remote update выглядят одинаково. Это сильное упрощение.

## 14. Plugin definition update без document update

Установка plugin может добавить BlockDefinition или UI contribution, не меняя
CRDT document. `PluginManager` вызывает runtime `onChange()`, а `defineBlock()`
тоже вызывает `changed()`.

Поэтому revision означает invalidation всего runtime view, не только document
content.

Например, persisted unknown block может получить renderer сразу после plugin
installation, хотя его document data не изменились.

## 15. Command diagnostics не являются document render signal сами по себе

`CommandRegistry` имеет собственную subscription для `lastExecuted`. Demo
inspector подписывается на неё.

Mutation command обычно также вызывает document update, который invalidates
editor. Но command без document mutation может обновить только diagnostics или
plugin-local state через другие subscriptions.

Не следует считать command subscription заменой document subscription.

## 16. Destroy разрывает pipeline

Runtime хранит document unsubscribe в `cleanup`. `destroy()` сначала вызывает
все cleanup functions.

После destroy CRDT update больше не должен invalidates этот runtime. React не
должен продолжать render destroyed instance.

## 17. Почему нельзя подписаться прямо в render body

Плохо:

```tsx
editor.subscribe(() => setTick(...));
```

Каждый render добавит новый listener без правильной lifecycle coordination.

`useSyncExternalStore` связывает subscribe/unsubscribe с React commit и
поддерживает concurrent rendering semantics.

## 18. Сводная схема notifications

```text
                         ┌─ selection manager update
CRDT document update ────┼─ mode manager update
plugin/definition update ┘
             ↓
     EditorRuntime.changed()
             ↓
       revision increments
             ↓
  runtime listeners notified
             ↓
 React useSyncExternalStore
             ↓
 component reads current model/registries
```
