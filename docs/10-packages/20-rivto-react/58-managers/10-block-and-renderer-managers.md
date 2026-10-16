# Block type, list-property, block-operation, and renderer managers

## `BlockTypeManager`

`reactEditor.blockTypes` соединяет core block definition, React renderer, optional behavior, metadata расширений и slash conversion и separator metadata. Сам block content хранится только в core.

### Properties

Public mutable properties отсутствуют. Manager хранит type registrations и separator types внутри runtime; прямого доступа к collections нет.

### `register(registration)`

- **Аргументы:** `ReactBlockRegistration { definition, render, behavior?, clipboard?, slashCommand?, separatesBlockElements? }`.
- **Возвращает:** idempotent disposer exact registration.
- **Исключения:** duplicate renderer/type/slash ID, invalid definition, destroyed runtime; partial work rollback.

Регистрация владеет полным definition и передаёт его вместе с metadata в существующий core registry без копирования или объединения полей. Уже зарегистрированный native type считается конфликтом, включая definition, установленный отдельно в core или другим React runtime. Disposer удаляет определение вместе с presentation.

### Read and cleanup methods

- `getDefinition(type)?.metadata` предоставляет полную metadata регистрации: `"drag.page"` для геометрии и `"block.handle"` для hover. Metadata не включает расширение. Она хранится в точном переданном definition без отдельного merge, списка вкладов или общего учёта владельцев. Cleanup/rollback освобождает зарегистрированное определение и все установленные части presentation. Core API не меняется.
- `subscribe(listener)` уведомляет о создании и удалении полных определений, включая metadata. Прямая мутация metadata не уведомляет подписчиков. Подписки автоматически снимаются после teardown регистраций при уничтожении React runtime; ручной disposer идемпотентен.
- `separatesBlockElements(type)` возвращает `boolean`.
- `getDefaultBlockElementSeparatorType()` возвращает первый separator type или `undefined`.
- `delete(type)` удаляет complete React-owned definition/renderer/behavior/metadata/slash registration.

### Modes

Один registration действует в обеих surfaces: `BlockTree` выбирает тот же renderer. `separatesBlockElements` влияет только на разбиение root flow в edgeless; page hierarchy не меняется.

## `blockListProps` lifecycle adapter

`reactEditor.blockListProps` делегирует core `BlockListPropsManager`; React владеет только cleanup registrations extension lifecycle.

### `register(registration)`

- **Аргументы:** `{ id: string; defaults?: BlockListProps; validate?(candidate): boolean }`.
- **Возвращает:** disposer.
- **Исключения:** empty/duplicate ID или destroyed runtime.

Defaults объединяются shallowly в registration order. Ошибка validator считается rejection, а не передаётся наружу.

### Read methods

- `has(id)` принимает ID, возвращает `boolean`, не throws.
- `validate(candidate)` принимает complete record, возвращает `false` при portability/validator error.
- `prepare(candidate)` возвращает copied list-property record с defaults и validation.

## `blockBehaviors` — цепочка поведения

`register(behavior, priority = 0)` добавляет поведение, которое самостоятельно определяет применимость через обязательный `isAvailable(context)`. Больший приоритет выполняется первым; при равенстве сохраняется порядок регистрации. Тип блока больше не является ключом регистрации. Disposer снимает только свою регистрацию и автоматически принадлежит extension lifecycle; типовых `get/has/delete` и специального `fallback` нет.

Контекст применимости общий для всех методов: `BlockBehaviorAvailabilityContext { editor, block }`. Он содержит runtime и текущие detached-данные одного блока без рекурсивных детей. Union, `kind`, имя операции и параметры перемещения отсутствуют; выбранный метод сам определяет операцию и проверяет специфичные для него условия. При перемещении registry проверяет источники и принимающий блок через тот же `isAvailable`, а каждую подходящую регистрацию вызывает один раз, даже если совпали несколько источников и parent. Только метод `canMove` получает `BlockMoveContext { sources, destination, editor, parent }`. Для root insertion принимающего блока нет, применимость проверяется по источникам, а метод получает `parent: null`. Foreign source передаётся напрямую, без поиска его ID в документе назначения. Предикат синхронный, не изменяет документ и вычисляется заново; доступность по native type не кэшируется.

