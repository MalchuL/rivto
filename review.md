# Deep review plan: `react-rivto-editor` + `demo`

Goal: understand ownership, data flow, and extension boundaries — not every file line-by-line.

Docs to skim first (short, then code):

- `packages/react-rivto-editor/docs/developer-guide.md`
- `docs/managers.md`
- `docs/events.md`
- `docs/selection.md`
- `docs/edgeless-elements.md`

---

## 0. Mental model (lock this first)

```
@chulane/rivto (core)     document: blocks + elements + history + commands
        ↑
createReactEditor         React shell: managers, extensions, surfaces
        ↑
EditorView + surfaces     Page / Edgeless UI
        ↑
demo App                  wires presets, seeds data, custom blocks
```

**Attention**

- Core owns document truth. React owns DOM, gestures, rendering.
- `elements` ≠ `blocks`. Cards are `type: "block"` elements pointing at block id ranges.
- Visuals (shapes/drawings) are opt-in via `edgelessVisualsExtension`, not in `standardPreset`.

---



## 1. Boot path (demo → editor)

**Read in order**

1. `demo/src/main.tsx`
2. `demo/src/App.tsx` — `createDemoEditor`, `createEmptyDemoEditor`, `createFixtureEditor`, `seedEdgelessShowcase`
3. `packages/react-rivto-editor/src/react-editor.tsx` — `createReactEditor`
4. `packages/react-rivto-editor/src/editor-view.tsx` — mounts UI
5. `extensions/built-ins/built-ins.tsx` — `standardPreset()` composition list

**Attention**

- Three factories in App; only some use `edgelessVisualsExtension`.
- Seed uses `editor.execute("edgeless.visual.*")` and `editor.elements.insertElement` for cards — different APIs, different layers.
- `standardPreset` = page + edgeless surface + selection/transform/history/slash/…  
Visual toolbar/controller = separate extension.
- Ask: what dies if you remove each extension from the array?

---



## 2. ReactEditor architecture

**Read**

- `types.ts` — `ReactEditor`, `CreateReactEditorOptions`
- `managers/` — especially:
  - `managers/extensions/` — register/setup/cleanup
  - `managers/events/` — DOM + keyboard dispatch, keymap, priority
  - `managers/surfaces/` — page vs edgeless surface swap
  - `managers/selection/` — DOM selection bridge
  - `managers/blocks/` — block renderer registry
- `hooks/` — `useEditor`, `useEditorRoot`, `useDOMEvent`, `useKeyboardEvent`, `useEditorMode`
- `internal-store.ts` / `editor-context.tsx` — how React gets the editor

**Attention**

- Extensions are the unit of behavior. Almost nothing is “hardcoded in EditorView”.
- Events: `register({ id, type, mode, capture, priority }, handler)` — mode-gated (`page` / `edgeless`).
- Keyboard: same keymap id can have multiple handlers; **priority +** `when` **+ return true** stops the chain.
- Surfaces: one active surface; mode switch remounts surface, not the whole editor.

---



## 3. Blocks rendering (page)

**Read**

- `surfaces/page/`
- `blocks/` — `BlockTree`, block view, markdown
- `extensions/page/` — enter, backspace, indent, navigation, collapse
- `docs/use-block-editing.md`, `docs/markdown-rendering.md`

**Attention**

- Block identity: `data-block-id` in DOM ↔ document block id.
- Create pattern: `insertBlock` returns id → `selection.set` → `focusBlock` DOM.
- ContentEditable vs preview (Markdown): edit mode toggle is critical.
- Slash commands: registration on block type, not global magic.
- Custom demo blocks (`demo/src/blocks/custom-blocks.tsx`): how `blockExtension` plugs renderer + slash.

---



## 4. Edgeless surface (cards, not visuals)

**Read**

- `surfaces/edgeless/edgeless-surface.tsx` — pan/zoom/snap/align, plane transform
- `surfaces/edgeless/edgeless-block.tsx` — card chrome + resize handles
- `surfaces/edgeless/block-elements.ts` — card range from `startBlockId`/`endBlockId`, separators
- `extensions/edgeless/edgeless-runtime.ts` — canvas selection store
- `extensions/edgeless/edgeless-selection.tsx` — click + marquee
- `extensions/edgeless/edgeless-transform.ts` — move/resize + progressive groups
- `extensions/edgeless/edgeless-deletion.ts`, `edgeless-movement.ts`

