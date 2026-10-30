# RBush для поиска drop target: эксперимент

Дата: 2026-10-21. Решение: не подключать RBush/cache strategy в runtime rivto-page
по результатам этого эксперимента. Совпадение результатов получено в проверенных
сценах, но устойчивого ускорения относительно текущего hit testing нет. Это вывод
для текущего DOM-контракта, а не запрет на пространственные индексы вообще.

## Что сравнивалось

Использованы реальные DemoSession, DemoAdapter, BlockEditor, block renderers,
BlockDropTarget/BlockDropGap и опубликованный CSS production-сборки. Временный
production React host монтировал стандартные fixture outline, Kanban и Bento,
без виртуализации, с тем же inspector. Toolbar/statistics не монтировались;
измерялся этап поиска, а не полный drag-and-drop или всё приложение.

Для outline прототип регистрировал реальные block rows как inside targets, поскольку
стандартный outline ещё не имеет sibling drop-зон. Kanban/Bento использовали свои
существующие регистрации. Сравнение выполнялось на одном и том же DOM и data source.

Базовая стратегия вызывала существующий BlockDropTargets.resolve. Гибрид использовал:

1. RBush 4.0.1 с default maxEntries=9, bulk-loaded актуальным snapshot прямоугольников.
2. Заранее записанные зарегистрированные ancestor paths, включая ancestors, чьи
   собственные bounds могут не содержать точку overflow-descendant.
3. Один native elementFromPoint для проверки видимости/occlusion. Быстрый путь
   разрешён только при точном совпадении native hit с индексированным элементом;
   недостаточно простого попадания в bounding rectangle.
4. Ту же live-проверку canonical parent/previousId/nextId и те же приоритеты,
   nearest ancestor и earliest registration. Неоднозначность, отсутствие совпадения
   или устаревший snapshot ведут в базовый ancestor walk с уже полученным native hit.
   Второго elementFromPoint в fallback нет.
5. Epoch fencing для публикации отложенной сборки: MutationObserver records
   проверяются синхронно перед lookup; scroll/resize и регистрации инвалидируют
   snapshot; результат сборки старой версии отбрасывается.

Это благоприятный для индекса эксперимент: hot-path lookup не оплачивал ни сборку,
ни worker messaging. Сборка была отложена через task, без отдельного Worker.
Native DOM measurement всё равно оставался на main thread. Зафиксированная стоимость
подготовки показана отдельно. Incremental RBush.remove/update и worker не исследовались:
готовый индекс уже не прошёл условие ускорения, поэтому production strategy не создавалась.
Прототип не объявляется готовым механизмом отслеживания всех CSS/layout изменений.

## Измерения

Chromium 149.0.7827.55 и Firefox 151.0, headless, viewport 1280×720, production React,
по одному browser/page последовательно, без tracing и конкурирующих тестов/сборок.

Предварительный burst из программных запросов давал сильно другую стоимость в
Chromium на большом DOM. Поэтому итоговая таблица использует настоящие pointermove
от Playwright mouse.move и измерения внутри обработки этих событий.

Для каждой видимой позиции проверялось совпадение элемента и destination. После
прогрева выполнялись восемь чередующихся пар пакетов по 2000 запросов каждой стратегии;
порядок native/indexed менялся, результат потреблялся через checksum. В таблице —
медиана средних затрат на lookup по позициям, где существует цель, в микросекундах.
Точки включали прямые gap/row hits и content hits с fallback. Background проверялся,
но не включён в эту медиану. Всего 204 реальные pointer-позиции в 12 fixture cases.
Это не individual-query p95 и не pointer-to-paint latency; точность таймера, особенно
Firefox, ограничивает интерпретацию небольших различий.

| Browser  | Fixture | repeat | Nodes / regions | Native, µs | Hybrid, µs | Initial snapshot, ms |
| -------- | ------- | ------ | --------------- | ---------- | ---------- | -------------------- |
| chromium | outline | 1      | 6 / 6           | 1.06       | 1.19       | 0.20                 |
| chromium | outline | 200    | 1200 / 1200     | 1.05       | 1.25       | 3.70                 |
| chromium | kanban  | 1      | 10 / 17         | 1.15       | 1.18       | 0.30                 |
| chromium | kanban  | 200    | 2000 / 3400     | 1.20       | 1.33       | 10.90                |
| chromium | bento   | 1      | 7 / 17          | 1.10       | 1.27       | 0.40                 |
| chromium | bento   | 200    | 1400 / 3400     | 1.16       | 1.43       | 11.30                |
| firefox  | outline | 1      | 6 / 6           | 4.25       | 4.38       | 1.00                 |
| firefox  | outline | 200    | 1200 / 1200     | 16.25      | 16.75      | 3.00                 |
| firefox  | kanban  | 1      | 10 / 17         | 4.75       | 4.50       | 0.00                 |
| firefox  | kanban  | 200    | 2000 / 3400     | 7.25       | 7.50       | 8.00                 |
| firefox  | bento   | 1      | 7 / 17          | 5.25       | 5.38       | 1.00                 |
| firefox  | bento   | 200    | 1400 / 3400     | 7.75       | 8.25       | 7.00                 |

