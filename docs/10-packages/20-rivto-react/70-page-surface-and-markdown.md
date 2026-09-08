# Page surface и Markdown

## Page mode

`pageSurfaceExtension()` регистрирует `PageSurface` для mode `"block"`. Surface выводит `<main class="page-surface">`, назначает его active editor root и передаёт root IDs в `BlockTree`.

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

## Separator

`separatorBlockExtension()` регистрирует type `SEPARATOR_BLOCK_TYPE` (`"separator"`). В page mode он показывает separator; в edgeless root flow он разделяет block cards. Enter/delete behavior создаёт подходящий default writing block через runtime factory.

## Custom page chrome

Toolbar, breadcrumbs и document title лучше рендерить children `EditorView`, а не persisted blocks, если они не являются частью документа. Именно так demo держит journal date и mode toolbar вне CRDT state.
