# Аудит рефакторинга 19.09 — пересечения и итоговый порядок

`reafactoring_1909_1.md` зафиксирован после финального dump и далее не изменяется. Этот файл сводит пересекающиеся находки в один непротиворечивый план. Номера ниже ссылаются на заголовки/темы первого отчёта, а не предлагают дополнительные независимые abstractions.

## 1. Исправление block props — одна правка, а не две

Status: solved

Находки про `patchProps(id, type, props, patch)` и про `simulatedProps` в `updateBlocks` затрагивают один data path.

Итоговое решение:

1. Оставить симуляцию полного состояния только для `listProps`, потому что оно реально валидируется целиком.
2. Удалить `simulatedProps`/`validatedProps`: для обычных `props` portable validation применяется к значениям текущего patch.
3. Сократить `patchProps` до `(props, patch)` и в одном проходе `Object.entries(patch)` валидировать и применять значение; не строить `{ ...props.toObject(), ...patch }`.
4. Одним набором tests проверить одиночный patch, повторяющийся ID в batch, удаление через `undefined` и отсутствие частичной transaction при invalid portable value.

Так исчезает риск сначала переименовать helper, а затем удалить половину его аргументов и временных данных второй правкой.

## 2. Package boundaries, canonical types и exports нужно менять вместе

Status: solved

Scope: P0 items only; lower-priority export narrowing remains outside this change.

Здесь пересекаются: canonical element/snapshot aliases, отказ от wildcard lower-layer exports, сужение public storage utilities, `isPlainRecord`, `VisualFrame`, snapshot version constants и неверный `types` path document-model.

Итоговое решение и порядок:

1. Сначала исправить `document-model/package.json` на `dist/esm/index.d.ts` и добавить package smoke check. Иначе последующие direct imports опираются на сломанный published entry.
2. Явно объявить `@chulane/document-model` dependency в React, потому что `DocumentModel` присутствует в его public declarations.
3. В editor-core заменить повторные element/snapshot interfaces aliases на типы document-model. Удобные имена `EditorElement*` можно оставить, но их единственный shape-owner — document-model.
4. Удалить `export *` lower layers из `@chulane/rivto`. Core entry экспортирует только собственные API и явно выбранные aliases, а не весь CRDT/storage namespace.
5. После этого сузить document-model exports: storage mutation helpers остаются internal. `isPlainRecord` — исключение, если core действительно переиспользует его после удаления локального `isRecord`; его нужно явно экспортировать как portable boundary predicate, а не случайно через wildcard.
6. `VisualFrame` сделать alias уже канонического frame type через объявленную dependency chain; не заводить четвёртый shape.
7. Только после проверки generated declarations перенести `@chulane/crdt-doc` editor-core в devDependencies и удалить peer `yjs`, если production bundle/declarations больше их не требуют.

Конфликт разрешён так: рекомендация сохранить editor aliases не означает сохранять wildcard re-export document-model. Aliases принадлежат core API; исходные lower-layer symbols импортируются из пакета-владельца.

## 3. Удаление встроенных string commands отменяет часть rename-находки

Status: solved

После удаления `block.*`, `element.*`, `selection.*`, `history.*`, `document.*` и `clipboard.*` adapters файл core `managers/utils.ts` с `commandPayload`/`commandString` вероятнее всего станет пустым.

Итоговое решение:

- Не переименовывать его заранее в `command-payload.ts`; удалить helpers и файл вместе со встроенными registrations.
- Сохранить `CommandRegistry` только для реально динамических extension/app commands, в частности `edgeless.*`.
- Перенести processors и return values непосредственно в typed manager methods до удаления handlers. `batchUpdates` переносить для составных операций и для подтверждённых undo tests capture breakpoints; одиночные document-model calls не оборачивать автоматически. Затем удалить command-only tests и обновить docs.
- После миграции повторить поиск `commands.execute("block.|element.|selection.|history.|document.|clipboard.`. Нулевой production result является условием удаления adapters.

Это избегает лишнего rename-коммита файла, который следующая фаза полностью удалит.

## 4. React block/clipboard/selection facades — один breaking API migration

Status: solved

Scope: P0 block-facade migration; clipboard/selection remain P1.

Три hybrid manager находки и coordinator naming должны выполняться одной миграцией, иначе имена будут меняться дважды.

Итоговый контракт:

- `reactEditor.blocks` — focused core `BlockManager` без React forwarding;
- `reactEditor.blocks` — guarded mutations и core block delegation;
- `reactEditor.blockTypes` — atomic definition/renderer/view/slash registration и separator metadata;
- `reactEditor.blockListProps` — listProps registrations/defaults/validation/input preparation;
- `reactEditor.clipboard` — core clipboard manager;
- `reactEditor.clipboardFormats` — React formatter/parser registry;
- `reactEditor.selection` — core selection manager;
- `reactEditor.domSelection` — только `read`/`restore` browser endpoints;
- core `blocksRegistry` одновременно переименовать в `blockRegistry`.

Block mutations используют `blocks`, type registration — `blockTypes`, listProps policy — `blockListProps`; DOM restoration идёт в `domSelection`, portable format composition — в `clipboardFormats`. Пустой `ReactSelectionManager.destroy()` удаляется.

