# Архитектура React API: согласованный план

Статус: все четыре этапа реализованы; результаты проверки приведены ниже.
Область: `packages/react-rivto-editor`. Demo, E2E и документация меняются только
для адаптации потребителей публичного API. Core, document-model, CRDT и приложения
в `app/` не рефакторятся. Git index не изменяется.

Этот документ — актуальный ориентир для следующих изменений. Предыстория и
предыдущие измерения остаются в `react-architecture-ru.md`.

## Зачем меняем

API отображения повторяет почти весь runtime, хотя одноимённые менеджеры могут
иметь разную область действия. Слово view означает и отображение документа, и
поведение блока. Контроллер, отдельный класс API и scope делят жизненный цикл
одного отображения. Регистрация расширений смешана с выполнением операций.
Контракты собраны в большом capabilities.ts, а менеджеры часто получают весь
runtime ради владения регистрациями.

Цель — по имени, типу и конструктору понимать владельца состояния, доступные
операции и время жизни объекта. Сокращение строк само по себе не является целью.

## Согласованные решения

### 1. Runtime и отображение

Сохранить две сущности. EditorRuntime владеет общими менеджерами документа и
регистрациями расширений. EditorViewApi описывает взаимодействие с одним
отображением: DOM, selection, clipboard и slash execution.

Убрать forwarding getters общих менеджеров из отображения. Явные обращения:
`editorView.runtime.blocks`, `editorView.runtime.history`; локальные операции:
`editorView.selection`, `editorView.clipboard`, `editorView.slashCommands`.
Большинство применений SharedEditorApi после этого заменить runtime либо
конкретным менеджером. Общие алгоритмы не должны выбирать активное отображение
неявно. Runtime и отображение не объединять: один документ отображается несколько раз.

### 2. Контроллер и публичный контракт отображения

Объединить реализацию класса EditorViewApi с EditorViewController. Оставить
интерфейс EditorViewApi; контроллер реализует его и хранится в React-контексте
через этот интерфейс. useEditorView возвращает контракт, не методы lifecycle.

Сохранить StrictMode remount, отмену загрузок и поздних acquisition, уничтожение
отложенной DOM-работы, локальные регистрации и независимое освобождение consumers.
Изменение идентичности при remount проверять явно, не подменять его предположениями.

### 3. Названия

- ViewManager → BlockBehaviorRegistry; runtime.views → runtime.blockBehaviors.
- BlockViewBehavior → BlockBehavior.
- BaseBlockView → DefaultBlockBehavior.
- DocumentViewRegistry → EditorViewRegistry.
- ReactSelectionManager → ViewSelectionManager.
- EditorRuntime, EditorView, EditorViewApi и EditorViewController сохраняют имена.

Не переименовывать React-компонент BlockView только из-за совпадения слова view:
он действительно отображает блок. Пересмотреть связанные названия контекстов,
действий и реализации поведения, чтобы старый смысл не остался в импортируемом API.

### 4. Регистрация и выполнение

Разделить ClipboardFormatRegistry (parsers/formatters) и ViewClipboardManager
(copy/cut/paste). Расположение общих paste strategies определить при переносе,
сохранив существующий pipeline и привязку стратегии к отображению.
SlashCommandRegistry хранит определения, ViewSlashCommandManager проверяет
доступность и выполняет команды для своего отображения.

Runtime регистрирует поведение; обработчики действуют через полученный editorView.
Убрать перенаправление общих регистраций из локальных clipboard/slash API.
Сохранить небольшие event/keyboard adapters там, где они обеспечивают local IDs,
владение и cleanup. Не вводить BaseManager и универсальную фабрику менеджеров.

### 5. События

- EditorViewRegistry: mounted roots, активное отображение, начало pointer-жеста.
- DOMEventListeners: группировка, подключение и отключение нативных listeners.
- EventManager: регистрации, фильтрация, построение события и dispatch.

Доступ к отображениям перенести из events в runtime.editorViews. Различать
getActive и getDefault. При миграции текущего fallback сохранять его явно там,
где он нужен. Сохранить nested view routing, pointer continuation, capture/passive,
selectionchange и защиту от повторной обработки одного native event.

### 6. Storage и ссылки на блоки

EditorStorage оставляет загрузку, кэш, reference counting и уничтожение
runtime/core/model. BlockReferenceResolver получает resolveBlock и наблюдение
за расположением источника для embeddings; использует storage и метаданные приложения.

