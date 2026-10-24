# Выделение и групповой перенос при виртуализации

## Граница реализации

Page владеет pointer-жестом, hit testing, отменой и обратной связью. Хост
владеет проверкой допустимости и атомарным переносом IDs через отдельный
адаптер мутаций расширения. Целиком editor/panel/document в Page не передаются.
Существующий реестр dropTargets сохраняется. Display roots не означают общего
родителя: destinations по-прежнему указывают реального родителя.

## Этап 1: выделение вне DOM

`getTextLength` возвращает undefined для блока без текстового диапазона и 0 для
пустого текстового блока. Рендерер не определяет семантику выделения своим
присутствием в viewport. Длины читаются только для выбранного интервала;
промежуточные contentless-блоки получают структурный маркер end=-1.
Проверить пустой текст, оба направления, скрытый contentless и число чтений.

## Этап 2: групповой DnD

Начало только с явно размеченного drag handle. После порога движения выбираем
все IDs структурного selection, если активный блок входит в него; иначе только
активный. Порядок берётся из selection (канонический), выбранные потомки
выбранного предка исключаются. Разные родители разрешены; один вызов host move
переносит нормализованные корни, включая размонтированные.

Группа фиксируется на начало жеста; pointermove не перечитывает выбранное дерево.
Каждый актуальный target проверяется хостом, commit повторно валидирует IDs,
соседей и запрет циклов. Неприменимый перенос ничего не меняет. Хост сохраняет
структурное выделение перемещённой группы. Превью — число корней без монтажа
редакторов/поддеревьев. Escape, pointercancel, blur и detach отменяют жест.
Автоскролл окна повторяет hit testing после прокрутки и React commit.

## Этап 3: проверка

Unit: hidden selection, mixed parents, ancestor exclusion, stale/deleted IDs,
cycle prevention, transaction publication, cleanup. Browser: реальные ручки,
перенос и отмена, виртуализация, сохранение selection. Performance: production
preview, Chromium/Firefox, repeat=1/200, workers=1, command отдельно от двух RAF,
с проверкой результата. Behavioral workers=12, ошибки повторить workers=1.

## Повторная проверка границ

Не добавлять drag manager в controller без потребности: расширение владеет
своим runtime, общие события дают detach. Не переносить старый full-tree hot
path, recursive preview и same-parent-only fallback. Не обещать root reorder,
перенос между редакторами, clipboard/history или вложенную виртуализацию:
это отдельные интеграционные этапы с host-командами.

## Реализовано и проверено (2026-10-22)

`BlockDragExtension` создаёт runtime на installation; runtime заимствует только
getParentId, selection.get, events.register/onDetach и dropTargets.resolve.
Конкретный controller/node lifecycle наружу не передаётся. Mutation capability
`BlockDragAdapter.moveBlocks` принадлежит хосту и проверяет данные перед записью.
Геометрическая подсветка цели не обещает разрешения host policy: хост вправе
отказать в commit. Повторная регистрация extension создаёт отдельные ресурсы.

Вместо DOM-классификации используется `getTextLength(): number | undefined`.
Undefined означает отсутствие текстового диапазона, 0 — пустой текст. Метод
`createSelection` больше не принимает DOM root. Canonical IDs по-прежнему
просматриваются для поиска границ, но длины читаются только внутри интервала.

Проверены creation/setup → input → commit → cancel/detach/disposal, границы
заимствования, отсутствие document-model в Page и package-owned CSS. Новый
handle находится в end slot, чтобы не менять размер start gutter. В outline
демо явной inside-целью служит строка, в Kanban — зарегистрированные колонки;
общий default layout пакета не получает неявной политики контейнеров.

### Проверки

- 116 unit-тестов, 13 suites.
- Полный behavioral run: 86 passed, workers=12. После добавления проверки
  autoscroll финальные 8 DnD scenarios passed, workers=12, Chromium + Firefox.
- В промежуточных runs обнаружены сдвиг gutter и устаревшая проверка отсутствия
  всего end slot после удаления demo contribution. Оба воспроизведены с workers=1
  в обоих браузерах и исправлены; тест contribution теперь проверяет сам contribution.
- 12 performance cases passed, production preview, workers=1, trace off.
- Package build, demo build/typecheck, lint (0 errors, 12 length warnings),
  targeted formatting и git diff --check прошли.

### Производительность повторного группового переноса

Реальный pointer drag двух выбранных блоков, четыре измеренных прогона после
прогрева. Восстановление эквивалентного состояния — перенос группы обратно.
Счётчики обнуляются после позиционирования указателя, до pointerup; toolbar
не прокручивает страницу внутри измеряемого интервала. Два RAF — proxy кадра,
а не гарантия завершения всех асинхронных layout updates.

| Browser | Fixture | repeat | virtual | Два RAF, median (min–max), ms | Чтения узлов |
| --- | --- | --- | --- | --- | --- |
| Chromium | outline | 1 | no | 26.5 (25.3–27.6) | 57 |
| Chromium | outline | 200 | no | 41.1 (40.3–42.0) | 57 |
| Chromium | outline | 200 | yes | 25.2 (23.7–27.2) | 59 |
| Chromium | Kanban | 1 | no | 27.1 (26.9–27.6) | 51 |
| Chromium | Kanban | 200 | no | 88.0 (84.7–94.1) | 51 |
| Chromium | Kanban | 200 | yes | 33.8 (24.0–44.8) | 51–52 |
| Firefox | outline | 1 | no | 28 (25–30) | 57 |
| Firefox | outline | 200 | no | 50 (47–51) | 57–58 |
| Firefox | outline | 200 | yes | 37 (31–40) | 59 |
| Firefox | Kanban | 1 | no | 31.5 (31–35) | 51 |
| Firefox | Kanban | 200 | no | 64 (60–109) | 51 |
| Firefox | Kanban | 200 | yes | 89 (82–153) | 51 |

Synchronous host commit во всех финальных samples: 0–0.2 ms Chromium,
0 ms Firefox на доступной точности таймера. Это не означает нулевую стоимость.
Новый gesture раньше отсутствовал: эти результаты — исходная точка нового
runtime, не утверждение об ускорении production DnD старого редактора.

Профиль CDP Chromium для Kanban repeat=200: TaskDuration около 76 ms без
windowing и 8 ms с ним; ScriptDuration около 8.3/2.9 ms, LayoutDuration 3.2/0.45 ms.
Этот отдельный диагностический прогон не включён в latency samples. Firefox
нельзя считать ускоренным на больших Kanban: нужен отдельный browser profile.

### Ограничения, выявленные проверками

Первые performance assertions для virtual cases включали прокрутку toolbar и
первоначальное изменение списка корней. Они дали 1118 чтений в outline и 168 в
Kanban вместо бюджета повторного переноса. Root-to-child transition отдельно
прогревается; лимит чтений 150 для измеряемых переносов не повышен. Перестроение
list metadata за O(R) при смене roots осталось реальным ограничением и записано
в migration TODO. Холодный root reorder не включён в таблицу повторных переносов.

Root virtualization монтирует целые поддеревья. Большой visible container,
Firefox Kanban paint/frame latency, вложенные scroll containers, keyboard move,
cross-editor move, root insertion и production undo требуют следующих этапов.
Браузерные проверки демонстрируют скрытый выбранный источник из другого родителя,
Escape, detach/remount и остановку autoscroll, но не заменяют production integration.
