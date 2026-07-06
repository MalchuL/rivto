# Глава 02. Как работает EditableText

## 1. Почему `contentEditable` сложнее input

Controlled input обычно выглядит так:

```tsx
<input value={text} onChange={(event) => setText(event.target.value)} />
```

React управляет одним `value`. У `contentEditable` browser управляет DOM tree:

- создаёт text nodes;
- вставляет `<br>`;
- двигает native caret;
- выполняет composition для IME;
- может вставить formatted HTML;
- меняет DOM до React event handler.

Если после каждого keypress безусловно присваивать `innerHTML`, browser caret
прыгает или исчезает.

## 2. Component inputs

`EditableText` получает:

```ts
{
  block,
  title,
  editor,
  defaultBlockType,
}
```

`block.content` — Markdown source из detached document. Component не хранит
вторую строку текста в React state.

Local state только сообщает, находится ли host в editing presentation:

```ts
const [editing, setEditing] = useState(false);
```

## 3. Edit source и preview HTML

Когда block не редактируется:

```ts
const html = markdownHtml(block.content);
```

Когда редактируется:

```ts
escapeHtml(block.content).replace(/\n/g, "<br>")
```

То есть focus показывает raw Markdown source, blur — маленький visual preview.

`escapeHtml()` выполняется до вставки tags, чтобы user text не превратился в
произвольный HTML/script.

## 4. Почему это не полный Markdown parser

`markdownHtml()` поддерживает небольшой набор wrappers regex-заменами. Его
комментарий прямо говорит: это intentionally small preview, не CommonMark.

Главная архитектурная гарантия: document хранит exact source. Позже preview
можно заменить полноценным parser без migration persisted data.

## 5. Layout effect синхронизации DOM

После render effect получает actual element.

### Если element сейчас focused

```ts
const visibleText = element.innerText.replace(/\n$/, "");
if (visibleText !== block.content) {
  element.textContent = block.content;
}
```

Если values равны, DOM не трогается. Это сохраняет native caret после обычного
typing.

Если values различаются, model изменилась извне: remote update, structured
paste или programmatic command. Тогда focused DOM нужно обновить.

### Если element не focused

```ts
if (element.innerHTML !== html) {
  element.innerHTML = html;
}
```

Можно безопасно показать preview, потому что активного caret внутри нет.

## 6. Focus и blur

```tsx
onFocus={(event) => {
  if (!editing) event.currentTarget.textContent = block.content;
  setEditing(true);
}}
onBlur={() => setEditing(false)}
```

При focus preview markup заменяется raw source. Иначе пользователь мог бы
редактировать DOM `<strong>` вместо символов `**`.

После blur следующий render/layout effect возвращает preview HTML.

## 7. `suppressContentEditableWarning`

React предупреждает, когда element с React-managed children является
contentEditable: browser может изменить children вне React.

Здесь это поведение осознанно, а синхронизацию component выполняет вручную.
`suppressContentEditableWarning` скрывает конкретное ожидаемое warning, но не
решает synchronization автоматически.

## 8. `onInput`

```ts
const text = event.currentTarget.innerText.replace(/\n$/, "");
editor.commands.execute("text.set", { id: block.id, text });
editor.events.dispatch({
  type: "input",
  blockId: block.id,
  payload: { text },
});
```

Порядок важен:

1. document получает новое content;
2. plugins видят normalized input и могут, например, открыть slash menu.

Slash handler читает уже актуальный text из payload, не DOM node.

Trailing newline удаляется, потому что browsers часто представляют пустую
конечную строку contentEditable через дополнительный line break.

## 9. `onBeforeInput` для cross-block selection

Browser не умеет надёжно атомарно заменить range через несколько независимых
contentEditable hosts.

Перед native mutation component проверяет:

- event не находится в IME composition;
- runtime selection имеет type text;
- anchor и head в разных blocks;
- inputType является insert или delete.

Затем:

```ts
event.preventDefault();
editor.commands.execute("clipboard.paste", {
  defaultBlockType,
  text,
});
```

Clipboard manager уже умеет нормализовать cross-block range, сохранить prefix
и suffix, удалить covered middle blocks и collapsed selection поставить в
результат.

Это reuse одной сложной операции для typing-over-selection и paste.

## 10. Почему composition пропускается

IME ввод (например, китайский или японский) состоит из промежуточных browser
composition states. Перехват каждого промежуточного `beforeinput` разрушил бы
native composition session.

```ts
if (native.isComposing) return;
```

Accessibility и international input — не optional edge case.

## 11. `onKeyDown` сначала идёт в EventRouter

EventRouter даёт plugins и built-in fallbacks обработать:

- slash Escape;
- Enter;
- Backspace empty block;
- Tab;
- Undo/Redo shortcut.

Если `handled`, component предотвращает browser default.

## 12. Fallback replacement cross-block range

Не все browsers/input paths гарантированно дают нужный `beforeinput`. Поэтому
keydown дополнительно проверяет printable key, Backspace или Delete при
cross-block selection.

Тогда тоже выполняется `clipboard.paste` с введённым character или пустой
строкой.

## 13. BlockContent

`BlockContent` сначала resolve definition:

```ts
const definition = editor.blocks.get(block.type);
```

Если definition отсутствует, показывает unknown block. Persisted data не
удаляется.

Special built-ins:

- divider рисуется как `<hr>`;
- image/file имеют URL input;
- list items получают visual prefix;
- остальные получают `EditableText`.

## 14. Custom block renderer

```ts
const Renderer = editor.blocks.getRenderer(
  block.type,
  editor.mode.get(),
);
```

Renderer получает:

```tsx
<Renderer
  block={block}
  editor={editor}
  content={defaultEditableContent}
/>
```

Хороший renderer оборачивает `content` и выполняет дополнительные actions через
commands. Он не должен создавать параллельный uncontrolled text editor без
явной необходимости.

## 15. Markdown formatting toolbar

Toolbar function принимает только single-block text selection. Она вычисляет:

```ts
from = Math.min(anchor.offset, head.offset)
length = Math.abs(head.offset - anchor.offset)
```

Затем выполняет `text.format`. Cross-block formatting сейчас не поддерживается
и функция просто возвращается.

## 16. Опасные изменения

### Всегда писать `innerHTML` после render

Сломает caret при каждом keypress.

### Использовать `dangerouslySetInnerHTML` с raw user text

Откроет HTML injection. Сначала нужен escape или безопасный parser.

### Вызывать DocumentModel прямо в `onInput`

Обойдёт command diagnostics и единый public mutation path.

### Хранить вторую копию content в `useState`

Появятся conflicts между local state, remote CRDT update и props.

### Игнорировать IME

Редактор станет непригоден для части языков.