- getEditor → getRuntime; getEditors → getRuntimes.
- acquireEditor → acquireRuntime; EditorAcquisition.editor → runtime.
- getSingleEditor → openCoreEditor: операция асинхронно открывает документ и
  явно удерживает его. Имя парной операции освобождения уточнить вместе с этим API.

Сохранить дедупликацию параллельной загрузки, retry, cancellation отдельного
потребителя, explicit ownership, fallback resolution и aggregate cleanup errors.

### 7. Типы

Единое правило: Api — публичный контракт, Manager — операции и состояние,
Registry — регистрация и поиск, Controller — координация lifecycle/interaction.
Контракты хранить рядом с реализацией. capabilities.ts можно временно сохранить
как реэкспорт, внутренние импорты перевести к владельцам. Не вводить интерфейс
для каждого приватного класса. Selection в публичном API должен иметь интерфейс,
не конкретный класс с lifecycle-методами.

Pick сохранять для частичных данных и необходимых узких контрактов. Простые
аргументы писать явно, избегать лишних цепочек indexed access. Snapshot загрузки
отображения сделать discriminated union с допустимыми сочетаниями данных.

### 8. Зависимости менеджеров

RendererManager и SurfaceManager получают владельца регистраций вместо всего
runtime, если им нужны только own/assertActive. Не вводить DI-контейнер.
BlockTypeManager сохранить координатором атомарной регистрации definition,
renderer, behavior и slash-команды с rollback.

### 9. Расположение файлов

- editor/: runtime, storage, их контракты.
- editor-view/: компонент, контроллер, контекст, useEditorView, контракты.
- managers/: events, keyboard, selection, clipboard, slash, blocks, surfaces,
  extensions. Keyboard отделён от events; block behavior не называется views.
- extensions/embedding/: разрешение ссылок на блоки.
- blocks/ и surfaces/: компоненты и layout.

React-компоненты и hooks остаются функциями. Stateful interaction и lifecycle
могут быть классами. CSS остаётся рядом с владельцем; динамические координаты
не переносятся в статические стили искусственно. Семантический HTML сохраняется.

## Этапы и критерии завершения

1. [x] Названия и контракты: устранить неоднозначные view-названия, разнести
   capability-типы, отделить block behavior от editor views. Проверить потребителей,
   exports, demo, docs и fixtures. Только этот этап не требует новых browser timings,
   если алгоритмы, lifecycle и runtime shape не меняются кроме согласованных имён.
2. [x] Отображение: объединить реализации, убрать forwarding, сохранить локальные
   менеджеры и независимость repeated/nested views. Проверить StrictMode и cleanup.
3. [x] Менеджеры: разделить регистрацию и выполнение clipboard/slash; выделить
   native listeners, сделать выбор активного/default отображения явным.
4. [x] Storage: выделить resolver, уточнить acquire/release API, сузить зависимости
   менеджеров. Проверить параллельное открытие, cancellation и перенос источника.

После каждого законченного этапа: relevant Jest, React/demo/docs typecheck,
workspace lint, сборка публичных exports. Для изменения поведения — production
Playwright в Chromium и Firefox, focused сценарии page/edgeless, embeddings,
selection, clipboard, keyboard, lifecycle. Полный прогон по указанию пользователя
с workers=12; упавшие повторно с workers=1 с разбором причин.
Для runtime-изменений измерить исходную и новую реализацию на обычном документе и
?repeat=200 без изменения виртуализации: отдельно синхронную команду и восстановление
DOM/selection, медиану и диапазон. Не ослаблять бюджеты и проверки корректности.

## Журнал реализации

- План сохранён до изменения исходников. Исходный git index сохранён для сравнения.


### Этап 1: названия и расположение контрактов

- Переименованы BlockBehaviorRegistry, BlockBehavior, DefaultBlockBehavior,
  ContainerBlockBehavior, их контексты, действия и реализации контейнеров.
  Регистрация типа теперь принимает `behavior`; общий registry — `blockBehaviors`.
- `src/views/` перенесён в `src/block-behaviors/`: это алгоритмы и политики,
  а `blocks/block-view` по-прежнему содержит React-компонент отображения.
  Registry и его контракт принадлежат `managers/blocks/`.
- EditorViewRegistry и ViewSelectionManager получили согласованные имена.
- Контракты из capabilities.ts разделены на 12 файлов рядом с владельцами;
  суффикс Capability заменён на Api. Все существующие описания методов сохранены.
  capabilities.ts остаётся только публичным реэкспортом. Внутренние импорты идут
  напрямую к владельцам типов, включая зависимости самих контрактов.
