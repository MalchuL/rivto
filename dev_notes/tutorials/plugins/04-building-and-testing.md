# Глава 04. Как написать и проверить plugin

## 1. Сначала сформулируйте contributions

Пример задачи: добавить callout, кнопку только в edgeless mode и slash action.

Нужны:

```text
BlockDefinition callout
plugin command demo.addCallout
slash item Callout
toolbar UI contribution
```

Setup и global event не нужны, если feature не владеет отдельным resource или
interaction policy.

## 2. Block definition

```tsx
const calloutDefinition: BlockDefinition = {
  type: "callout",
  content: "inline",
  title: "Callout",
  render: ({ content }) => (
    <aside className="demo-callout">{content}</aside>
  ),
};
```

Renderer получает готовое default editable content. Он оборачивает его, а не
реализует собственный mutation path.

## 3. Plugin object

```ts
const demoPlugin: RivtoPlugin = {
  id: "rivto-demo-commands",
  blocks: [calloutDefinition],
  slashItems: [{
    title: "Callout",
    aliases: ["note", "aside"],
    group: "Demo",
    block: { type: "callout" },
  }],
  commands: {
    "demo.addCallout": (editor) =>
      editor.commands.execute("block.insert", {
        block: {
          type: "callout",
          content: "A block inserted through CommandRegistry.",
        },
        afterId: editor.getBlocks().at(-1)?.id,
      }),
  },
  ui: [{
    id: "demo.addCallout",
    slot: "toolbar",
    title: "Add callout",
    command: "demo.addCallout",
    modes: ["edgeless"],
  }],
};
```

Это почти тот же plugin, который использует demo.

## 4. Установка

При создании runtime:

```ts
const editor = createRivtoEditor({
  plugins: [
    createSlashMenuPlugin(defaultSlashItems),
    demoPlugin,
  ],
});
```

Порядок полезно выбирать осознанно. Equal-priority global handlers сохраняют
installation order.

## 5. Почему slash menu устанавливается отдельно

Core runtime не обязан иметь slash UI. Host opt-in включает его:

```ts
createSlashMenuPlugin(defaultSlashItems)
```

Другие plugins добавляют свои `slashItems`; slash plugin собирает active items
через `editor.plugins.getSlashItems()`.

Такая композиция позволяет:

- headless runtime без slash UX;
- другой slash renderer;
- product-specific набор default items;
- feature plugins без зависимости от React popup.

## 6. Как slash execution заменяет trigger block

Default action:

1. вставляет новый typed block после trigger block;
2. удаляет trigger block с `/query`;
3. просит runtime focus новый block;
4. очищает plugin state.

Все document mutations идут через commands.

`focus()` выполняется через microtask, потому что после insert React ещё должен
commit новый DOM node.

## 7. Минимальный lifecycle test

Проверьте:

```ts
const dispose = editor.use(plugin);

expect(editor.blocks.has("callout")).toBe(true);
expect(editor.commands.has("demo.addCallout")).toBe(true);

dispose();

expect(editor.blocks.has("callout")).toBe(false);
expect(editor.commands.has("demo.addCallout")).toBe(false);
```

Не заглядывайте в private maps manager.

## 8. Mode-aware test

Для plugin-level modes:

1. создайте runtime в block mode;
2. убедитесь, что UI hidden;
3. убедитесь, что command throws `unavailable`;
4. переключитесь command `mode.set`;
5. проверьте UI и command в edgeless;
6. dispose plugin;
7. проверьте отсутствие contributions.

Так test покрывает не только lookup, но и реальный lifecycle.

## 9. Event test

Записывайте порядок вызовов и возвращаемый handled result. Обязательно добавьте
случай, где ранний handler возвращает true и более поздние не вызываются.

После disposer сделайте ещё один dispatch: cleanup bugs проявляются только
после удаления.

## 10. Atomicity test

Создайте conflict в поздней contribution и проверьте, что ранние исчезли.

Полезные conflicts:

- duplicate command;
- duplicate UI ID;
- duplicate block type;
- blockEvent для unknown type.

Не нужно отдельного огромного test на каждую строку. Достаточно сценариев,
доказывающих rollback across registry boundaries.

## 11. Slash plugin test

Последовательность:

1. initial paragraph block;
2. dispatch input с `/hea`;
3. state равен `{ blockId, query: "hea" }`;
4. filtered items содержат heading;
5. execute `slash.execute`;
6. старый block удалён;
7. новый heading существует;
8. state закрыт.

Это тестирует policy без React DOM.

## 12. Debugging checklist

### Plugin не устанавливается

- ID unique?
- Block types unique?
- Command names unique?
- UI IDs unique?
- Block type зарегистрирован до blockEvent?
- Setup не бросает exception?

### Command есть, но throws unavailable

- Какой `editor.mode.get()`?
- Какие `plugin.modes`?
- Не ожидали ли вы, что UI modes и command modes независимы?

### UI не показывается

- Renderer запрашивает правильный slot?
- Mode проходит filter?
- Есть active block type для item с `blockTypes`?
- Command ID правильный?
- Runtime revision обновился после install?

### Event не запускается

- React renderer dispatch именно этот normalized type?
- Event содержит правильный `blockId`?
- Более ранний handler не вернул true?
- Mode active?
- Plugin ещё установлен?

### Slash item не виден

- Установлен slash-menu plugin?
- Feature plugin active в mode?
- Block definition зарегистрирован?
- Renderer block доступен в текущем mode?
- Query совпадает с title или aliases?

## 13. Checklist перед merge

- У plugin стабильный unique namespaced ID.
- Payloads проверяются во время выполнения.
- Mutations используют commands.
- Setup возвращает cleanup.
- Disposer проверен test.
- Mode restrictions проверены в обоих modes.
- Event возвращает true только при полном claim.
- Stored unknown blocks не удаляются при uninstall.
- UI contribution ссылается на реально зарегистрированную command.
- Atomic failure не оставляет частичные resources.
