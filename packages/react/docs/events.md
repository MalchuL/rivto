# React events and keymaps

`ReactEditor` owns one event object:

```text
EditorEvent
  └─ DOMEditorEvents
       └─ KeyboardEditorEvents
```

The public `reactEditor.events` value is `KeyboardEditorEvents`, so the same
ordered runtime handles ordinary DOM events and semantic keyboard actions.
There is no second keyboard manager.

## DOM events

Register native events from a functional plugin:

```ts
const plugin = {
  id: "acme.pointer",
  setup(reactEditor) {
    reactEditor.events.on("pointerdown", ({ blockId, insideRoot }) => {
      if (!insideRoot || !blockId) return false;
      return true;
    }, {
      target: "root",
      mode: "block",
      capture: true,
      passive: false,
    });
  },
};
```

`target` is `root` by default and may also be `document` or `window`. Document
and window are taken from the active root's `ownerDocument`, not global browser
objects. Replacing the surface root disconnects the old realm before connecting
the new one.

Context contains the core editor, mode, selection snapshot, root, native event,
`insideRoot`, and resolved block/content markers. Events outside the root never
receive Rivto block metadata.

A handler returns `true` to claim the event. The runtime calls
`preventDefault()` and skips later Rivto handlers. `false` or `undefined`
preserves native behavior and permits fallthrough. A natively prevented event
does not enter later Rivto handlers.

React components use `useDOMEvent`. It keeps the latest callback in a ref, so a
render does not reconnect the native listener.

## Keyboard bindings

Keyboard plugins declare which shortcuts invoke a semantic action:

```ts
reactEditor.events.bind({
  id: "block.indent",
  keys: ["Tab"],
  mode: ["block", "edgeless"],
  phase: "keydown",
  when: ({ selection, contentElement }) =>
    selection.length > 0 && Boolean(contentElement),
}, ({ editor }) => {
  editor.indentBlock(/* selected block */);
  return true;
});
```

Matching is exact. Supported tokens include `Primary`, `Ctrl`, `Meta`, `Alt`,
`Shift`, arrows, `Space`, named keys, and single characters. `Primary` means
Ctrl or Meta, but never both. A binding defaults to keydown on the root.

Composition policy is:

- `ignore` (default): skip the binding while IME composition is active.
- `handle`: run the action normally.
- `prevent`: suppress the browser shortcut without running the action. History
  uses this to prevent native contenteditable undo during composition.

Several actions may share one shortcut. They run in plugin declaration order;
a false `when` predicate or false handler result lets the next action try it.
For example, Backspace tries selection deletion, nested outdent, root merge,
empty custom-block reset, and finally native deletion.

React components use `useKeyboardEvent`, which also keeps the latest condition
and callback without reinstalling the binding.

## Keymap overrides

Overrides are fixed when the React editor is created:

```ts
createReactEditor({
  editor,
  plugins,
  keymap: {
    "block.indent": ["Primary+ArrowRight"],
    "history.redo": [],
  },
});
```

An override replaces every default shortcut for that binding ID. An empty
array disables it. Unknown IDs do nothing. Duplicate registered IDs throw
immediately, and plugin setup rolls back registrations it already made.

`KEYBOARD_BINDING_IDS` and `BUILTIN_KEYMAP` are exported for discoverability.
The complete demo mapping is listed in [`demo/KEYMAP.md`](../../../demo/KEYMAP.md).