- Keyboard manager, keymap, shortcut parsing и keyboard event types вынесены
  из events в managers/keyboard. Публичные exports обновлены.
- Обновлены потребители в React-пакете, demo, E2E и документация. Данные документа,
  алгоритмы, подписки и порядок lifecycle не менялись.

Этот этап завершает переименования и перенос типов. Он ещё не объединяет
EditorViewApi с контроллером, не удаляет forwarding и не меняет clipboard/storage
lifecycle. Эти изменения относятся к этапам 2–4. Конкретный класс selection в
EditorViewApi будет скрыт за интерфейсом вместе с переносом lifecycle в этап 2.

Промежуточная проверка обнаружила ошибочное преобразование пяти runtime-imports
в type-only imports при переносе контрактов. Импорты исправлены до финальной
проверки; результаты промежуточного прогона не считаются подтверждением готовности.

Финальная проверка этапа 1:

- 55 Jest suites, 332 теста прошли. Два mock-поля старого registry в pointer
  placement tests также переименованы; проверки ограниченного числа DOM reads
  на 2 и 2000 блоков сохранены и проходят.
- React/demo/docs typecheck, workspace lint, сборки React-пакета и demo прошли.
- Production preview, Chromium + Firefox, workers=12: 64 из 64 сценариев
  container-summaries, nested-containers, columns, kanban, bento, mode,
  block-hooks и review-report прошли. Повтор с workers=1 не понадобился.
- Полный E2E и сравнительные browser timings не запускались: этап изменяет
  имена, exports и расположение кода, а не алгоритмы взаимодействия. Существующие
  детерминированные unit-проверки производительности сохранены.
- Git index не менялся. Preview остановлен. Временные скрипты, исходный снимок
  и логи находятся в `/tmp/rivto-architecture-v2/`.

Следующий этап — объединение реализации EditorViewApi с EditorViewController,
явный доступ к общим менеджерам через runtime и публичный интерфейс selection.
Этапы 2–4 ещё не реализованы; план целиком не считается завершённым.


### Этапы 2–4: реализация

Все оставшиеся этапы реализованы вместе, поскольку удаление forwarding меняет
контракты локальных менеджеров и их потребителей. Предыдущие записи описывают
промежуточное состояние этапа 1, а не текущий API.

#### Отображение и runtime

- Класс-фасад EditorViewApi удалён. EditorViewController реализует интерфейс
  `editor-view/types.ts`, владеет локальными менеджерами, acquisition и cleanup.
  Context содержит интерфейс; отдельно передаваемый конкретный controller из
  контекста убран. Подписка на deactivation доступна через публичный интерфейс.
- Общие поля больше не повторяются на отображении: используются
  `editorView.runtime.blocks`, `.history`, `.surfaces` и остальные менеджеры.
  `editorView.selection`, `.clipboard`, `.slashCommands`, `.events`, `.keyboard`
  сохраняют конкретное отображение при смене фокуса.
- Selection закрыт интерфейсом ViewSelectionApi. Cleanup недоступен через этот
  контракт. Контроллер отменяет DOM-задачи до завершения extension lifecycle.
- При StrictMode remount идентичность контроллера сохраняется; selection adapter
  пересоздаётся, старые DOM-задачи и локальные регистрации отменяются. Snapshot
  загрузки стал discriminated union: loading / available / missing / error.
- Runtime/storage и их контракты перенесены в `src/editor/`; компонент, controller,
  context, useEditorView и контракт отображения — в `src/editor-view/`.
  SharedEditorApi удалён; общий cross-document transfer использует один локальный
  Pick с blocks/history/getDocument, поскольку работает также с core editor.

#### Менеджеры

- ClipboardFormatRegistry хранит formatters/parsers в `runtime.clipboardFormats`.
  Общие стратегии доступны через `runtime.pasteStrategies`.
  ViewClipboardManager предоставляет только copy/copyText/cut/paste.
  Небольшой ClipboardManager сохраняет общую интеграцию с core clipboard и
  транзакционным paste pipeline; он больше не хранит форматтеры или parsers.
  Его paste требует явный editorView, создаёт независимый pipeline для вызова
  и сохраняет destination даже при вложенной вставке. Core coordinator наружу
  для этого не раскрывается, алгоритм core paste не копируется.