- `dispatch(action, context, ...args)` вызывает применимые методы до `handled` или `rejected`; `unhandled` и отсутствующий метод продолжают цепочку. Унаследованные методы вызываются обычным образом, без распознавания fallback.
- `resolveAll(context)` возвращает применимые экземпляры в порядке приоритета для указанного блока и runtime.
- `onSplit(context, target)` определяет свойства продолжения и выполняет Enter через общий алгоритм разделения. Первое применимое поведение с `handled` или `rejected` останавливает цепочку; свойства нескольких поведений не объединяются. При отсутствии специализированного обработчика `DefaultBlockBehavior` использует defaults writing factory.
- `childrenVisible(block)` возвращает `false`, если хотя бы одно применимое поведение скрывает детей.
- `canMove({ sources, destination })` проверяет семантическое перемещение независимо от keyboard или drag. Parent читается один раз; пустые sources, отсутствующий parent и beforeId не из его списка отклоняются. Любой применимый hook с `false` запрещает перемещение независимо от приоритета. Root insertion передаёт `parent: null`; ограничения источников продолжают действовать. Foreign sources проверяются по переданным снимкам, без поиска их ID в документе назначения. Проверка не изменяет документ и не заменяет core hierarchy validation.
- Drag feedback и commit, keyboard move и Tab/Shift+Tab используют `canMove`. Outdent до первой мутации проверяет и подъём roots, и перенос последующих siblings внутрь последнего поднятого блока. Геометрия (`dropAxis`, `dropPlacement.allowChildPlacement`, `acceptsDropContainer`, `fixed`) хранится в `definition.metadata[PAGE_DRAG_METADATA_KEY]` и читается расширением через `getDefinition(type)?.metadata`. Hover handle определяется независимо через `metadata[BLOCK_HANDLE_METADATA_KEY].showOnContainerHover`; размеры зон остаются глобальными параметрами dragging.

List extension регистрирует `CheckboxBlockBehavior`, `NumberedListBlockBehavior` и обычный `ListBlockBehavior`. Checkbox наследует свой маркер, numbered-варианты продолжаются через `numbered_list`; оба снимают пустой маркер перед следующим Enter. Все три поведения задают `listProps` нового блока непосредственно в `onSplit` и вызывают общий алгоритм, сохраняющий outdent, размещение детей, диапазон edgeless-карточки и каретку. Обычный list сохраняет default split-свойства и восстановление отсутствующего маркера пустого корневого writing-блока. Collapse extension регистрирует `CollapseBlockBehavior` для видимости детей. `blockListProps` сохраняет только defaults и validation.

Native поведения имеют приоритет `0`, list/collapse — `-100`, а `DefaultBlockBehavior` — обычная регистрация с `-1000`, доступная для любой операции. Приоритеты не зарезервированы и могут быть переопределены другими регистрациями. Контейнеры больше не наследуют generic outline действия; они реализуют только свои методы и `isAvailable` по native type. Транзакции по-прежнему принадлежат вызывающему keyboard handler. При структурном удалении каждое применимое поведение вызывается один раз для всей выборки, без повторного чтения полного снимка для уже обработанных экземпляров.

## `BlockManager` operations

`reactEditor.blocks` — тот же core block manager. React не создаёт дополнительную forwarding facade; validation и mutations остаются в core.

`prepareInput(input)` делегирует recursive preparation core `BlockManager`.

`destination` задаёт реального parentId (null для document roots) и optional beforeId.
ReactPanelApi принимает `{ root: true }` для своих корней либо локальный parentId и ограничивает операции поддеревом.

### Mutation methods

- `insertBlock(input, destination?)` → complete persisted block; throws для invalid list props/core insertion.
- `importForest(blocks, destination?, onError?)` accepts explicit `EditorBlock | EditorBlockInput` roots and returns `{ roots, idMap }`.
- `updateBlock(id, patch)` → complete persisted block; throws для missing/invalid operation.
- `updateBlocks(updates)` → complete persisted blocks in input order; strict atomic core batch, throws если любая entry invalid.
- `deleteListProps(id, keys)` → change `boolean`; throws для missing/invalid operation.
- `deleteListPropsBatch(updates)` → `void`; strict atomic core batch.

## `RendererManager`

`reactEditor.renderers` — lower-level lookup, когда definition установлен отдельно или persisted unknown type нужно отобразить без регистрации model rule.

### Properties

- readonly `revision: number`: registry snapshot token.
- configured fallback хранится privately и возвращается `get()` для unknown type.

### Methods

- `register(type, renderer)` принимает non-empty type/component, возвращает disposer, throws для duplicate/empty type/destroyed runtime.
- `delete(type)` возвращает `boolean`.
- `get(type)` возвращает exact renderer, fallback или `undefined`.
- `has(type)` возвращает наличие exact renderer, не учитывая fallback.
- `subscribe(listener)` возвращает unsubscribe; listener errors propagate.

Renderer manager предоставляет один registry-revision stream. Несколько distinct listeners могут быть активны одновременно; новая подписка не заменяет старую. Internal `RevisionStore` использует `Set`, поэтому одна и та же function reference регистрируется эффективно один раз. Unsubscribe idempotent, initial callback отсутствует, а listener после notification читает `revision` и `get()`/`has()`.

Renderer registry mode-independent. Page и edgeless rerenderятся по одной revision и получают одинаковый content component.

Родительские `onChildIndent(context, ids)` и `onChildOutdent(context, ids)` вызываются
перед цепочкой ведущего дочернего блока. Контекст `BlockOutlineContext` содержит
shallow block, reactPanel, parentId и selection без DOM-root. Родитель получает
полную группу ID; `unhandled` продолжает цепочку, `handled`/`rejected` останавливают
операцию. Конкретные контейнеры задают прежние ограничения здесь, без containment
metadata. Enter, Backspace и повторный подъём используют ту же диспетчеризацию.