**Attention**

- Card element props: `{ startBlockId, endBlockId }` — inclusive root range, not “one block”.
- Canvas selection (`EdgelessSelectionRuntime`) ≠ core text/block selection. `deactivate()` vs `clear()`.
- Transform preview: writes inline styles + `data-edgeless-geometry-lock`; React must not wipe them.
- Hit testing: cards = host box; later visuals = stroke-near.
- Progressive groups live in transform pointer-start, not in selection overlay.

---



## 5. Visuals extension (shapes / draw / connectors)

**Read in order**

1. `extensions/edgeless/visuals/index.ts` — mounts controller + layer
2. `controller.ts` — create/update/group/clipboard/tool/defaults/commands
3. `types.ts` — payloads + `EdgelessVisualCommandMap`
4. `visual-layer.tsx` — orchestration, portals
5. Hooks: `use-drawing-gesture.ts`, `use-preset-drag.ts`, `use-visual-tool.ts`
6. Components: `tool-bar`, `creation-panel`, `drawing-capture`, `visual-element`, `visual-properties`, `selection-toolbar`
7. Utils: `geometry.ts` (snap/resize/connectors), `canvas-point.ts`
8. `styles.css` sections for `.edgeless-*` (pointer-events rules matter)

**Attention**

- Public API for apps: `editor.execute("edgeless.visual.create", …)`.
- Internal UI: `controller.create()` — same method, not exported on editor.
- Create always: insert element → `selection.set([id])` → return id.
- Tool state is session-local on controller, not in document snapshot.
- Place/draw/connector gestures ignore returned id; selection drives UI.
- Connector/drawing: host `pointer-events: none`, hit path `pointer-events: stroke`.
- Defaults (`controller.defaults`) are session-only — not synced/persisted.

---



## 6. Commands vs managers vs controller


| Layer                                   | Use for                                      |
| --------------------------------------- | -------------------------------------------- |
| `editor.blocks.*` / `editor.elements.*` | Raw document CRUD                            |
| `editor.execute(name, payload)`         | Named behaviors (history-aware when wrapped) |
| `EdgelessVisualController`              | Visual domain inside React extension         |
| Event/keyboard managers                 | Input routing                                |


**Attention**

- Controllers register commands in constructor; destroy unregisters.
- Demo seeding mixes: cards via `elements.insertElement`, visuals via `execute`.
- Ask for each call site: who owns defaults, selection side effects, undo?

---



## 7. Selection (deep)

**Read**

- `docs/selection.md`
- Core selection usage from page extensions
- `edgeless-runtime.ts` + `edgeless-selection.tsx` + transform selection rewrite
- Text/block selection deactivating edgeless runtime

**Attention**

- Three selections can coexist conceptually: text, block, edgeless element ids.
- Entering card content: edgeless `deactivate()` (keeps ids, hides chrome).
- Multi-select: Ctrl/Cmd toggle; transform won’t start move on primary.
- Marquee uses AABB of hosts (drawings/connectors by frame, not stroke).

---



## 8. Demo-specific layer

**Read**

- `demo/src/App.tsx` journal UI, mode toggle, undo, block-id visibility
- `demo/src/extensions/block-id.tsx` — wrapper pattern
- `demo/src/blocks/custom-blocks.tsx`
- `demo/KEYMAP.md`

**Attention**

- Demo shows **host patterns**: wrappers, custom blocks, keymap overrides, seeding.
- Fixture editors (`?conflict=`) are a separate code path — incomplete vs main demo.
- Block id wrapper: `surfaces.registerBlockWrapper` — see `docs/block-wrappers.md`.

---



## 9. Cross-cutting CSS / hit testing

**Read** `packages/react-rivto-editor/styles.css` with search for:

- `.edgeless-viewport`, `.edgeless-plane`
- `.edgeless-card`, `.edgeless-visual`
- `.edgeless-connector-hit`, `.edgeless-drawing-hit`
- `.edgeless-drawing-capture`
- tool bar / properties z-index

**Attention**