- SlashCommandRegistry хранит определения и предоставляет register/delete/get/getAll.
  ViewSlashCommandManager проверяет доступность и выполняет команду с собственным
  editorView. У локального API нет register/delete; у registry нет execute.
- DOMEventListeners отвечает за группировку и подключение native listeners.
  EventManager оставляет registration, filtering, event construction и dispatch.
  EditorViewRegistry отдельно хранит roots, active occurrence и начало pointer-жеста.
  Доступ идёт через `runtime.editorViews`; getActive и getDefault не смешаны.
  Там, где нужен прежний fallback, он указан явно через `getActive() ?? getDefault()`.
- RendererManager, SurfaceManager, SlashCommandRegistry и ClipboardFormatRegistry
  получают узкий RegistrationOwner с own/assertActive вместо полного runtime.
  Новый DI-контейнер или общий базовый manager не вводился.
- Прямые импорты DOM helpers устранили цикл через общий managers barrel,
  проявившийся при загрузке DefaultBlockBehavior в тесте todo storage.

#### Storage и embedding

- EditorStorage сохраняет загрузку, кеш, ownership и уничтожение runtime/core/model.
  BlockReferenceResolver в `extensions/embedding/` содержит resolveBlock,
  subscribeBlockLocation и поиск блока среди открытых документов.
- Новый API: getRuntime/getRuntimes, acquireRuntime → `{ runtime, document, release }`,
  openCoreEditor/releaseCoreEditor. Resolver доступен как `storage.blockReferences`.
  Фабрика createEditor в options по-прежнему получает storage-owned core и
  возвращает runtime над ним; core не заменяется и не передаёт владение фабрике.
- Отмена отдельного ожидания вынесена в общий внутренний waitFor. Сохранены
  дедупликация загрузки, retry, независимые consumers, late acquisition cleanup,
  preferred-document-first resolution и освобождение всех ресурсов при ошибках.
- Обновлены demo, E2E instrumentation, fixtures, exports и документация.
  Core, document-model, CRDT и приложения в app не изменялись.

#### Как использовать API теперь

```ts
// Extension setup receives the document runtime.
runtime.clipboardFormats.registerFormatter(formatter);
runtime.slashCommands.register(command);
runtime.events.register(definition, (event) => {
  const editorView = event.editorView;
  editorView.runtime.blocks.updateBlock(blockId, patch);
  editorView.selection.restoreDOM();
});

// Components receive the nearest rendered occurrence.
const editorView = useEditorView();
editorView.clipboard.paste(input);
editorView.slashCommands.execute(commandId, { blockId });

// A toolbar outside a view explicitly chooses its destination.
const destination = runtime.editorViews.getActive() ?? runtime.editorViews.getDefault();
destination?.selection.restoreDOM();
```

#### Проверки этапов 2–4

- React Jest: 55 suites, 334 теста прошли. Добавлены проверки разделения
  active/default, отсутствия forwarding/registration у локальных API и запрета
  clipboard registration после runtime cleanup. Существующие проверки repeated
  views, StrictMode, отмены DOM-задач, source relocation и storage concurrency проходят.
- React/demo/docs typecheck, workspace lint, сборки React package и demo прошли.
- Полный production Playwright, Chromium + Firefox, workers=12:
  662 прошли, 11 упали, 49 пропущены самим набором тестов.
  Четыре падения вызвал устаревший вызов resolver в E2E instrumentation;
  обращение исправлено на `storage.blockReferences.resolveBlock`.
  Остальные семь — budgets/timeout большого документа при параллельной нагрузке.
  Все 11 прошли с workers=1; пороги времени и DOM reads не изменялись.
- Заключительный последовательный production-прогон block-number-performance и
  embeddings в обоих браузерах: 96 прошли, 4 пропущены, падений нет. Проверены
  обычный документ и repeat=200, page/edgeless, source clipboard/slash, nested
  selection, drag, undo, relocation и независимый cleanup.
- Дополнительный экспериментальный typecheck всех E2E-файлов имеет 34 ошибки.
  Тот же набор сообщений воспроизведён на сохранённом исходном состоянии:
  это не штатный script репозитория, и данный рефакторинг их не исправляет.
  Штатные React/demo/docs typecheck проходят.

#### Производительность до/после

Две production-сборки, Chromium, одинаковый viewport 1440×1000, стандартный demo
без изменения настроек виртуализации. Реальные Tab/Shift+Tab на втором корневом
блоке; 2 прогревочных и 7 измеряемых пар. Проверяется изменение parent, model
selection и DOM caret. В обычном документе смонтировано 62 block shells,
при repeat=200 — 3062, включая повторные отображения.

