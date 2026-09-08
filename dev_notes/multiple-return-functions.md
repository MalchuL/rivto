# Multiple-return functions in packages/

Policy (AGENTS.md): Prefer a single main exit point. Early guard returns at the start are fine for invalid, missing, or no-op conditions. Avoid multiple complex returns interleaved with the main logic.

Legend:
- `[ X ]` refactored (changes made to collapse interleaved/main-path returns)
- `[ O ]` remaining returns are only early guards (invalid / missing / no-op)

Scanned: 248 functions in 80 files.
After refactor: 152 remaining functions in 65 files (guards only).
Marked: 56 changed, 24 guard-only.

## [ X ] packages/react-rivto-editor/src/__tests__/react-editor.test.ts
- (no remaining multiple returns)

## [ O ] packages/react-rivto-editor/src/blocks/block-tree.tsx
- BlockTreeNode:48 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/blocks/markdown-code.tsx
- resolveCodeFenceInfo:118 (2 returns, guards only)
- replaceMarkdownCode:186 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/blocks/markdown.tsx
- (no remaining multiple returns)

## [ O ] packages/react-rivto-editor/src/blocks/unknown-block.tsx
- UnknownBlock:5 (2 returns, guards only)

## [ O ] packages/react-rivto-editor/src/components/editable-label.tsx
- <anonymous>:90 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/components/place-caret-at-point.ts
- placeCaretAtPoint:13 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/clipboard/clipboard.ts
- canvasSelection:77 (2 returns, guards only)
- fallbackStructuredClipboard:112 (2 returns, guards only)
- <anonymous>:274 (2 returns, guards only)
- <anonymous>:286 (2 returns, guards only)
- handleDocumentClipboard:303 (3 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/edgeless/edgeless-deletion.ts
- when:29 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/edgeless/edgeless-movement.ts
- move:10 (2 returns, guards only)

## [ O ] packages/react-rivto-editor/src/extensions/edgeless/edgeless-runtime.ts
- <anonymous>:37 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/edgeless/edgeless-selection.tsx
- <anonymous>:65 (4 returns, guards only)
- <anonymous>:121 (3 returns, guards only)
- <anonymous>:148 (2 returns, guards only)
- <anonymous>:186 (3 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts
- <anonymous>:69 (2 returns, guards only)
- previewFrame:89 (2 returns, guards only)
- ensureOverlay:107 (2 returns, guards only)
- <anonymous>:146 (2 returns, guards only)
- <anonymous>:358 (4 returns, guards only)
- <anonymous>:470 (2 returns, guards only)
- finish:503 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/edgeless/visuals/components/creation-panel.tsx
- (no remaining multiple returns)

## [ X ] packages/react-rivto-editor/src/extensions/edgeless/visuals/components/drawing-capture.tsx
- (no remaining multiple returns)

## [ X ] packages/react-rivto-editor/src/extensions/edgeless/visuals/components/tool-bar.tsx
- <anonymous>:60 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/edgeless/visuals/components/visual-element.tsx
- (no remaining multiple returns)

## [ O ] packages/react-rivto-editor/src/extensions/edgeless/visuals/components/visual-properties.tsx
- onPointerDown:54 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/edgeless/visuals/controller.ts
- <anonymous>:110 (3 returns, guards only)
- <anonymous>:191 (2 returns, guards only)
- write:523 (2 returns, guards only)
- <anonymous>:537 (2 returns, guards only)
- duplicateSelection:678 (2 returns, guards only)
- <anonymous>:685 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/edgeless/visuals/hooks/use-drawing-gesture.ts
- hoverFor:119 (3 returns, guards only)
- cancelGesture:141 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/edgeless/visuals/hooks/use-preset-drag.ts
- movePresetDrag:89 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/edgeless/visuals/utils/connector-path.ts
- segmentCutsInterior:144 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/edgeless/visuals/utils/creation-geometry.ts
- (no remaining multiple returns)

## [ X ] packages/react-rivto-editor/src/extensions/edgeless/visuals/utils/geometry-core.ts
- (no remaining multiple returns)

## [ O ] packages/react-rivto-editor/src/extensions/edgeless/visuals/utils/geometry.test.ts
- <anonymous>:57 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/edgeless/visuals/utils/geometry.ts
- unionFrames:35 (2 returns, guards only)
- betterSnap:68 (2 returns, guards only)

## [ O ] packages/react-rivto-editor/src/extensions/edgeless/visuals/visual-layer.tsx
- EdgelessVisualLayer:20 (2 returns, guards only)
- <anonymous>:76 (2 returns, guards only)
- onContextMenu:79 (2 returns, guards only)
- onPointerDown:86 (3 returns, guards only)

## [ O ] packages/react-rivto-editor/src/extensions/error/error-block.tsx
- ErrorBlock:18 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/history/history.ts
- <anonymous>:100 (2 returns, guards only)

## [ O ] packages/react-rivto-editor/src/extensions/page/indent.ts
- applyIndentShortcut:18 (3 returns, guards only)

## [ O ] packages/react-rivto-editor/src/extensions/page/list-shortcuts.ts
- <anonymous>:45 (3 returns, guards only)
- <anonymous>:59 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/page/outline-scope.ts
- (no remaining multiple returns)

## [ O ] packages/react-rivto-editor/src/extensions/page/page-backspace.ts
- <anonymous>:30 (3 returns, guards only)
- <anonymous>:55 (4 returns, guards only)
- <anonymous>:82 (4 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/page/page-collapse.ts
- setCollapsed:47 (3 returns, guards only)

## [ O ] packages/react-rivto-editor/src/extensions/page/page-delete.ts
- <anonymous>:23 (4 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/page/page-drag-placement.ts
- resolveAfterDropPlacement:44 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/page/page-drag.tsx
- eventPointer:91 (2 returns, guards only)
- pageCollisionDetection:162 (2 returns, guards only)
- edgelessCollisionDetection:187 (3 returns, guards only)
- resolveDropPlacement:310 (2 returns, guards only)
- <anonymous>:495 (2 returns, guards only)
- updateCrossDocumentTarget:530 (2 returns, guards only)
- validPlacement:551 (2 returns, guards only)
- <anonymous>:715 (2 returns, guards only)
- <anonymous>:721 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/page/page-enter.ts
- <anonymous>:32 (3 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/page/page-navigation.ts
- focusAdjacentEditor:91 (2 returns, guards only)
- movePlain:136 (2 returns, guards only)
- extendText:172 (3 returns, guards only)
- move:220 (2 returns, guards only)
- grow:233 (3 returns, guards only)
- enterText:250 (2 returns, guards only)
- move:281 (3 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/page/page-selection-utils.ts
- toggleBlockSelection:134 (2 returns, guards only)
- extendBlockSelection:161 (2 returns, guards only)
- keyboardMovePlacement:243 (2 returns, guards only)

## [ O ] packages/react-rivto-editor/src/extensions/page/trailing-block.tsx
- TrailingBlock:13 (2 returns, guards only)

## [ O ] packages/react-rivto-editor/src/extensions/selection/block-selection.ts
- <anonymous>:74 (4 returns, guards only)

## [ O ] packages/react-rivto-editor/src/extensions/selection/selection-deletion.ts
- when:22 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/selection/text-selection.ts
- <anonymous>:223 (2 returns, guards only)
- <anonymous>:312 (2 returns, guards only)
- <anonymous>:325 (2 returns, guards only)

## [ O ] packages/react-rivto-editor/src/extensions/separator/separator-block.tsx
- insertSeparator:42 (2 returns, guards only)
- <anonymous>:122 (3 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/slash/slash-menu.tsx
- findSlash:41 (2 returns, guards only)
- caretOffset:67 (2 returns, guards only)
- SlashMenu:101 (2 returns, guards only)
- <anonymous>:245 (2 returns, guards only)
- <anonymous>:284 (3 returns, guards only)

## [ X ] packages/react-rivto-editor/src/extensions/slash/slash-search.ts
- (no remaining multiple returns)

## [ X ] packages/react-rivto-editor/src/hooks/blocks/use-block-children.ts
- (no remaining multiple returns)

## [ X ] packages/react-rivto-editor/src/hooks/blocks/use-block-editing.ts
- <anonymous>:167 (3 returns, guards only)
- <anonymous>:199 (2 returns, guards only)
- extend:222 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/managers/blocks/block-manager.ts
- updateBlock:177 (3 returns, guards only)
- <anonymous>:198 (2 returns, guards only)
- deleteListProps:225 (2 returns, guards only)
- <anonymous>:247 (2 returns, guards only)
- isValid:281 (2 returns, guards only)
- <anonymous>:283 (2 returns, guards only)
- delete:300 (2 returns, guards only)

## [ O ] packages/react-rivto-editor/src/managers/blocks/renderer-manager.ts
- delete:67 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/managers/clipboard/clipboard-manager.ts
- (no remaining multiple returns)

## [ X ] packages/react-rivto-editor/src/managers/events/block-dom.ts
- findBlockFromEvent:30 (2 returns, guards only)
- findPreviousEditableBlock:75 (2 returns, guards only)
- findNextEditableBlock:87 (2 returns, guards only)
- focusBlock:121 (2 returns, guards only)
- verticalCaretPosition:239 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/managers/events/event-manager.ts
- delete:120 (2 returns, guards only)
- nativeTarget:215 (2 returns, guards only)
- scopeMatches:299 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/managers/events/keyboard-manager.ts
- delete:130 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/managers/events/selection.ts
- firstKeyboardTarget:30 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/managers/events/shortcut.ts
- (no remaining multiple returns)

## [ X ] packages/react-rivto-editor/src/managers/selection/dom-text-selection.ts
- saveDOMSelection:147 (3 returns, guards only)
- restoreDOMSelection:171 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/managers/selection/editor-dom-selection.ts
- createBlockSelection:188 (2 returns, guards only)
- readPosition:242 (2 returns, guards only)
- readBlockIdAtPoint:292 (2 returns, guards only)
- readEditorDOMSelection:334 (2 returns, guards only)
- readDOMSelectionPoint:434 (2 returns, guards only)
- restoreEditorDOMSelection:564 (2 returns, guards only)

## [ O ] packages/react-rivto-editor/src/managers/slash/slash-command-manager.ts
- delete:55 (2 returns, guards only)

## [ O ] packages/react-rivto-editor/src/managers/surfaces/surface-manager.ts
- delete:71 (2 returns, guards only)
- <anonymous>:104 (2 returns, guards only)

## [ X ] packages/react-rivto-editor/src/surfaces/edgeless/block-elements.ts
- maximumWeightMatching:29 (2 returns, guards only)

## [ O ] packages/react-rivto-editor/src/surfaces/edgeless/edgeless-block.tsx
- EdgelessBlockElement:14 (2 returns, guards only)

## [ O ] packages/react-rivto-editor/src/surfaces/edgeless/edgeless-surface.tsx
- <anonymous>:110 (3 returns, guards only)
- createBlockAt:129 (3 returns, guards only)
- <anonymous>:169 (2 returns, guards only)
- stopPan:180 (2 returns, guards only)
- <anonymous>:220 (2 returns, guards only)

## [ X ] packages/rivto-editor-core/src/editor/rivto-editor.ts
- <anonymous>:320 (2 returns, guards only)
- <anonymous>:337 (2 returns, guards only)

## [ X ] packages/rivto-editor-core/src/managers/block-manager/block-manager.ts
- (no remaining multiple returns)

## [ O ] packages/rivto-editor-core/src/managers/block-registry-manager/block-registry-manager.ts
- isRecord:16 (2 returns, guards only)

## [ X ] packages/rivto-editor-core/src/managers/clipboard-manager/clipboard-manager.ts
- cut:67 (2 returns, guards only)
- createClipboardBundle:114 (2 returns, guards only)

## [ X ] packages/rivto-editor-core/src/managers/clipboard-manager/utils/clipboard.ts
- <anonymous>:187 (2 returns, guards only)

## [ X ] packages/rivto-editor-core/src/managers/selection-manager/selection-manager.ts
- normalize:84 (2 returns, guards only)

## [ X ] packages/rivto-editor-core/src/store/crdt-doc/yjs-doc/providers/broadcast.ts
- <anonymous>:36 (2 returns, guards only)

## [ O ] packages/rivto-editor-core/src/store/crdt-doc/yjs-doc/structures/basic.ts
- parent:41 (2 returns, guards only)

## [ X ] packages/rivto-editor-core/src/store/crdt-doc/yjs-doc/structures/utils/__tests__/wrap.test.ts
- (no remaining multiple returns)

## [ X ] packages/rivto-editor-core/src/store/crdt-doc/yjs-doc/structures/utils/plain-check.ts
- isDeepPlainRecord:8 (3 returns, guards only)

## [ X ] packages/rivto-editor-core/src/store/crdt-doc/yjs-doc/structures/utils/wrap.ts
- unwrapCRDTtoYJS:28 (3 returns, guards only)
- wrapYJStoCRDT:78 (3 returns, guards only)

## [ X ] packages/rivto-editor-core/src/store/crdt-doc/yjs-doc/structures/utils/yjs-converters.ts
- (no remaining multiple returns)

## [ X ] packages/rivto-editor-core/src/store/document-model/core/managers/block-manager/block-manager.ts
- getBlock:116 (2 returns, guards only)
- getChildIds:148 (2 returns, guards only)
- deleteListProps:295 (2 returns, guards only)
- <anonymous>:584 (2 returns, guards only)
- <anonymous>:630 (3 returns, guards only)
- readBlock:772 (3 returns, guards only)
- findContainer:802 (2 returns, guards only)
- resolvePath:832 (2 returns, guards only)
- isConsecutiveSelection:913 (2 returns, guards only)
- collectTreeIds:951 (2 returns, guards only)

## [ O ] packages/rivto-editor-core/src/store/document-model/core/managers/block-manager/utils.ts
- validate:21 (2 returns, guards only)

## [ X ] packages/rivto-editor-core/src/store/document-model/core/managers/plugin-data-manager/plugin-data-manager.ts
- get:40 (2 returns, guards only)

## [ X ] packages/rivto-editor-core/src/store/document-model/core/utils/clone.ts
- clone:7 (2 returns, guards only)

