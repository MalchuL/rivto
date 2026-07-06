# Глава 01. От CRDT storage до portable Block

## 1. Внутреннее storage устроено не как готовое дерево

`DocumentModelImpl` хранит четыре top-level CRDT containers:

```text
roots       ordered array root block IDs
blocks      map block ID → block CRDT map
links       map link ID → link CRDT map
pluginData  map plugin namespace → collaborative value
```

Дерево документа собирается из references:

```text
roots: ["A", "C"]

blocks:
  A.children: ["B"]
  B.children: []
  C.children: []
```

Portable result:

```text
A
└── B
C
```

## 2. Почему storage разделено

CRDT containers имеют стабильную identity. Отдельные maps/arrays/texts
позволяют изменять маленькую часть документа без замены всего объекта.

Например:

- typing меняет CRDTText content;
- move меняет ordered ID array;
- layout patch меняет несколько keys layout map;
- prop patch не перестраивает content и children.

Concurrent изменения разных частей легче merge.

## 3. Публичный getter `document`

```ts
get document(): Block[] {
  return strings(this.storage.roots).flatMap((id) => {
    const block = this.readBlock(id, new Set());
    return block ? [block] : [];
  });
}
```

Пошагово:

1. CRDT array roots превращается в обычный string array;
2. каждый root ID передаётся `readBlock`;
3. missing/malformed result пропускается;
4. итог — новый обычный `Block[]`.

Getter не возвращает ссылку на внутренний array storage.

## 4. `readBlock()` материализует один subtree

Функция:

1. проверяет cycle guard;
2. получает block map по ID;
3. читает props map в plain object;
4. читает pluginData map в plain object;
5. превращает CRDTText в string;
6. recursively materializes children;
7. читает layout map;
8. возвращает `Block`.

```ts
return {
  id,
  type,
  props,
  pluginData,
  content,
  children,
  layout,
};
```

## 5. Зачем `visited`

Корректное tree не должно иметь cycle:

```text
A children → B
B children → A
```

Но collaborative или повреждённые данные нельзя считать идеально корректными.
Без `visited` recursion зациклится и упадёт с stack overflow.

```ts
if (visited.has(id)) return undefined;
visited.add(id);
```

Защита делает read path конечным даже при malformed references.

## 6. Почему `visited` общий для всего root traversal

Для каждого root getter создаёт новый `Set`, а внутри его subtree set общий.
Это предотвращает повторный block в одной ветке/subtree.

Отдельный `normalize()` чинит duplicate, missing и orphan references в storage.
Read path всё равно защищается, потому что внешние updates могут временно или
ошибочно принести некорректную структуру.

## 7. Default layout при чтении

Stored layout может быть partial или происходить из старых данных. Getter
возвращает:

```ts
layout: { ...DEFAULT_LAYOUT, ...layout }
```

Renderer получает полную geometry и не обязан повсюду повторять defaults.

При insert defaults также записываются с calculated x/y, но read fallback
остаётся защитой compatibility.

## 8. `Block` — view-friendly contract

```ts
interface Block {
  id: string;
  type: string;
  props: Record<string, unknown>;
  pluginData: Record<string, unknown>;
  content: string;
  children: Block[];
  layout?: BlockLayout;
}
```

Rendererу не нужно знать:

- в каком top-level map лежит block;
- как unwrap CRDTText;
- где children IDs;
- как работает Yjs transaction;
- как клонировать plugin data.

## 9. Type не является React component

Persisted field:

```ts
block.type === "callout"
```

Это стабильная строка document schema. Сам `Block` не содержит renderer
function, потому что functions нельзя сериализовать и синхронизировать как
document data.

Связь `type → renderer` появляется позже через local `BlockRegistry`.

Поэтому один client может иметь plugin renderer, а другой без plugin всё равно
сохраняет unknown block data.

## 10. `links` материализуются отдельно

`document` getter возвращает block tree, а `links` getter возвращает first-class
connections. Edgeless renderer читает оба:

```ts
blocks
editor.document.links
```

Link не становится child block, потому что это другая domain relationship.

## 11. Snapshot не равен render snapshot

`getSnapshot()` возвращает versioned persistence value:

```ts
{
  version: 3,
  blocks: clone(this.document),
  links: clone(this.links),
  pluginData: ...,
}
```

React обычно не вызывает `getSnapshot()` для каждого render. Он читает
`document` и `links`. Persistence snapshot нужен для сохранения/загрузки и
имеет schema version.

Не путайте два значения слова snapshot:

```text
useSyncExternalStore snapshot  маленькое сравнимое значение revision
document persistence Snapshot  полные serializable данные schema v3
```

## 12. Почему getter создаёт новые objects

Плюсы:

- renderer не может случайно мутировать live CRDT;
- boundary остаётся adapter-neutral;
- tests сравнивают обычные values;
- serialization проста.

Цена: материализация проходит по tree при чтении. Для текущего масштаба это
самая простая корректная модель. Если profiling когда-нибудь покажет проблему,
можно вводить caching/structural sharing на этой границе, не меняя renderer API.

Не добавляйте cache заранее: invalidation сложнее самой текущей materialization.

## 13. Props validation соединяет registry и model без React

Runtime устанавливает validator:

```ts
this.document.setPropsValidator(
  (type, props) => this.blocks.validate(type, props),
);
```

DocumentModel знает, что props надо validate, но не знает plugin definitions.
BlockRegistry знает schemas, но не CRDT storage.

Callback соединяет их через маленький contract без зависимости model → editor.

## 14. Block creation до model

Команда `block.insert` сначала:

1. проверяет type;
2. находит definition;
3. проверяет renderer availability текущего mode;
4. вызывает `blocks.prepare(block)`;
5. merge default props;
6. запускает prop schema;
7. передаёт prepared `BlockInput` в model.

То есть model хранит уже подготовленные portable data, но остаётся независимой
от React component, который потом их покажет.

## 15. Unknown stored type и lossless read

Document может содержать type, definition которого сейчас не установлена.
Model всё равно возвращает block. `BlockContent` показывает placeholder
`Unknown block type`, но data не выбрасывается.

Это важно для plugin lifecycle:

```text
plugin отключён
  ≠ user data удалены
```

После повторной установки definition тот же persisted type снова resolve в
renderer.