Синхронная обработка измеряется от window capture до window bubble для keydown,
включая обработчики и синхронных подписчиков. DOM — до двух animation frames,
после чего отдельно проверяются выделение и иерархия. Это proxy завершения
отрисовки, а не обещание окончания любой асинхронной layout-работы.

| Документ / клавиша | Обработка до → после, мс (медиана; min–max) | DOM до → после, мс (медиана; min–max) |
| --- | --- | --- |
| Обычный / Tab | 4.5 (3.9–6.3) → 4.7 (4.4–5.5) | 31.8 (31.0–32.4) → 31.9 (31.4–32.0) |
| Обычный / Shift+Tab | 5.0 (4.3–5.7) → 4.9 (4.8–5.2) | 31.6 (30.9–31.8) → 31.4 (31.1–31.8) |
| repeat=200 / Tab | 56.5 (56.1–60.9) → 59.3 (56.6–97.5) | 167.8 (165.9–175.3) → 169.3 (166.3–217.9) |
| repeat=200 / Shift+Tab | 72.6 (69.0–78.7) → 75.9 (71.9–80.9) | 182.0 (170.7–207.0) → 187.6 (179.0–211.4) |

Рефакторинг не дал ускорения. В этом замере медиана обработки большого документа
выросла примерно на 5%, диапазоны перекрываются; единичный Tab имел заметный выброс.
Большой документ без виртуализации по-прежнему требует около 170–190 мс до DOM
после структурного изменения. Это ограничение сохранено явно, а не скрыто сменой
настроек demo или ослаблением budgets.

Исходный снимок, production baseline, benchmark и логи находятся в
`/tmp/rivto-architecture-rest/`. Временные утилиты не добавлены в репозиторий.

Git index сравнен с исходным `git ls-files --stage`: изменений нет. Все изменения
рефакторинга оставлены в рабочем дереве, включая новые и перенесённые файлы.
Старый публичный API несовместим с новым: внешние consumers должны перейти на
runtime/view и новые storage/registry методы по примерам выше. Приложения в app
и их отдельные сборки не проверялись в рамках React-пакета.

Временные baseline/preview серверы на портах 5188/5189 остановлены после проверок.

### Уточнение документации и имён после рефакторинга

Документация основных классов и публичных контрактов React уточнена по реализации:
`EditorRuntime`, `EditorStorage`, `EditorViewController`, `useEditorView`, поведение
блоков и менеджеры событий, выделения, clipboard и slash-команд. В описаниях
разделены общие данные документа и операции конкретного отображения, объяснены
владение ресурсами, освобождение подписок, отмена загрузки, значения по умолчанию
и случаи отсутствия результата. Пояснения о транзакциях, StrictMode, вложенных
редакторах и отложенном восстановлении выделения сохранены.

Исправлены неточные контракты: `selection.clear()` очищает общее выделение;
`selection.snapshot()` возвращает неизменяемый снимок со стабильной ссылкой;
отмена сигнала после завершения `acquireRuntime()` не заменяет `release()`.
`BlockBehavior` описан как один зарегистрированный экземпляр на тип блока,
который получает состояние конкретного блока через аргументы методов.

Переименования следуют выполняемой операции:

- `bind` → `updateSnapshot`, `publish` → `publishSnapshot` в контроллере;
- `activeView` → `activeRoot`, `pointerView` → `pointerRoot` для DOM-элементов;
- `sourceView` → `sourceBehavior` при проверке поведения переносимого блока;
- `insertFirstChild` → `appendWritingBlock`: операция добавляет блок в конец
  контейнера, а не обязательно на первую позицию. Обновлены экспорт и вызовы
  в columns, table и todo. Внешним пользователям этого метода нужен новый идентификатор.

Проверки: React Jest — 55 наборов / 334 теста; typecheck React, demo и docs;
workspace lint; сборка React с декларациями типов — успешно. Дополнительная
проверка через TypeScript AST сопоставила все 30 изменённых TS/TSX-файлов с
состоянием в stage: кроме комментариев и перечисленных переименований,
исполняемая структура кода не менялась. Утилита и логи находятся в
`/tmp/rivto-react-docs/`, в исходники они не добавлены.

Браузерные E2E и измерения производительности повторно не запускались:
изменений алгоритмов, обработки событий, рендера или подписок в этом проходе нет.
Это проверка документации и имён, а не новое измерение быстродействия.