Принятая цена единого `blocks`: facade сохраняет forwarding methods и должен синхронизироваться с core API. `Proxy` и dynamic delegation не используются.

После этой миграции унифицировать coordinator naming/factories: concrete `*Impl` остаются internal, public construction идёт через factories. Делать rename до изменения manager properties означает удвоить массовый callsite churn.

## 5. Clipboard schema меняется один раз

Пересекаются rename `startsWithText`, version constants, общий HTML escape, `structuredClone` и вынос clipboard logic из edgeless controller.

Итоговое решение:

1. Поместить `CLIPBOARD_BUNDLE_VERSION` рядом с `ClipboardBundle` и вывести тип поля через `typeof`.
2. Переименовать persisted `startsWithText` в `fromTextSelection` и один раз повысить clipboard version; migrations по правилам проекта не требуются, но fixtures/producers/validator меняются атомарно.
3. Перенести edgeless bundle remap/text formatting в `visual-clipboard.ts`, использовать общий `escapeHtml` и `structuredClone`, удалить JSON round-trip.
4. Оставить `mergeText` как destination paste option: это не alias нового source field.

Так version bump не повторяется отдельно ради rename и отдельно ради перемещения codec.

## 6. Edgeless controller и lifecycle

Слияние `EdgelessVisualsExtension` с единственным controller пересекается с удалением ручных disposer arrays и добавлением module JSDoc.

Итоговое решение:

1. Сначала вынести pure `visual-codec.ts` и `visual-clipboard.ts`, оставив behavior покрытым текущими tests.
2. Затем слить extension/controller в один state owner и удалить 17 forwarding methods.
3. React manager registrations не хранить повторно: ими владеет `ExtensionManager`.
4. Динамические core command registrations `edgeless.*` всё ещё требуют явного cleanup, потому что CommandRegistry сохраняется и не является React manager ownership автоматически.
5. Только после финальной раскладки написать module-level JSDoc новым владельцам; не документировать 908-строчную промежуточную структуру, которая будет удалена.

Это разрешает потенциальный конфликт между «удалить массив registrations» и необходимостью освободить динамические commands: удаляются только повторно owned React registrations, не все cleanup без разбора.

## 7. Geometry consolidation без потери coordinate semantics

После canonical element frame migration:

- `VisualFrame` становится alias канонического frame;
- один geometry module владеет `Point`;
- одна tuple `RESIZE_CORNERS` выводит `ResizeCorner` и используется renderers/transform;
- `CanvasPoint` остаётся отдельным типом, потому что означает координату после client→canvas conversion.

Не следует объединять `CanvasPoint` с обычным `Point` только из-за одинаковой структуры `{x, y}`: это удалит полезную семантику и повысит риск перепутать coordinate spaces.

## 8. Dead-code cleanup выполняется до документации и rename

В один безопасный deletion batch входят `RestrictedMap/RestrictedArray`, `NumberControl`, `SelectionBlock`, `viewOf`, `sliceBlockRange`, `assignArray`, четыре unreachable barrels, лишние internal exports, `isReactEditor`, `flattenBlocks`, `cloneBlock` и ручной `RIVTO_VERSION`/demo badge.

После удаления:

- повторно построить import graph;
- проверить package entries и generated declarations;
- только затем переименовывать оставшиеся generic files (`block-validation.ts`, `element-validation.ts`, узкий файл для `isRivtoEditor`);
- пересчитать список файлов без module JSDoc, чтобы не документировать удаляемые modules/barrels.

React `utils.ts` после удаления `isReactEditor` лучше назвать по единственному оставшемуся guard (`is-rivto-editor.ts`), а не прежним более широким `editor-type-guards.ts`.

## 9. Baseline tests исправляются до архитектурных изменений

Status: solved

Первый обязательный этап:

1. Удалить stale test/import `hasCrossedBlock` либо извлечь и реально использовать актуальный pointer-selection helper.
2. Переписать nesting assertion через React outline/drop operation; прямой core move не должен интерпретировать React containment metadata.
3. Добиться зелёных `check-types` и Jest всех трёх пакетов.

Только после этого начинать API deletions. Иначе новые failures нельзя будет отличить от двух уже существующих baseline failures.

## Итоговая последовательность работ

1. **Baseline:** два stale React tests; зелёные checks.
2. **Packaging:** document-model `types` path, direct React dependency, package smoke.
3. **Safe deletion:** недостижимые files/symbols/dependencies/version badge.
4. **Canonical model:** document aliases, schema constants, exports/package boundaries, geometry primitives.
5. **Core simplification:** block props path, built-in command adapters, `Listeners`.
6. **React API:** одним breaking change разделить block/clipboard/selection facades и переименовать registry/coordinators.
7. **Clipboard/edgeless:** один schema bump, pure codec/clipboard extraction, merge extension/controller, lifecycle cleanup.
8. **Names/docs:** переименовать только оставшиеся files/symbols, добавить module JSDoc и lint enforcement.
9. **Final verification:** type checks, lint, все Jest suites, builds, package tarball smoke и затронутые E2E clipboard/selection/page/edgeless.

Такой порядок не создаёт временные abstractions, которые следующая фаза удаляет, и сохраняет по одному владельцу для persisted schema, core state, React policy и browser DOM behavior.