- Plane `transform: translate + scale` → all canvas coords vs `canvasPoint` / zoom.
- Stacking: capture layer when tool active vs object hits in select mode.
- Geometry lock + React style reconciliation bug class (resize).

---



## 10. Verification loops (do these while reading)

For each subsystem, answer:

1. **Who creates state?** (core insert / controller / gesture)
2. **Who holds the id afterward?** (return value / selection / DOM)
3. **What re-renders?** (document subscribe / selection store / local React state)
4. **What handles the next pointer event?** (which `register` id, capture?, mode?)
5. **What happens on Escape?** (gesture cancel → tool select → selection clear — priorities)

Concrete traces to walk:

- Enter in page → new block id → focus  
- Edgeless: click Shapes → place → rubber-band → create → selected  
- Resize NW on card → mid-drag zoom → geometry lock  
- Click drawing empty bbox vs stroke  
- Group two shapes → progressive click into child

---



## 11. Suggested order (1–2 day deep pass)


| Pass | Focus                         | Done when you can explain…             |
| ---- | ----------------------------- | -------------------------------------- |
| A    | Boot + `standardPreset`       | Extension list and each responsibility |
| B    | Events/keyboard managers      | Why Escape does 3 different things     |
| C    | Page blocks + Enter/Backspace | Id return → selection → focus          |
| D    | Edgeless cards + transform    | Element vs block, preview lock         |
| E    | Visuals controller + gestures | execute vs controller.create           |
| F    | Selection matrix              | text/block/edgeless interactions       |
| G    | Demo customs                  | wrappers, seed, fixture vs main        |


---



## 12. Files you can skip initially

- Large pure geometry tests until after `geometry.ts` API  
- Slash UI chrome details until block registry is clear  
- Conflict fixture UI until main journal path is clear  
- Markdown tokenization internals until edit/preview toggle is clear

---



## One-line north star

**Document mutations go through core; React extensions translate input → commands/mutations and project document → DOM; demo only composes extensions and seeds examples.**

---



# Quiz pack (tricky)

Use after each pass. Answers at the bottom — don’t peek.

---



## A. Boot / presets / demo

**A1.** You remove `edgelessVisualsExtension` from `createDemoEditor` only. Does `seedEdgelessShowcase` still succeed?

**A2.** `createFixtureEditor` has no visuals extension. You open `?conflict=block`. Do block cards still move/resize on the edgeless canvas?

**A3.** Why can `editor.elements.insertElement({ type: "block", ... })` work without `edgelessVisualsExtension`, but `editor.execute("edgeless.visual.create", { kind: "rectangle" })` cannot?

**A4.** Demo seeds cards with explicit `id: listId` on the element. Visual seed uses `execute` and does not pass ids. Who assigns visual ids?

---



## B. ReactEditor / managers / events

**B1.** Two keyboard handlers bind Escape. One returns `true`, one would clear selection. What decides which runs, and does the second run?

**B2.** A `pointerdown` handler is registered with `mode: "edgeless"`. User is in page mode. Does the handler run if the event hits the editor root?

**B3.** `useDOMEvent` in a component vs `reactEditor.events.register` in extension `setup` — what differs on surface/mode remount / extension destroy?

**B4.** Extension `setup` returns a cleanup. Who calls it, and in what order relative to other extensions in `standardPreset`?

---



## C. Blocks (page)

**C1.** `insertBlock({ type, content })` without `id`. What is the return value used for immediately after Enter-split?

**C2.** You insert a block but never call `selection.set` / `focusBlock`. Is the block in the document? Is the caret there?

**C3.** In edgeless mode, Enter on a **root** card block may patch `endBlockId` on a block element. Why is that needed immediately (not only via reconciler later)?

**C4.** Custom demo counter block: is its state in block `content`, `props`, or React-only state? What survives dump/load?

---



## D. Edgeless cards / transform

**D1.** A card element has `startBlockId === endBlockId`. Can it still show nested children of that root?

**D2.** Mid NW-resize, React re-renders the card. Inline `left/top/width/height` were set by transform. What goes wrong if the React `style` prop becomes `{ zIndex }` only?

**D3.** Progressive group: first click on a child selects the group; second selects the child. Where is that rewrite implemented — selection overlay or transform?

