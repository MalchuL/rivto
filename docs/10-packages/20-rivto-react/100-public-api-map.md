# Карта public API и исходников

## Entry points

### `@chulane/rivto-react`

Основной entry экспортирует:

- `createReactEditor`, `EditorView`, runtime types;
- `standardPreset`, `blockExtension`, `edgelessSurfaceExtension`;
- default writing, separator и error block APIs;
- `edgelessVisualsExtension` и visual types;
- hooks;
- `BlockTree`, `BlockView`, wrappers и Markdown helpers;
- `EditableLabel`, `placeCaretAtPoint`;
- selected manager contracts, selection helpers, keymap constants.

### `@chulane/rivto-react/extensions`

Экспортирует полный catalog individual built-in extension factories плюс block/default-writing/separator/edgeless visual contracts. Используйте subpath для custom preset; для обычного editor достаточно root `standardPreset()`.

### `@chulane/rivto-react/styles.css`

Готовые base styles и CSS variables. Application может переопределять theme values после этого import.

## Capability methods

| Property | Основные methods |
| --- | --- |
| `blocks` | `register`, `registerListProps`, `prepareBlock`, `insertBlock`, `updateBlock(s)`, `deleteListProps(Batch)`, `delete` |
| `renderers` | `register`, `get`, `has`, `delete`, `subscribe`, `revision` |
| `surfaces` | `register/get/delete`, `registerBlockWrapper`, `registerEditorWrapper`, wrapper getters, subscription |
| `extensions` | `mount`, `getComponents`, `subscribe`, `revision` |
| `events` | `register`, `delete`, `setRoot`, `getRoot` |
| `keyboard` | `register`, `delete`, `replaceKeymap`, `setKeymapOverride` |
| `selection` | `readDOM`, `restoreDOM`, `clearDOMHighlight`, `updateDOMHighlight` |
| `clipboard` | `registerFormatter`, `registerParser`, `format`, `parse` |
| `slashCommands` | `register`, `delete`, `getAll`, `execute`, `subscribe`, `revision` |

Registrations обычно возвращают idempotent disposer и автоматически принадлежат extension lifecycle. Stable-key deletion возвращает `boolean`.

## От generic к concrete в исходниках

```text
src/types.ts + capabilities.ts
  public contracts

src/react-editor.tsx + editor-view.tsx
  composition and React boundary

src/managers/
  registries, events, selection and lifecycle

src/hooks/ + src/blocks/
  renderer/application consumption

src/extensions/
  optional interaction behavior

src/surfaces/
  page and edgeless layout

demo/src/
  product-level integration examples
```

## Выбор API

| Задача | Использовать |
| --- | --- |
| Обычный editor | `standardPreset()` |
| Custom native block | `blockExtension()` + `useBlockEditing()` |
| Toolbar | children `EditorView` + hooks |
| Custom keyboard behavior | `useKeyboardEvent()` или extension `keyboard.register()` |
| Custom browser gesture | `useDOMEvent()` |
| Custom page decoration | block/editor wrapper registration |
| Canvas shapes | `edgelessVisualsExtension()` |
| Persistence/sync | core `editor`/`CRDTDoc`, не React managers |

## Package validation

```sh
pnpm --filter @chulane/rivto-react check-types
pnpm --filter @chulane/rivto-react test
pnpm --filter @chulane/rivto-react build
```
