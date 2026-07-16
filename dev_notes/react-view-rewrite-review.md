# How to review the React view rewrite

This guide covers the clean-break rewrite of `src/view/react`, the supporting
`block.type.set` runtime command, and the demo-owned surfaces. The main review
question is whether the package remains a small rendering kernel while concrete
layout and interaction policy stays in the demo.

The untracked `blocksuite/` directory is reference material and is not part of
the change under review.

## Recommended reading order

1. **Runtime capability**
   - `src/store/document-model/core/document-model.ts`: `setBlockType()`
   - `src/editor/rivto-editor.ts`: `block.type.set` and `setBlockType()`
   - `src/editor/__tests__/block-commands.test.ts`: preservation and undo test
2. **Public React kernel**
   - `src/view/react/editor/types.ts`
   - `src/view/react/editor/context.tsx`
   - `src/view/react/editor/editor-view.tsx`
   - `src/view/react/blocks/block-view.tsx`
   - `src/view/react/blocks/use-block-text-editing.ts`
3. **Library behavior plugins**
   - `src/view/react/plugins/text-selection.tsx`
   - `src/view/react/plugins/clipboard.tsx`
   - `src/view/react/plugins/keyboard.tsx`
4. **Consumer implementation**
   - `demo/src/editor/surfaces.tsx`
   - `demo/src/editor/page-plugin.tsx`
   - `demo/src/editor/edgeless-plugin.tsx`
   - `demo/src/editor/slash-plugin.tsx`
   - `demo/src/App.tsx`
5. **Observable behavior**
   - `e2e/editor.spec.ts`

## Architectural checks

### `EditorView`

- Accepts an explicit surface child; it must not choose a surface or inspect a
  surface registry.
- Provides only editor, root, and ordered plugin context.
- Rejects empty or duplicate plugin IDs.
- Composes root wrappers in declaration order and lets React own cleanup.
- Subscribes with `useSyncExternalStore` and never owns the editor lifecycle.

### `BlockView`

- Owns only the stable block ID/type/selected DOM markers and forwarded div
  attributes/ref.
- Applies block plugin wrappers in the same order as root wrappers.
- Does not choose renderers, recurse into children, select blocks, or render a
  drag handle.
- Remains usable by page, edgeless, preview, or future server-backed surfaces.

### Plugins

- Clipboard, keyboard, and text-selection behavior are independent wrappers;
  no registry, DI container, or custom lifecycle manager should reappear.
- Delegated event handlers ignore `defaultPrevented` where another plugin may
  have claimed the event.
- Every document/window/root listener has a matching cleanup.
- Text selection does not restore a stale caret into a currently focused
  contenteditable and does not overwrite rectangle/block selection on unrelated
  pointer-up events.
- Keyboard behavior stays command-driven: Enter splits, Backspace merges,
  arrows cross block boundaries, and Tab/Shift+Tab indent/outdent.

### Runtime type conversion

- The target type is registered and its default props are validated before the
  document changes.
- ID, content, children, layout, and plugin data survive conversion.
- Old props are cleared instead of leaking into a different schema.
- Type and prop replacement happen in one CRDT transaction and undo restores
  both values.

### Demo boundary

- Page/edgeless surfaces and their visual renderers exist only under `demo`.
- `@dnd-kit/*` is declared by `demo/package.json`, not the published package.
- The page plugin owns block/range/rectangle selection and sortable behavior.
- The edgeless plugin owns positioned containers, object selection, dragging,
  and arrow movement.
- The slash plugin converts the current block through the public editor API; it
  does not mutate document storage directly.

## Behavior to exercise manually

Run `pnpm demo`, then check:

1. Edit a paragraph and reload; content and caret behavior remain stable.
2. Press Enter in the middle of text, Backspace at the start of the new block,
   then Tab and Shift+Tab.
3. Type `/` in an empty paragraph and convert it to a heading.
4. Select handles with Shift/Ctrl, rectangle-select blocks, and drag the group.
5. Switch to edgeless mode, edit text without selecting the card, select two
   cards, drag them, and move them with arrow keys.
6. Switch back and confirm both surfaces show the same document.

## Automated verification

```sh
pnpm check-types
pnpm --dir demo check-types
pnpm test -- --runInBand
pnpm demo:build
pnpm exec playwright test e2e/editor.spec.ts --project=chromium --project=firefox
pnpm exec eslint src/view/react src/store/document-model/core/document-model.ts src/editor/types.ts --max-warnings=0
git diff --check
```

Expected result: 165 unit tests and 16 browser tests pass. Full `pnpm lint`
still reports older JSDoc-policy failures in `src/editor/clipboard.ts` and the
existing `createRivtoEditor` export; use the targeted lint command above when
reviewing this rewrite.

## Diff sanity check

The rewrite deliberately deletes the renderer/surface registry classes,
default surfaces/renderers, `BlockShell`, and their obsolete tests. A review
should treat attempts to restore compatibility adapters or move demo surfaces
back into the package as architectural regressions unless a new consumer
requirement justifies them.
