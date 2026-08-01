Стартовая точка: иди от React-входа к runtime-состоянию.

Я бы читал в таком порядке:

1. [src/editor/react/rivto-editor.tsx](/media/ssd_stuff/work/assistants/rivto/src/editor/react/rivto-editor.tsx)

   Это главный мост между браузером и runtime.

   Тут смотри:

   - `selectionchange` listener;
   - `readEditorSelection(...)`;
   - `editor.commands.execute("selection.set", ...)`;
   - `restoreEditorSelection(...)`;
   - document-level `keydown` для ArrowUp/Down;
   - `onCopy`;
   - `onPaste`.

   Главная идея файла:

   ```txt
   browser DOM selection/events
     → portable EditorSelection
     → runtime selection manager
     → React repaint/restore DOM selection
   ```

2. [src/editor/react/renderers.tsx](/media/ssd_stuff/work/assistants/rivto/src/editor/react/renderers.tsx)

   Это место, где selection создаётся жестами пользователя.

   Тут смотри:

   - `EditableText`;
   - `BlockDOMRenderer`;
   - `selectBlock`;
   - `pointerSelection`;
   - rectangle selection для block mode;
   - `EdgelessCanvasRenderer`;
   - rectangle selection для edgeless mode.

   Этот файл отвечает на вопрос:

   ```txt
   Что значит клик, drag, Tab, ArrowUp, ArrowDown именно в UI?
   ```

3. [src/editor/react/selection.ts](/media/ssd_stuff/work/assistants/rivto/src/editor/react/selection.ts)

   Это самый важный helper-файл для понимания координат.

   Тут живут функции:

   - `readEditorSelection`;
   - `readDOMSelectionPoint`;
   - `readDOMPointPosition`;
   - `restoreEditorSelection`;
   - `blockIdsInRect`;
   - `updateCrossBlockHighlight`;
   - `clearNativeSelection`.

   Это переводчик:

   ```txt
   DOM Node + DOM offset
     ↔
   { blockId, offset }
   ```

4. [src/editor/editor/types.ts](/media/ssd_stuff/work/assistants/rivto/src/editor/editor/types.ts)

   Тут определены сами формы selection:

   ```ts
   TextSelection
   BlockSelection
   EditorSelection
   ```

   Это надо прочитать рано, потому что всё остальное крутится вокруг этих двух shape-ов.

5. [src/editor/managers/selection-manager.ts](/media/ssd_stuff/work/assistants/rivto/src/editor/managers/selection-manager.ts)

   Это маленький storage для текущего selection.

   Он не знает про DOM. Он просто хранит:

   ```txt
   current selection
   subscribe()
   set()
   clear()
   get()
   ```

6. [src/editor/editor/rivto-editor.ts](/media/ssd_stuff/work/assistants/rivto/src/editor/editor/rivto-editor.ts)

   Тут runtime валидирует и применяет selection.

   Смотри:

   - command `"selection.set"`;
   - `setSelection`;
   - `reconcileSelection`;
   - `selectedBlockIds`;
   - `restoreBlockSelection`;
   - keydown fallback для Tab/undo/enter/delete.

   Это место, где selection становится не просто UI-событием, а правилом редактора.

7. [src/editor/managers/clipboard-bundle.ts](/media/ssd_stuff/work/assistants/rivto/src/editor/managers/clipboard-bundle.ts)

   Читать после базового понимания selection.

   Тут видно, как selection превращается в copy payload:

   - text selection → partial text range;
   - block selection → целые block subtrees;
   - edgeless mode → тот же BlockSelection для root или nested blocks.

8. [src/editor/managers/clipboard-manager.ts](/media/ssd_stuff/work/assistants/rivto/src/editor/managers/clipboard-manager.ts)

   Тут selection используется для:

   - copy;
   - cut;
   - paste;
   - replace selected range.

Если совсем коротко, маршрут такой:

```txt
rivto-editor.tsx
  ↓
renderers.tsx
  ↓
selection.ts
  ↓
types.ts
  ↓
selection-manager.ts
  ↓
editor/rivto-editor.ts
  ↓
clipboard-bundle.ts
  ↓
clipboard-manager.ts
```

Моя рекомендация: начни не с `SelectionManager`, а с `src/editor/react/rivto-editor.tsx`. Потому что selection рождается не в manager-е. Manager — это коробка. Реальная магия начинается там, где браузерный DOM selection превращается в наш `EditorSelection`.
