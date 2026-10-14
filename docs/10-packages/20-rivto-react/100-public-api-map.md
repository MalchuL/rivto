# Карта public API и исходников

## Entry points

### `@chulane/rivto-react`

Основной entry экспортирует:

- `createReactEditor`, `EditorPanel`, runtime types;
- `standardPreset`, `blockExtension`, `pageDragExtension`, `edgelessPreset`, `edgelessSurfaceExtension`;
- default writing, separator и error block APIs;
- `edgelessVisualsExtension` и visual types;
- hooks;
- `BlockTree`, `BlockView`, wrappers и Markdown helpers;
- `EditableLabel`, `placeCaretAtPoint`;
- selected manager contracts, selection helpers, keymap constants.

### `@chulane/rivto-react/extensions`

Экспортирует полный catalog individual extension factories плюс block/default-writing/separator/edgeless visual contracts. Используйте subpath для custom preset; drag и edgeless features подключаются отдельно от `standardPreset()`.

### `@chulane/rivto-react/styles.css`

Скомпилированный Tailwind v4 bundle (`dist/styles.css`, собирается `pnpm build`) без preflight: chrome стилизован utilities и shadcn/ui primitives, structural rules лежат в colocated CSS per feature. Все правила layered, поэтому unlayered CSS приложения переопределяет их; theme настраивается через `--rivto-*` custom properties. Подробнее: `packages/react-rivto-editor/docs/styling.md`.

## Контракты менеджеров

Регистрация принадлежит runtime; локальные операции отмечены префиксом panel.

| Property                   | Основные methods                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `blocks`                   | `prepareInput`, `insertBlock`, `updateBlock(s)`, `deleteListProps(Batch)`, core block delegation                                    |
| `elementTypes`             | `register`, `get`, `getAll`, `subscribe`, `revision`                                                                                |
| `useEdgelessOperations()`  | `createElement`, `getTool`, `setTool`, `move`, `resize`, `group`, `ungroup`, `align`, `distribute`, `reorder`, `duplicateSelection` |
| `blockTypes`               | `register`, `delete`, `getDefinition`, `validateBlockProps`, separator metadata                                                     |
| `blockListProps`           | `register`, `has`, `validate`, `prepare` (core policy lifecycle adapter)                                                            |
| `renderers`                | `register`, `get`, `has`, `delete`, `subscribe`, `revision`                                                                         |
| `surfaces`                 | `register/get/delete`, `registerBlockWrapper`, `registerEditorWrapper`, wrapper getters, subscription                               |
| `extensions`               | `mount`, `getComponents`, `subscribe`, `revision`                                                                                   |
| `runtime.events`           | `register`, `delete`                                                                                                                |
| `runtime.panels`           | `getActive`, `getDefault`, `getActiveRoot`, `getDefaultRoot`                                                                        |
| `reactPanel.events`        | `register`, `delete`, `setRoot`, `getRoot`                                                                                          |
| `keyboard`                 | `register`, `delete`, `replaceKeymap`, `setKeymapOverride`                                                                          |
| `reactPanel.selection`     | `readDOM`, `restoreDOM`, `clearDOMHighlight`, `updateDOMHighlight`                                                                  |
| `runtime.clipboardFormats` | `registerFormatter`, `registerParser`, `format`, `parse`                                                                            |
| `runtime.slashCommands`    | `register`, `delete`, `get`, `getAll`, `subscribe`, `revision`                                                                      |
| `reactPanel.slashCommands` | `getAll(context)`, `execute`, `subscribe`, `revision`                                                                               |
| `reactPanel.clipboard`     | `copy`, `copyText`, `cut`, `paste`                                                                                                  |

Registrations обычно возвращают idempotent disposer и автоматически принадлежат extension lifecycle. Stable-key deletion возвращает `boolean`.

## От generic к concrete в исходниках

```text
src/editor/
  runtime, storage, creation options

src/panels/
  ReactPanel lifecycle and ReactPanelApi (bounded PanelAPI lives in core)

src/components/editor-panel/ + src/components/editor-embed/
  React components, contexts and component props

src/hooks/editor/
  usePanel, useReactPanel, useReactEditor and internal context readers

src/managers/*/api.ts and focused *-api.ts
  public contracts beside their implementations

src/block-behaviors/
  shared block interaction policy

src/managers/
  registries, events, selection and lifecycle

src/hooks/ + src/blocks/
  renderer/application consumption

src/extensions/
  optional interaction behavior

src/surfaces/
  page and edgeless layout, virtualization, snapping and surface settings

src/elements/
  element projection, visual renderers, definitions and geometry

src/managers/elements/ + src/hooks/elements/
  canvas operations, local tools and subscriptions

demo/src/
  product-level integration examples
```

## Выбор API

| Задача                   | Использовать                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Обычный page editor      | `standardPreset()`                                                                                |
| Block drag               | `pageDragExtension()`                                                                             |
| Canvas editor            | `standardPreset()` + `...edgelessPreset()`                                                        |
| Custom native block      | `blockExtension()` + `useBlockEditing()`                                                          |
| Toolbar                  | children `EditorPanel` + hooks                                                                    |
| Custom keyboard behavior | `useKeyboardEvent()` или extension `keyboard.register()`                                          |
| Custom browser gesture   | `useDOMEvent()`                                                                                   |
| Custom page decoration   | block/editor wrapper registration                                                                 |
| Canvas shapes            | `edgelessPreset()` включает visuals; `edgelessVisualsExtension()` для ручной сборки               |
| Custom canvas element    | `editor.elementTypes.register({ definition, render, behavior, clipboard, creation, properties })` |
| Persistence/sync         | core `editor`/`CRDTDoc`, не React managers                                                        |

## Package validation

```sh
pnpm --filter @chulane/rivto-react check-types
pnpm --filter @chulane/rivto-react test
pnpm --filter @chulane/rivto-react build
```
