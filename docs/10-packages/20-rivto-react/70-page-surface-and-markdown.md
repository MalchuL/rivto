# Page surface и Markdown

## Page mode

`pageSurfaceExtension()` регистрирует `PageSurface` для mode `"block"`. Surface выводит `<main class="page-surface">`, назначает его active editor root и передаёт root IDs в Page.

Page behavior из `standardPreset()` включает:

- Enter split/create;
- Backspace/Delete merge на boundaries;
- Tab/Shift+Tab indent/outdent;
- Alt+Shift structural move;
- caret и block-selection navigation;
- checkbox/numbered list properties и shortcuts;
- collapse/expand;
- drag-and-drop hierarchy;
- trailing add-block controls;
- slash menu.

Hierarchy остаётся core state. Surface только рекурсивно показывает её и не хранит отдельное React tree.

По умолчанию виртуализация выключена. `virtualizePageThreshold={true}` включает её для любого числа root blocks, `false` выключает, а число включает её при достижении заданного порога. `virtualizePageOverscan` задаёт одинаковый буфер сверху и снизу viewport; по умолчанию это 8 roots с каждой стороны.

```tsx
<EditorPanel
  editor={reactEditor}
  virtualizePageThreshold={1_000}
  virtualizePageOverscan={8}
/>
```

Буфер считается в root blocks; вложенные дети mounted root остаются в DOM.

## Markdown writing block

Default paragraph сохраняет Markdown как обычную строку `block.content`. Parsing — presentation only: headings/lists внутри Markdown не создают Rivto blocks и не меняют hierarchy.

```tsx
standardPreset({
  writing: {
    onMarkdownLinkClick({ href, event }) {
      if (!href.startsWith("rivto:")) return;
      event.preventDefault();
      navigateInsideApp(href);
    },
  },
})
```

`MarkdownLinkClick` properties:

- **`blockId: string`:** block с link;
- **`href: string`:** sanitized standard URL или explicitly enabled custom protocol;
- **`event: MouseEvent<HTMLAnchorElement>`:** host может вызвать `preventDefault()`.

## Editing и preview

`MarkdownContent` держит raw contenteditable mounted для стабильных offsets. В idle state formatted preview определяет block height, а raw editor становится прозрачным interaction layer. При focus preview скрывается и raw source участвует в layout.

Поддерживаются GFM и syntax highlighting через уже установленные `react-markdown`, `remark-gfm` и `rehype-highlight`. Raw user HTML не исполняется.

Code fence info может быть language или filepath:

````markdown
```typescript
const value = 1;
```

```src/example.py
print("Rivto")
```
````

`resolveCodeFenceInfo(value)` возвращает `{ label, language? } | undefined`; filepath label сохраняется, extension выбирает highlighting language.

## Lists и collapse

List/collapse metadata хранится в canonical `block.listProps`. `listShortcutsExtension()` и `collapseExtension()` регистрируют defaults/validation через React block capability. Поэтому application не должна записывать произвольные list fields без активной registration.

`BLOCK_LIST_TYPES`, `DEFAULT_BLOCK_LIST_PROPS`, `isNumberedListType()` и `resolveBlockListNumbers()` доступны для custom renderers.

В начале writing-блока пробел после сокращения преобразует его в list properties:

- `- ` — обычный список;
- `[] ` и `[ ] ` — незавершённый checkbox, `[x] ` и `[X] ` — завершённый checkbox;
- `0. ` и `1. ` — новая нумерованная последовательность (`start_numbered_list`);
- любое целое число от `2` с точкой и пробелом, например `2. ` или `42. `, — продолжение предыдущей последовательности (`continue_numbered_list`).

Введённое число выбирает режим, а не задаёт отображаемый номер. Продолжение использует последний номер среди предыдущих соседних блоков, в том числе через обычные блоки; если предыдущего номера нет, оно начинается с 1.

Сокращение должно находиться в самом начале блока, а пробел вводится сразу после него при отсутствии выделения. Текст после курсора сохраняется, курсор перемещается к его началу. Пробел перед сокращением не запускает преобразование. После снятия пустого checkbox или номера клавишей Enter следующий Enter создаёт новый блок; для вложенного пустого блока он сначала применяет обычный outdent.

## Separator

`separatorBlockExtension()` регистрирует type `SEPARATOR_BLOCK_TYPE` (`"separator"`). В page mode он показывает separator; в edgeless root flow он разделяет block cards. Enter/delete behavior создаёт подходящий default writing block через runtime factory.

Дочерние блоки separator в Page отображаются в общей пунктирной рамке с непрозрачностью 50% по умолчанию. Её можно настроить через CSS-переменную `--rivto-separator-children-opacity`, например `0.8`. Рамку можно свернуть; внутри сохраняются обычные вложенность и перетаскивание блоков. Линия вложенности первого уровня не рисуется, линии более глубоких уровней сохраняются. В Edgeless дочерние блоки корневого separator не отображаются, а вложенный separator остаётся частью своей карточки.

## Custom page chrome

Toolbar, breadcrumbs и document title лучше рендерить children `EditorPanel`, а не persisted blocks, если они не являются частью документа. Именно так demo держит journal date и mode toolbar вне CRDT state.
