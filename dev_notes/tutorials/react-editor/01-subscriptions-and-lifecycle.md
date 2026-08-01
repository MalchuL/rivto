# Глава 01. Subscriptions, external stores и lifecycle

## 1. Почему недостаточно вызвать `editor.getBlocks()`

Обычное чтение external object не сообщает React, когда нужен rerender:

```ts
const blocks = editor.getBlocks();
```

React повторно выполнит component только после state/props/context update.
Поэтому runtime публикует subscriptions, а binding использует
`useSyncExternalStore`.

## 2. Что делает `useSyncExternalStore`

Упрощённая форма:

```ts
const snapshot = useSyncExternalStore(
  subscribe,
  getSnapshot,
  getServerSnapshot,
);
```

React:

1. получает текущее snapshot value;
2. подписывается на external store;
3. когда listener вызван, снова получает snapshot;
4. если snapshot изменился по `Object.is`, планирует render;
5. корректно координирует это с concurrent rendering.

Это надёжнее самодельной схемы `useEffect + forceUpdate`.

## 3. Общий runtime revision

Binding вызывает:

```ts
useSyncExternalStore(
  (listener) => editor.subscribe(listener),
  () => editor.revision,
  () => 0,
);
```

Возвращаемое value не записано в variable. Это нормально: hook нужен, чтобы
подписать component и вызвать render при изменении number.

`EditorRuntime.changed()`:

```ts
this.currentRevision += 1;
[...this.listeners].forEach((listener) => listener());
```

Revision — monotonic invalidation counter. Сами blocks по-прежнему читаются из
DocumentModel.

Почему listener array копируется через `[...listeners]`: callback может
unsubscribe себя или добавить новый listener во время уведомления. Snapshot
делает текущий проход стабильным.

## 4. Отдельная подписка mode

```ts
const mode = useSyncExternalStore(
  (listener) => editor.mode.subscribe(listener),
  () => editor.mode.get(),
  () => "block",
);
```

ModeManager сам уведомляет только при реальном переходе:

```ts
if (mode === this.value) return;
```

Хотя runtime также вызывает `changed()` на mode update, explicit store даёт
binding точное typed snapshot активного mode.

## 5. Selection snapshot как JSON string

SelectionManager возвращает detached copy. Новый object при каждом `get()` был
бы нестабильным snapshot для `useSyncExternalStore`: React мог бы считать store
изменившимся при каждом чтении.

Binding использует:

```ts
() => JSON.stringify(editor.selection.get())
```

String сравнивается по value и меняется только при изменении serializable
selection. Значение используется как dependency layout effect.

Это практическая небольшая модель; selection shapes состоят только из строк,
чисел и arrays.

## 6. Optional slash plugin store

Slash feature может быть не установлена:

```ts
const slashPlugin = getSlashMenuPlugin(editor);
```

Hook всё равно вызывается безусловно, что требуется Rules of Hooks:

```ts
useSyncExternalStore(
  (listener) => slashPlugin?.subscribe(listener) ?? (() => undefined),
  () => slashPlugin?.getState() ?? null,
  () => null,
);
```

Если plugin отсутствует, subscribe возвращает no-op disposer, snapshot равен
`null`.

Нельзя помещать сам hook внутрь `if (slashPlugin)`: порядок hooks изменился бы
между renders.

## 7. Effect для browser `selectionchange`

Browser selection — внешний DOM store, у которого нет React prop. Binding
добавляет document listener в `useEffect`:

```ts
document.addEventListener("selectionchange", synchronizeSelection);
return () => document.removeEventListener(...);
```

Handler переводит native selection в portable value и выполняет
`selection.set` command.

Почему обычный effect: listener не должен существовать во время render; он
подключается после commit и удаляется cleanup.

## 8. Layout effect для восстановления DOM selection

После React commit DOM уже обновлён, но до browser paint нужно восстановить
caret/highlight. Поэтому используется `useLayoutEffect`, а не `useEffect`:

```text
React commit DOM
  → useLayoutEffect восстанавливает selection
  → browser paint
```

С обычным effect пользователь мог бы заметить один кадр с исчезнувшим или
неправильным курсором.

## 9. Ownership runtime в host application

Demo создаёт instance один раз через lazy `useState`:

```ts
const [instance] = useState(() => {
  const doc = new YjsDoc(...);
  const editor = createRivtoEditor({ document: doc, plugins });
  return { doc, editor };
});
```

Lazy initializer не выполняется на каждом обычном render. Если создавать
runtime прямо в function body, каждый render получил бы новый document,
plugins и subscriptions.

Плохо:

```tsx
function App() {
  const editor = createRivtoEditor();
  return <RivtoEditor editor={editor} ... />;
}
```

## 10. Cleanup ownership

Demo освобождает:

```ts
useEffect(() => () => {
  instance.editor.destroy();
  instance.doc.destroy();
}, [instance]);
```

Editor уничтожает собственные managers/subscriptions. Host отдельно уничтожает
CRDT document, которым владеет.

## 11. React Strict Mode trap

В development Strict Mode может выполнить effect lifecycle как:

```text
mount → effect → cleanup → effect again
```

Если один и тот же runtime создан вне replayed effect, первый cleanup может
terminally destroy его, а второй mount продолжит показывать уже разрушенный
object. Definitions и subscriptions будут удалены.

Текущий demo не оборачивает `App` в `React.StrictMode`. Это зафиксированное
ограничение текущей ownership API, подробно описанное в
`dev_notes/react-strict-mode-editor-lifecycle.md`.

Не делайте `destroy()` idempotent и затем продолжайте использовать destroyed
runtime как «исправление». Terminal resource после destroy не обязан оживать.
Нужна корректная ownership strategy или recreation.

## 12. Persistence effect

Demo подписывается на runtime revision, затем:

```ts
useEffect(() => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(editor.document.getSnapshot()),
  );
}, [revision]);
```

Persistence читает canonical snapshot после изменения runtime. Она не хранит
React blocks state отдельно.

## 13. Runtime inspector объединяет stores

Demo подписывается к:

- editor runtime;
- commands;
- events.

Snapshot содержит mode, selection kind, last event и last command. Это
diagnostics view; оно не управляет editor behavior.

## 14. Частые subscription bugs

### `getSnapshot` всегда создаёт новый object

React видит бесконечно новое value. Используйте primitive, stable object или
serialized small state.

### Subscribe function забывает disposer

После unmount listener остаётся и вызывает stale component logic.

### Runtime создаётся в каждом render

Subscriptions постоянно переключаются, а document «сбрасывается».

### Effect dependency пропущена

Handler замыкает старый editor instance.

### Ручной force update рядом с одним feature

Это скрывает разрыв общего invalidation path и оставляет другие views stale.