**D4.** Marquee intersects a drawing’s large empty frame but not the ink. Is the drawing selected? Why might that differ from a single click on the same empty pixel?

**D5.** `deactivate()` vs `clear()` on edgeless selection — which does entering text edit inside a card use, and what remains in `items`?

---



## E. Visuals controller / gestures

**E1.** Gesture code calls `controller.create(...)` and ignores the return value. How does the new shape appear selected?

**E2.** App code only has `editor`. Can it call `controller.create`? What’s the supported equivalent?

**E3.** Session default fill is changed in the shapes popover. User reloads from snapshot. Does the new fill persist?

**E4.** Place tool active; user Escape while rubber-banding. Does the tool become `select`? What about a second Escape?

**E5.** `standardPreset` includes edgeless transform. Visual layer unmounted. Can you still resize a leftover `rectangle` element in the document?

---



## F. Hit testing / CSS

**F1.** Drawing host has `pointer-events: none`; hit path has `pointer-events: stroke`. Click empty bbox over a block card. What receives the event?

**F2.** Connector selected uses no CSS outline on the host; drawing selected does. Why the asymmetry?

**F3.** `.edgeless-drawing-capture[data-active]` has huge z-index. In Select tool, is capture receiving clicks?

---



## G. Commands / layers

**G1.** Rank these by “knows about rectangle fill defaults”:  
`elements.insertElement` · `controller.create` · `execute("edgeless.visual.create")`

**G2.** `execute("edgeless.selection.group")` return type is `string`. What is that string? What does selection contain after?

**G3.** History: is every `elements.updateElement` during connector normalize always a user-undoable step? What should you check in controller?

---



# Answers



## A

**A1.** No — `edgeless.visual.create` won’t be registered; seed throws (unless guarded).  
**A2.** Yes — cards/transform come from `standardPreset`.  
**A3.** Block cards are core elements + surface renderer; visual create is registered only by the visuals controller.  
**A4.** `elements.insertElement` → `input.id ?? crypto.randomUUID()`.

## B

**B1.** Higher `priority` first; `return true` stops dispatch — second does not run.  
**B2.** No — mode filter skips it.  
**B3.** Extension register lives for editor lifetime (until cleanup); component hook ties to mount. Surface remount can drop component listeners.  
**B4.** Preset `setup` collects cleanups; destroy runs them **reverse** order.

## C

**C1.** New block id → `selection.set` text range + `focusBlock`.  
**C2.** In document yes; caret/focus no.  
**C3.** Avoid one frame where the new root is outside the card range before async normalize.  
**C4.** Typically `props` (and registration); React-only state does not survive dump/load.

## D

**D1.** Yes — range is roots; children render via block tree inside that root.  
**D2.** React clears inline geometry → card jumps; next move rewrites styles.  
**D3.** `registerEdgelessTransform` pointer-start (not overlay alone).  
**D4.** Marquee: yes (AABB). Click: no (stroke-only hit).  
**D5.** `deactivate()` — `items` kept, `active` false, chrome off.

## E

**E1.** `create` ends with `selection.set([id])`.  
**E2.** No public controller; use `editor.execute("edgeless.visual.create", payload)`.  
**E3.** No — session defaults, not snapshot.  
**E4.** First Escape cancels gesture (tool stays place); second (no gesture) → tool select (and related Escape handlers by priority).  
**E5.** Element exists in data, but without VisualLayer there’s no visual chrome/renderer — you don’t get a normal shape UI to resize.

## F

**F1.** Whatever is under (e.g. card/content), not the drawing.  
**F2.** Connector bbox is misleading; selection feedback is on stroke. Drawing still uses host bbox outline by design.  
**F3.** No — `data-active` only when tool ≠ select/pan (capture inactive / pointer-events none by default).

## G

**G1.** `insertElement` no · `controller.create` / `execute(create)` yes (same path).  
**G2.** New group element id; selection becomes `[groupId]`.  
**G3.** Not necessarily — check whether normalize runs inside history batch / `reconciling` / silent updates; don’t assume every document write = undo step.

---

**How to use:** after each theme in the review plan, do the quiz closed-book; for any miss, re-read only the 1–2 files that own that behavior before continuing.