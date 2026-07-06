# Курс: selection и clipboard в Rivto

## Для кого этот курс

Курс написан для junior frontend-разработчика. Предполагается, что вы знаете
основы JavaScript и React-компонентов, но можете не знать:

- как браузер представляет HTML после рендера;
- как работает `contenteditable`;
- чем `Selection` отличается от `Range`;
- зачем React нужны effect и layout effect;
- почему один и тот же текст одновременно существует в DOM и в модели;
- как устроен системный буфер обмена.

Все эти понятия объясняются до того, как используются.

## Как проходить курс

Читайте главы по порядку. Каждая следующая глава использует понятия предыдущей.

| Глава | Что изучаем | Главные файлы после прочтения |
| --- | --- | --- |
| [00](./00-browser-basics.md) | DOM, `contenteditable`, курсор, `Selection`, `Range`, события | пока не читаем код Rivto |
| [01](./01-runtime-model.md) | три типа selection и путь через команды | `types.ts`, `selection-manager.ts`, `rivto-editor.ts` |
| [02](./02-text-selection.md) | обычное и cross-block выделение текста | `react/selection.ts`, `react/renderers.tsx` |
| [03](./03-block-and-edgeless-selection.md) | целые блоки, рамка, canvas | `react/renderers.tsx` |
| [04](./04-react-synchronization.md) | подписки, ререндер, восстановление курсора | `react/rivto-editor.tsx` |
| [05](./05-clipboard.md) | Copy, Cut, Paste и нормализация диапазона | `clipboard-bundle.ts`, `clipboard-manager.ts` |
| [06](./06-contributing-and-debugging.md) | изменение кода, диагностика и тесты | unit и E2E tests |

Не переходите к clipboard до того, как поймёте направленное текстовое
выделение. Почти вся сложность Cut/Paste связана с тем, что пользователь может
выделять и сверху вниз, и снизу вверх.

## Одна мысль, которую нужно запомнить заранее

В Rivto одновременно существуют две формы выделения:

```text
выделение браузера                         выделение Rivto
DOM-узел + offset                          blockId + offset
живёт в window.getSelection()              живёт в SelectionManager
ломается при замене DOM-узла               переживает React-ререндер
нужно для реального курсора                нужно для команд и clipboard
```

Это не дублирование ради архитектуры. Браузер плохо работает с одним
выделением через несколько независимых `contenteditable`, а React может
заменить DOM-узлы в любой момент. Поэтому две формы нужны и постоянно
синхронизируются.

## Карта кода

```text
src/editor/
├── editor/
│   ├── types.ts                 формы selection и команды
│   └── rivto-editor.ts          проверка и очистка selection
├── managers/
│   ├── selection-manager.ts     хранение локального selection
│   ├── clipboard-bundle.ts      чтение selection для Copy
│   └── clipboard-manager.ts     Cut и Paste
└── react/
    ├── selection.ts             перевод DOM ↔ Rivto и подсветка
    ├── renderers.tsx            мышь, клавиатура, блоки, canvas
    ├── rivto-editor.tsx         связь React с runtime
    └── styles.ts                визуальное выделение
```

## Термины курса

- **runtime** — один запущенный экземпляр редактора и его менеджеры.
- **model/document** — данные блоков, хранящиеся в CRDT.
- **DOM** — реальные объекты HTML-страницы, с которыми работает браузер.
- **portable selection** — выделение Rivto из ID блоков и числовых offsets.
- **native selection** — выделение браузера из DOM-узлов и offsets.
- **cross-block** — диапазон, начинающийся в одном блоке и заканчивающийся в другом.
- **collapsed selection** — диапазон нулевой длины, то есть обычный курсор.
- **direction** — направление жеста: от anchor к head.
- **normalization** — временное превращение направленного диапазона в
  упорядоченные `start` и `end` для изменения документа.
