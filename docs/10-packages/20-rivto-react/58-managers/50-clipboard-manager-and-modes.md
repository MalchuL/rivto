# `ClipboardManager` и clipboard по modes

React clipboard состоит из двух частей:

- core `editor.clipboard` создаёт/вставляет lossless `ClipboardBundle`;
- React `reactEditor.clipboard` форматирует blocks для external applications и парсит external HTML/text.

Browser events соединяет `clipboardExtension()`.

## `ClipboardManager` properties

Public properties отсутствуют. Ordered formatter/parser arrays private и принадлежат React runtime.

## Methods

### `registerFormatter(formatter)`

- **Аргументы:** `{ id; matches?(context); format(context, current) }`.
- **Возвращает:** idempotent disposer.
- **Исключения:** empty/duplicate ID, destroyed runtime; formatter вызывается позже и его errors propagate из `format()`.

Все matching formatters выполняются registration order и могут изменить `{ plain, markdown, html }` предыдущего formatter.

### `registerParser(parser)`

- **Аргументы:** `{ id; parse({ html, text }) }`.
- **Возвращает:** disposer.
- **Исключения:** empty/duplicate ID/destroyed runtime; parser errors propagate при parse.

### `format(blocks)`

- **Аргументы:** readonly forest detached `EditorBlock[]`.
- **Возвращает:** `PortableBlockFormats { plain; markdown; html }`.
- **Исключения:** formatter/serialization errors.

Children форматируются сначала. Context содержит current block, siblings, index, depth и formatted children. Default HTML escaping предотвращает выполнение block content как raw HTML.

### `parse(data)`

- **Аргументы:** `{ html: string; text: string }`.
- **Возвращает:** result первого matching parser либо `undefined`.
- **Исключения:** parser errors.

## Browser flavors и priority

При copy/cut extension пишет:

1. `RIVTO_CLIPBOARD_MIME` — lossless blocks/links/elements;
2. `text/html`;
3. `text/markdown`;
4. `text/plain`.

При normal paste priority: Rivto MIME → first React parser from HTML/text → core plain-text fallback. Paste-as-plain-text shortcut игнорирует structured flavors и сохраняет multiline text внутри одного block (`preserveNewlines`).

Invalid structured blocks валидируются через core definitions и React list policy. `ClipboardExtensionOptions.onBlockError(block, error)` может вернуть replacement input или nullish value для skip.

## Page mode

Перед operation native DOM selection публикуется в core. Copy/cut сохраняет partial text, whole blocks, hierarchy, props, list state, plugin data и internal links согласно core bundle.

Structured paste относительно active block:

- если collapse behavior active, block expanded и имеет children — вставка идёт первым child;
- иначе вставка идёт sibling после active block;
- text-starting bundle может merge с text selection по core rules.

После paste DOM selection восстанавливается в next animation frame.

## Edgeless block cards

Когда canvas selection active и содержит block cards, extension:

- вычисляет represented root block ranges;
- добавляет selected element frames в bundle;
- временно проецирует cards в core block selection для paste placement;
- paste выполняет `mergeText: false`;
- создаёт новые block elements со смещёнными frames и separators между ranges;
- восстанавливает прежнюю core selection и выбирает новые canvas elements.

Cut удаляет represented block trees и selected card elements одним batch.

## Edgeless visual objects

`edgelessVisualsExtension()` регистрирует capture-phase clipboard handlers раньше generic bubble handler. При active visual/group selection он сериализует visual elements, nested groups, attached internal connectors и represented block cards.

Paste remaps every block/element/link ID, смещает frames на 24 canvas units и выбирает copies. Bundle с visual elements обрабатывается visual extension; generic clipboard handler его больше не получает, потому что event claimed.

Без `edgelessVisualsExtension()` generic clipboard поддерживает blocks/cards, но не знает visual-specific group/connector schemas.

## Document-level fallback

Firefox иногда dispatches clipboard event на body для structural selection. Extension также слушает document realm, но обрабатывает event только если focus принадлежит editor и есть active structural/canvas selection. Это не перехватывает clipboard других editors на странице.
