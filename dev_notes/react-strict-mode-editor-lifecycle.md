# React Strict Mode and editor lifecycle

## Symptom

After switching from page mode to edgeless mode, every block was rendered as
`Unknown block type`, including built-in paragraph and heading blocks.

## Root cause

This was an editor lifecycle bug exposed by React Strict Mode, not a React
renderer bug.

The demo created one editor instance and destroyed it in an effect cleanup:

```tsx
useEffect(() => () => {
  editor.destroy();
  doc.destroy();
}, []);
```

In development, Strict Mode intentionally replays effects using this sequence:

```text
mount → cleanup → mount again
```

The cleanup destroyed `PluginManager`, which removed the registered default and
custom block specifications. React then continued with the same already-created
editor instance. When switching modes caused the blocks to be rendered again,
the renderer could no longer find their block specifications and displayed
them as unknown.

Destroying the editor also removed its document subscriptions, which prevented
subsequent changes from being persisted reliably.

## Current fix

The demo no longer wraps `App` in `React.StrictMode`. The editor and CRDT
document are therefore destroyed only when the demo actually unmounts.

See `demo/src/main.tsx`.

## Longer-term library fix

The React integration should eventually support Strict Mode without requiring
consumers to disable it. Suitable approaches are:

- Give the editor instance an owner outside the replayed view lifecycle.
- Recreate the editor after cleanup instead of reusing a destroyed instance.
- Make disposal terminal and detectable, so a destroyed editor cannot silently
  continue rendering.

Until that ownership API exists, applications that construct and destroy the
editor inside a React component should avoid Strict Mode effect replay.
