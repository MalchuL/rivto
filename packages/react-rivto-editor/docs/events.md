# React events and keymaps

`ReactPanelApi` owns an `EventManager` for delegated native DOM events and a
`KeyboardManager` for semantic shortcuts. The keyboard manager registers its
surface/window keydown and keyup transport through the event manager, so both
follow the active surface's browser realm and share event claiming.

Each native dispatch produces an event value for its registered consumers:

```text
EditorEvent
KeyboardEditorEvent
```

The manager—not these values—continues to own registration, ordering,
claiming, and cleanup. Event values are shared unchanged between a
registration's `when` predicate and handler.

## DOM events

Functional extensions can register delegated native behavior directly:

```ts
reactEditor.events.register({
  id: "acme.pointer",
  type: "pointerdown",
  target: "surface",
  scope: "block",
  mode: "block",
  capture: true,
  when: ({ blockId }) => Boolean(blockId),
}, ({ blockId }) => {
  selectBlock(blockId!);
  return true;
});
```

Every registration has a stable ID. Duplicate IDs throw, `delete(id)` removes
one registration, and the returned disposer performs the same cleanup
idempotently. Extension setup rollback and editor destruction also dispose owned
registrations.

`target` chooses where the native listener is attached:

- `surface` (default): the currently rendered page or edgeless surface.
- `document`: the surface's `ownerDocument`.
- `window`: that document's `defaultView`.

`scope` optionally requires the native target to resolve inside a presentation
boundary:

- `surface`: anywhere inside the active surface.
- `block`: inside the nearest `data-block-id` container.
- `content`: inside the nearest editable `data-block-content` host.

Leave `scope` unset for window pointer-move/up listeners that must continue
after the pointer leaves the surface. Document and window are never read from
browser globals, so iframe editors and multiple documents remain isolated.

`EditorEvent` includes the core editor, mode, selection snapshot, `root`,
`insideRoot`, and resolved block/content metadata. Its `raw` property is the
original typed native event. `when(event)` runs immediately before the handler.
Its `inputRoot` supplies focus, browser selection clearing and an attachment
check without passing a browser element to those operations. Event and keyboard
deliveries for the same mounted panel borrow the same capability; detaching or
replacing that registration invalidates it, even when the element is reused.

Returning `true` claims the event, prevents its cancelable native default, and
stops later Rivto handlers. Returning `false` or `undefined` preserves native
behavior. An already prevented native event does not reach later handlers.

React components use the same declarative definition:

```ts
useDOMEvent({
  id: "acme.selection-change",
  type: "selectionchange",
  target: "document",
}, event => {
  console.log(event.raw);
  // The hook retains the latest callback without reconnecting the listener.
});
```

Local wrapper controls should keep ordinary React handlers. Use delegated
block-scoped events only when behavior crosses block instances. DnD libraries
and measurements continue using block element refs; there is no wrapper event
registry.

## Keyboard events

Keyboard registrations describe semantic actions rather than checking keys
inside extensions:

```ts
reactEditor.keyboard.register({
  id: "acme.inspect-key",
  keys: ["Tab"],
  target: "surface",
  scope: "content",
  mode: ["block", "edgeless"],
  when: ({ selection }) => Boolean(selection?.blocks.length),
}, ({ keyboard, reactPanel }) => {
  console.log(keyboard.key, reactPanel.rootBlockId);
  return true;
});
```

Matching is exact. Supported tokens include `Primary`, `Ctrl`, `Meta`, `Alt`,
`Shift`, arrows, `Space`, named keys, and single characters. `Primary` means
Ctrl or Meta, but never both. Registrations default to keydown on the surface.

Several actions may share a shortcut. They run in declaration order; a false
`when` result or handler return lets the next action try. Keyboard actions run
before ordinary delegated DOM registrations for the same bubbling key event.

Composition policies are:

- `ignore` (default): skip during IME composition.
- `handle`: run normally during composition.
- `prevent`: suppress the browser shortcut without executing the action.

`useKeyboardEvent(definition, handler)` provides the same behavior to
React-stateful UI components while retaining their latest callback.
Keyboard handlers receive a separate `KeyboardEditorEvent` with copied keyboard
data, `shortcut` and `phase`. It exposes live target checks without exposing the
native keyboard event or rendered block/content elements. The surface `root`
remains available to existing commands while their browser operations migrate.

The internal event classes and their constructor input types support direct
testing. `EventManager` constructs `EditorEvent` and
the keyboard transport constructs a separate `KeyboardEditorEvent`; semantic
actions such as indent and delete remain handlers. Its temporary constructor
still receives native browser context from the transport.

## Keymap overrides

Initial overrides can be supplied when the React editor is created:

```ts
createReactEditor({
  editor,
  extensions,
  keymap: {
    "block.indent": ["Primary+ArrowRight"],
    "history.redo": [],
  },
});
```

An override replaces a registration's default shortcuts. An empty array
disables it. Unknown IDs stay in `keyboard.list()` as `installed: false` so
typos remain visible. Each extension declares its own default keys beside
`register`; `KEYBOARD_BINDING_IDS` is only a stable ID index. Subscribe with
`keyboard.subscribe` and read `keyboard.revision` for a live inventory.

The active map can be replaced without reinstalling extensions:

```ts
reactEditor.keyboard.replaceKeymap({
  "block.indent": ["Primary+ArrowRight"],
});

reactEditor.keyboard.setKeymapOverride("history.redo", []); // disable
reactEditor.keyboard.setKeymapOverride("history.redo", undefined); // defaults
```

`replaceKeymap` restores declared defaults for omitted IDs.
`setKeymapOverride` changes one ID; an empty array disables it and `undefined`
removes the override. Updates are synchronous and validated before any active
binding changes.
