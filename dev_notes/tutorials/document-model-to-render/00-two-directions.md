# Глава 00. Два направления движения данных

## 1. Главная ошибка при первом чтении

Новичок часто ищет одну функцию вроде:

```ts
document.render()
```

В Rivto такой функции нет. Document model ничего не знает о React, DOM или
CSS. Render ничего не знает о native Yjs structures.

Связь построена несколькими маленькими границами.

## 2. Направление чтения: model → screen

```text
Yjs хранит collaborative structures
  ↓
CRDTDoc даёт adapter-neutral arrays/maps/texts
  ↓
DocumentModelImpl собирает portable Block[]
  ↓
EditorRuntime публикует revision после update
  ↓
React useSyncExternalStore запускает render
  ↓
RivtoEditor вызывает editor.getBlocks()
  ↓
BlockDOMRenderer или EdgelessCanvasRenderer получает blocks
  ↓
BlockView находит BlockDefinition по block.type
  ↓
React создаёт DOM
```

## 3. Направление записи: screen → model

```text
пользователь нажал key/button или сделал drag
  ↓
React event handler извлёк portable данные
  ↓
EventRouter выбрал policy, если это interaction event
  ↓
CommandRegistry выполнил named command
  ↓
EditorRuntime проверил payload
  ↓
DocumentModelImpl изменил CRDT structures в transaction
  ↓
CRDT update снова запустил направление чтения
```

Обе стрелки образуют круг, но ответственность не смешивается.

## 4. Почему слои нельзя склеить

### Если DocumentModel импортирует React

Тогда:

- model нельзя использовать в Node tests без React;
- другой renderer adapter становится сложным;
- storage начинает знать product presentation;
- CRDT updates трудно тестировать отдельно от DOM.

### Если renderer импортирует native Yjs

Тогда:

- UI зависит от конкретного adapter;
- validation и commands легко обходятся;
- portable snapshots перестают быть единой границей;
- смена CRDT implementation потребует переписать components.

### Если React хранит собственный authoritative blocks state

Тогда появляются два источника истины:

```text
React useState blocks
CRDT document blocks
```

Remote update меняет только CRDT, local UI меняет только React, а затем нужно
решать, кто победил. Rivto избегает этой проблемы: collaborative source of
truth только один — `DocumentModelImpl` поверх CRDT.

## 5. Что значит «portable value»

Portable value состоит из обычных JavaScript data:

- string;
- number;
- boolean;
- plain object;
- array;
- `null` или отсутствующее optional field.

`Block` не содержит:

- `Y.Map`;
- `Y.Text`;
- DOM node;
- React element;
- callback subscription.

Поэтому block можно:

- передать renderer как prop;
- клонировать;
- сериализовать в snapshot;
- проверить в unit test;
- передать другому framework adapter.

## 6. Что значит detached

Detached object не является живым proxy CRDT storage.

```ts
const block = editor.getBlocks()[0];
block.content = "Changed locally";
```

Такое присваивание меняет только обычный object в памяти текущего caller. Оно
не меняет shared document и не отправляется collaborator.

Правильный путь:

```ts
editor.commands.execute("text.set", {
  id: block.id,
  text: "Changed collaboratively",
});
```

Detached read model делает направление данных явным: чтение через values,
запись через commands.

## 7. Роль каждого слоя одной фразой

### CRDT adapter

Хранит и объединяет concurrent operations.

### DocumentModelImpl

Даёт editor-domain операции и portable document values, скрывая native CRDT.

### EditorRuntime

Координирует commands, selection, mode, plugins, history и invalidation.

### React binding

Подписывает React на runtime и переводит browser interactions в portable API.

### Renderer

Превращает current portable values и registries в DOM presentation.

## 8. Persisted state и presentation state

DocumentModel содержит то, что должно пережить reload и синхронизироваться:

- blocks;
- content;
- props;
- layout;
- children order;
- links;
- collaborative plugin data.

Runtime/React содержат local presentation и interaction state:

- selection;
- mode;
- zoom;
- открытый slash query;
- pointer gesture;
- DOM focus.

Например, canvas coordinates находятся в model, потому что collaborators
должны видеть положение block. Zoom находится в React, потому что два
пользователя могут смотреть тот же canvas с разным масштабом.

## 9. Почему mode не меняет document

Block mode и edgeless mode читают одни blocks:

```ts
const blocks = editor.getBlocks();
```

Mode меняет выбор renderer strategy, но не создаёт вторую модель.

```text
тот же paragraph Block
  ├── block mode: элемент document flow
  └── edgeless mode: absolute-positioned card
```

Переключение mode — смена взгляда на данные, а не migration данных.

## 10. Почему renderer получает весь runtime

Одних blocks недостаточно. Renderer также должен:

- выполнить command;
- спросить block definition;
- прочитать mode;
- показать UI contributions;
- dispatch interaction event;
- прочитать selection.

Поэтому `EditorRendererProps` передаёт `editor` и detached `blocks`.

Blocks — current data snapshot. Editor — stable behavior boundary.

## 11. Первый mental debugging rule

Любой bug сначала отнесите к направлению.

### Model правильная, screen неправильный

Ищите в read path:

```text
subscription → revision → React render → definition lookup → DOM sync
```

### Screen изменился, model неправильная

Ищите в write path:

```text
DOM event → event routing → command → validation → model transaction
```

Это деление сразу уменьшает область поиска примерно вдвое.
