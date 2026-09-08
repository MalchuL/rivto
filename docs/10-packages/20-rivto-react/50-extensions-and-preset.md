# Extensions и `standardPreset`

## `ReactEditorExtension`

```ts
interface ReactEditorExtension {
  readonly id: string;
  setup(reactEditor: ReactEditor): void | (() => void);
}
```

- **`id`:** stable unique identity; duplicate installation throws.
- **`setup(reactEditor)`:** synchronously регистрирует behavior через capabilities.
- **Возвращает:** optional cleanup для ресурсов, которыми не владеет manager.
- **Исключения:** setup errors откатывают owned registrations и прерывают runtime creation.

Manager registrations автоматически принадлежат active extension lifecycle. Не нужно вручную сохранять disposer, если registration создана внутри `setup()`.

```ts
const analyticsExtension = (): ReactEditorExtension => ({
  id: "app.analytics",
  setup(reactEditor) {
    return reactEditor.editor.subscribe(() => report(reactEditor.editor.dump()));
  },
});
```

## `standardPreset(options?)`

- **Аргументы:** `number | StandardPresetOptions`; number — legacy shorthand для `trailingBlockCount`.
- **Возвращает:** complete `ReactEditorExtension` с ID `rivto.standard`.
- **Исключения:** invalid trailing count и ошибки setup любой вложенной extension.

### `StandardPresetOptions`

- **`trailingBlockCount?: number`:** количество page-end add buttons; default `3`, positive integer.
- **`writing?: DefaultWritingBlockOptions`:** custom default writing type/renderer/factory/link handler.
- **`edgeless?: EdgelessSurfaceOptions`:** snapping store, card width и overlap policy.

Preset устанавливает writing/error/separator blocks, обе surfaces, history, text/block selection, slash/list/clipboard, navigation, indent/outdent, Enter/merge/delete, collapse, trailing controls, drag и базовые edgeless interactions.

`edgelessVisualsExtension()` намеренно не входит в preset: visual shapes — opt-in product feature.

## `defaultWritingBlockExtension(options?)`

- **Аргументы:** `DefaultWritingBlockOptions`.
- **Возвращает:** extension `block.default-writing`.
- **Исключения:** block/renderer/slash registration и custom factory errors при использовании.

Properties options:

- `type` default `DEFAULT_WRITING_BLOCK_TYPE` (`"paragraph"`);
- `title` default `"Paragraph"`;
- `render` default `MarkdownContent`;
- `slashCommand` partial override;
- `createDefaultBlock` для Enter/trailing/separator/clipboard;
- `isEmptyBlock` для reset/outdent behavior;
- `onMarkdownLinkClick({ blockId, href, event })` для host routing.

## Individual built-ins

Индивидуальные factories импортируются из subpath:

```ts
import {
  pageSurfaceExtension,
  historyExtension,
  indentExtension,
} from "@chulane/rivto-react/extensions";
```

| Группа | Extensions |
| --- | --- |
| Surfaces | `pageSurfaceExtension`, `edgelessSurfaceExtension` |
| History/clipboard | `historyExtension`, `clipboardExtension` |
| Selection | `textSelectionExtension`, `blockSelectionExtension`, `selectionDeletionExtension` |
| Navigation | `caretNavigationExtension`, `blockSelectionNavigationExtension`, `keyboardBlockMoveExtension` |
| Writing | `blockCreationExtension`, `blockMergeExtension`, `blockOutdentExtension`, `emptyBlockResetExtension`, `indentExtension` |
| Page UI | `trailingBlockExtension`, `collapseExtension`, `listShortcutsExtension`, `pageDragExtension`, `slashCommandExtension` |
| Edgeless | `edgelessSelectionExtension`, `edgelessTransformExtension`, `edgelessDeletionExtension`, `edgelessMovementExtension` |

## Extension ordering

Setup идёт слева направо, cleanup — справа налево. Dependencies ставьте раньше consumers. Например, custom behavior, использующий `createDefaultBlock`, должен идти после `defaultWritingBlockExtension`; в preset этот порядок уже соблюдён.

## Mounted UI и wrappers

- `reactEditor.extensions.mount(Component)` добавляет headless/visual component рядом с surface.
- `surfaces.registerEditorWrapper(Wrapper, mode?)` оборачивает всё содержимое `EditorView`.
- `surfaces.registerBlockWrapper(mode, Wrapper)` оборачивает каждый recursive block.

Mounted component присутствует во всех modes. Mode-specific behavior ограничивайте через event definition или `useEditorMode()`.
