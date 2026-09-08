# Edgeless surface и visual objects

## Базовая edgeless surface

`standardPreset()` уже регистрирует `edgelessSurfaceExtension()`. Mode переключается локально:

```tsx
const { setMode } = useEditorMode();
setMode("edgeless");
```

Root blocks проецируются в first-class elements type `"block"`. Один block card может содержать range соседних root blocks; separator partitions ranges. Frame и z-index сохраняются в core elements snapshot.

### `EdgelessSurfaceOptions`

- **`snapping?: EdgelessSnappingStore`:** host-owned observable settings.
- **`avoidBlockElementOverlap?: boolean`:** default `true` для новых cards.
- **`blockElementWidth?: number`:** new card width; default page width `720`.

### `EdgelessSnappingStore`

`constructor(initial?)` принимает partial `{ snapToGrid; alignObjects }`, defaults оба `true`.

- `getSnapshot()` → current stable `EdgelessSnappingSnapshot`; не throws.
- `subscribe(listener)` → unsubscribe; listener errors propagate при set.
- `set(patch)` → `void`; одинаковое effective state не уведомляет.

Store допускает несколько distinct listeners, не заменяя предыдущие. Одинаковая function reference хранится в `Set` один раз; returned cleanup удаляет её и безопасен повторно. Immediate callback отсутствует: external-store consumer отдельно вызывает `getSnapshot()`. Один effective `set()` вызывает каждый listener один раз.

Persistence этих UI preferences принадлежит host и не входит в document snapshot.

### `EdgelessSelectionRuntime.subscribe(listener)`

Runtime предоставляет один local canvas-selection stream. Можно подписать несколько distinct callbacks; новая подписка не override-ит старые. Одинаковая function reference имеет одну effective registration, unsubscribe idempotent, immediate callback отсутствует. После notification snapshot читается через `snapshot()`/`get()`. `destroy()` очищает всех listeners.

### `EdgelessVisualController.subscribe(listener)`

Controller предоставляет один visual/tool revision stream для toolbar и visual layer. Несколько distinct listeners сосуществуют; одинаковая function reference deduplicate-ится `Set`. Returned disposer удаляет exact function и безопасен повторно. Initial notification отсутствует: consumer читает `getRevision()` и соответствующие getters. Document updates и effective tool/default/preview changes вызывают stream; `destroy()` очищает listeners.

## Visual objects extension

Shapes/text/stickers/drawings/connectors подключаются отдельно:

```ts
const visuals = edgelessVisualsExtension({
  toolbar: true,
  orphanConnectors: "detach",
  fonts: [{ label: "Editorial", fontFamily: "Georgia, serif" }],
  stickers: [{ id: "mint", label: "Mint", fill: "#d3f9d8" }],
});

const reactEditor = createReactEditor({
  editor,
  extensions: [standardPreset(), visuals],
});
```

`EdgelessVisualsOptions`: `fonts`, `stickers`, `orphanConnectors: "detach" | "delete"`, `toolbar?: boolean`.

## Creation API

Каждый method возвращает stable element ID и throws, если extension ещё не установлена либо payload invalid:

- `create(payload: CreateVisualPayload): string`;
- `createSticker(payload?): string`;
- `createRectangle(payload?): string`;
- `createEllipse(payload?): string`;
- `createText(payload?): string`;
- `createDrawing({ frame, points, ... }): string`;
- `createConnector({ source, target, ... }): string`.

```ts
const rectangle = visuals.createRectangle({
  frame: { x: 60, y: 60, width: 160, height: 100 },
  fill: "#d0ebff",
  stroke: "#1c7ed6",
  text: "Node",
});
```

## Selection и transformations

- `getSelection()` → detached `{ active: boolean; items: readonly EdgelessSelectionRef[] }`.
- `select(items)` → `void`; заменяет selection, throws для missing/non-string element ID.
- `clearSelection()` → `void`.
- `duplicateSelection()` → IDs копий.
- `deleteSelection()` → `void`.
- `move(dx, dy)` → `void`.
- `resize(width, height)` → `void`; требует positive geometry.
- `group()` → group ID; throws, если выбрано меньше двух objects или они не имеют общего parent.
- `ungroup()` → `void`.
- `align("left" | "center" | "right" | "top" | "middle" | "bottom")` → `void`.
- `distribute("horizontal" | "vertical")` → `void`; meaningful для трёх и более objects.
- `reorder("front" | "forward" | "backward" | "back")` → `void`.
- `setTool(tool | "select")` → `void`.
- `update({ id, patch })` → `void`; ID/kind сохраняются.

Все mutation errors из validation/core element manager передаются caller. Transformations используют one core batch/history boundary там, где меняют несколько elements.

## Connectors и groups

`ConnectorEndpoint` может ссылаться на element ID с relative anchor и fallback position. При удалении target extension либо detaches endpoint, либо удаляет connector по `orphanConnectors` policy. Groups — first-class elements со ссылками на child selection refs; normalization удаляет stale membership и предотвращает invalid nesting.

## Demo reference

`demo/src/App.tsx` создаёт rectangle, ellipse, sticker, drawing, free text, connectors и nested group через тот же public imperative object `visuals`. Это хороший seed pattern: extension instance создаётся до `createReactEditor()`, передаётся в extensions, затем используется после setup.
