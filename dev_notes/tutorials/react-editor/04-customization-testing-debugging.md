# Глава 04. Customization, тесты и отладка React editor

## 1. Custom outer renderer strategy

Host может обернуть built-in renderer:

```tsx
function DemoPageRenderer(props: EditorRendererProps) {
  return (
    <section data-renderer="BlockDOMRenderer">
      <span>BlockDOMRenderer</span>
      <BlockDOMRenderer {...props} />
    </section>
  );
}
```

И передать:

```tsx
<RivtoEditor
  editor={editor}
  defaultBlockType="paragraph"
  renderers={{
    page: DemoPageRenderer,
    edgeless: DemoCanvasRenderer,
  }}
/>
```

Wrapper сохраняет built-in interactions, потому что передаёт все props дальше.

## 2. Полностью custom strategy

Custom renderer может построить другой DOM, но должен сам обеспечить нужные
bridges:

- выполнить mutations через commands;
- dispatch normalized events, если нужны plugin behaviors;
- подписка уже обеспечена outer `RivtoEditor`;
- правильно обозначить block IDs, если используются selection/focus helpers;
- не хранить отдельную authoritative копию document.

Если renderer вообще не использует built-in DOM selection helpers, он может
иметь собственную selection projection, но portable runtime selection contract
остаётся общим.

## 3. Custom block renderer

Definition renderer меньше outer strategy и отвечает только за presentation
конкретного type:

```tsx
render: ({ block, editor, content }) => (
  <aside data-tone={block.props.tone}>
    {content}
    <button onClick={() => editor.commands.execute(...)}>
      Change tone
    </button>
  </aside>
)
```

Используйте supplied `content`, чтобы сохранить default editing behavior.

## 4. Что тестировать unit tests без React

Runtime policy дешевле и стабильнее проверять без DOM:

- command validation и mutations;
- plugin lifecycle;
- event routing order;
- mode filtering;
- selection validation;
- undo/redo;
- clipboard normalization.

Не нужно кликать browser button, чтобы доказать `block.insert` semantics.

## 5. Что тестировать E2E

Browser tests нужны там, где важен настоящий DOM/browser behavior:

- typing в contentEditable;
- caret и cross-block selection;
- copy/paste native events;
- keyboard shortcuts;
- slash popup after `/`;
- drag/drop;
- canvas drag/resize;
- mode renderer switch;
- persistence после reload;
- focus после block insertion.

## 6. Полезный E2E principle

Проверяйте observable behavior, а не React implementation detail.

Хорошо:

```text
пользователь вводит текст → текст виден → после reload сохранён
```

Хрупко:

```text
component render function вызвана ровно три раза
```

Concurrent React и Strict Mode могут менять количество renders без изменения
пользовательского результата.

## 7. Симптом: печатаю, caret прыгает в начало

Проверяйте `EditableText` synchronization.

Вероятная причина: focused contentEditable безусловно переписывает
`innerHTML/textContent` после каждого document update.

Правильная логика сначала сравнивает visible DOM text с `block.content` и не
трогает равный DOM.

## 8. Симптом: remote text не появляется в focused block

Обратная проблема: code никогда не обновляет focused host, считая, что browser
всегда authoritative.

При mismatch focused DOM и model layout effect должен применить model content.
Затем selection restoration возвращает portable caret, если это возможно.

## 9. Симптом: после переключения mode все blocks unknown

Проверьте lifecycle runtime и plugins.

Исторический demo bug:

1. Strict Mode replay вызвал effect cleanup;
2. cleanup уничтожил editor;
3. тот же instance продолжил render;
4. BlockRegistry definitions уже были удалены;
5. renderer показал Unknown block type.

Это не mode renderer bug. Root cause — использование terminally destroyed
runtime.

## 10. Симптом: canvas block выбирается, но текст не редактируется

Проверьте bubbling guard в `BlockView.onClick`. Click на contentEditable или
form control не должен вызывать object `select()`.

Также keyboard canvas movement должен игнорировать events из editable target.

## 11. Симптом: plugin event срабатывает, browser всё равно делает default

Handler должен вернуть ровно `true`, router должен вернуть handled, а React
adapter должен вызвать `event.preventDefault()`.

Проверьте всю цепочку. Один missing return превращает handled operation в
двойное действие.

## 12. Симптом: plugin UI не обновился после install

`PluginManager.use()` вызывает runtime `changed()`. Binding должна быть
подписана на `editor.revision`.

Проверьте:

- plugin действительно installed;
- UI item проходит mode/block type filter;
- current selection даёт ожидаемый active block;
- component использует тот же editor instance.

## 13. Симптом: slash menu не появляется

Пошагово:

1. установлен ли `createSlashMenuPlugin(...)`;
2. `onInput` вызывается ли contentEditable;
3. runtime event `input` дошёл ли до router;
4. payload text начинается ли с `/`;
5. plugin state содержит ли block ID/query;
6. binding подписана ли на slash plugin;
7. `BlockView` для этого ID показывает `SlashMenu`;
8. items доступны в текущем mode.

## 14. Симптом: copy/paste использует старый caret

`selectionchange` browser asynchronous. Поэтому `onPaste` непосредственно
перед command снова читает native selection из root и обновляет portable
selection.

Если этот шаг удалён, быстрая Ctrl+V может использовать предыдущее положение
SelectionManager.

## 15. Симптом: memory leak после смены renderer

Проверьте все imperative listeners:

- document `selectionchange`;
- window `pointermove`;
- window `pointerup`;
- plugin setup subscriptions.

Каждая registration должна иметь symmetric cleanup с теми же event options.

## 16. Симптом: state обновляется, React не rerender

Найдите владельца состояния:

```text
document/plugin definition/UI  → editor revision subscription
mode                            → mode subscription
selection                       → selection subscription
slash query                     → slash plugin subscription
local zoom/rectangle            → React useState
```

Если owner изменил value, но не вызвал listeners, чините owner publication, а
не добавляйте force update в случайный child.

## 17. Checklist custom renderer review

- Renderer получает long-lived editor через props.
- Не создаёт runtime во время каждого render.
- Document values читаются как detached snapshots.
- Mutations выполняются commands.
- Browser events нормализуются до runtime events там, где нужна plugin policy.
- `preventDefault` вызывается только при handled custom behavior.
- Editable DOM не переписывается без необходимости.
- User HTML экранируется.
- IME composition не ломается.
- Text controls на canvas не превращаются в object selection.
- Window/document listeners удаляются.
- Nested blocks учитываются, если feature работает со всем tree.
- Unit tests проверяют runtime policy, E2E — browser integration.

## 18. Полная mental model

Когда поведение работает, цикл выглядит так:

```text
user gesture
  ↓
browser mutates DOM or emits event
  ↓
React adapter extracts portable data
  ↓
EventRouter selects policy
  ↓
CommandRegistry executes intent
  ↓
DocumentModel performs CRDT transaction
  ↓
runtime subscriptions publish revision
  ↓
React reads detached document again
  ↓
layout effects reconcile DOM-only state
  ↓
browser paints result
```

При отладке не смотрите на весь editor сразу. Найдите первый шаг этой цепочки,
где actual value перестаёт совпадать с expected. Это почти всегда быстрее, чем
добавлять logs во все components одновременно.