Небольшие улучшения отдельных direct hits не дали устойчивого преимущества в
смешанном потоке и больших fixtures. Например, Chromium large Kanban: 1.20 → 1.33 µs,
large Bento: 1.16 → 1.43 µs; Firefox: 7.25 → 7.50 и 7.75 → 8.25 µs соответственно.
В Firefox small Kanban получено 4.75 → 4.50 µs, но этот выигрыш не повторяется на
большом документе и не покрывает обслуживание индекса. Даже на direct hits большого
Kanban почти нет разницы; large Bento не ускоряется. Значение 0 ms подготовки в
Firefox означает ограничение разрешения таймера, а не отсутствие работы.

В контрольном наборе fast path использовался в 84 из 204 позиций (~41%);
остальные запросы шли через fallback. Это выбранная смесь gaps/content/background,
а не оценка частоты fallback в реальных drag-сессиях. Для всех запросов к видимым
целям сохранялось совпадение элемента и canonical destination.

Дополнительно записан p95 средних пакетных затрат (не individual-query p95).
На large Kanban/Bento Chromium: 1.30 → 1.58 и 1.20 → 1.45 µs; Firefox:
8.50 → 8.00 и 8.25 → 9.00 µs. Устойчивого tail-выигрыша между раскладками и
браузерами также нет. Эти микрозамеры не подменяют input-to-paint latency.

## Проверка корректности

В Chromium и Firefox проверены 72 состояния Kanban/Bento: 787 сравнений
позиций плюс 24 точечные adversarial checks. Расхождений не обнаружено.
Отдельные проверки подтверждали:

- current snapshot и fallback во время незавершённой/отклонённой сборки;
- scroll, viewport resize, text input, tile width и добавление column;
- появление higher-priority регистрации на существующем элементе;
- порядок одинаковых приоритетов и удаление первой duplicate-регистрации;
- внешний overlay без изменения subtree редактора, clip-path и nested editor;
- collapse/unmount зон и восстановление после expand.

Проверки не заменяют полный regression suite и не доказывают полноту автоматического
отслеживания геометрии, CSS animations, всех lifecycle/error paths или source move
permissions. Реальная drag-сессия и worker pipeline в production не подключались.

## Вывод и граница решения

При текущем resolve(clientX, clientY) браузер остаётся источником истины о видимом
элементе. Индекс добавляет query и подготовку metadata, но не устраняет native hit
test. Уже подготовленный индекс не дал устойчивого выигрыша; дополнительная
асинхронная инфраструктура и обслуживание не обоснованы этими измерениями.

Поэтому utility, зависимость rbush и cache strategy в пакет не добавлены. Runtime,
API, существующие тесты, package.json и pnpm-lock не менялись в этом эксперименте.
Пересмотреть решение можно при другом контракте видимости/геометрии (например,
модельные bounds в edgeless), используя сравнение полной стоимости, а не только
чистого tree.search. Это потенциальное направление, не измеренный результат.

## Артефакты эксперимента

Временный каталог: /tmp/rivto-rbush-probe. Зависимости установлены CLI только туда,
без изменения workspace. Там сохранены probe.tsx, build.mjs, pointer-run.mjs,
correctness.mjs, package-lock.json и raw JSON/logs. После очистки /tmp эти артефакты
могут исчезнуть; в репозитории сохраняется только этот отчёт.

Команды повторного запуска в текущем workspace:

```sh
node /tmp/rivto-rbush-probe/build.mjs
node /tmp/rivto-rbush-probe/pointer-run.mjs
node /tmp/rivto-rbush-probe/correctness.mjs
```

Runner ожидает свежий production preview на http://127.0.0.1:5185. Не выполнять
сборки или другие browser runs одновременно с измерениями. Исходный API библиотеки:
[RBush](https://github.com/mourner/rbush#usage).
