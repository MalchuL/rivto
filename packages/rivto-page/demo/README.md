# Автономное демо Rivto Page

Из корня workspace:

```sh
pnpm --filter @chulane/rivto-page demo
```

Открыть [обычный документ](http://127.0.0.1:5184) или
[большой документ](http://127.0.0.1:5184/?repeat=200): 1000 корней и 200 дочерних узлов,
без виртуализации. Vite использует исходники пакета; отдельный watch/build не требуется.

Демо подключает публичный `BlockEditor` с одним `DemoAdapter`. Адаптер — пример host
в памяти: canonical model, ReactEditor и EditorPanel здесь не используются. Конкретный
renderer владеет обычным textarea и читает собственный text; Page получает structural
snapshots. При перезагрузке страницы данные сбрасываются.

Можно проверить:

- Все пять listType и снятие типа списка, checked, collapsed и фон блока.
- Обновление текста, состояние snapshot и сохранение объекта узла.
- Выделение блока и перестановку корней без замены объектов.
- Динамическое подключение/удаление renderer для каждого пятого корня.
- Unmount/remount редактора с сохранением host-данных. После unmount нажать
  «Обновить статистику»: subscriptions должны стать 0.

ListType и collapsed пока меняют поля. Маркеры списков и скрытие потомков не реализованы;
это демо текущего контракта, без production rich text, navigation, DnD, clipboard и undo.
Снятие listType сохраняет checked, как и низкоуровневая команда узла.

Статистика обновляется только по кнопке и не подписывает toolbar на изменения документа.
commandMs измеряет последнюю синхронную запись вместе с уведомлениями; не включает
последующий React commit/layout. Сначала сбросить счётчики, выполнить команду, затем
обновить статистику. Включение renderer и изменение порядка закономерно затрагивают
больше одного блока.

Проверки production-сборки в Chromium и Firefox:

```sh
pnpm --filter @chulane/rivto-page demo:build
pnpm --filter @chulane/rivto-page demo:test
pnpm --filter @chulane/rivto-page demo:performance
```

Поведенческие тесты используют `--workers=12`, замеры — `--workers=1`. Playwright сам
поднимает preview на 5184: dev-сервер на этом порту перед тестами нужно остановить.
Для уже запущенной production-сборки можно указать `PLAYWRIGHT_BASE_URL`.
Performance-сценарий меняет настоящий select клавишами ArrowDown/Home, проверяет snapshot, неизменность узла,
отсутствие чтений корней и ограниченное число чтений узла на обоих размерах. Отдельно
сохраняет commandMs и время от change до двух animation frames; это rendering proxy,
а не измерение полной задержки нативного открытия dropdown.

`node.color` / `node.setColor(...)` задают фон блока. Демо использует фоновые токены
оригинала: gray, red, orange, yellow, green, blue, purple. Default отправляет null и
снимает локальный override; текст сохраняет свой цвет. В будущем production adapter
свяжет это поле с listProps.backgroundColor. Фон здесь оформлен локальной палитрой,
без зависимости от CSS текущего react-rivto-editor.
