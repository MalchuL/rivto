# How to review the Rivto React code

Use several small passes instead of trying to understand and judge every line
at once. Each pass answers one question and produces a short list of findings.

## Before you start

Review one feature or behavior at a time. Write down:

- the user action being reviewed;
- the expected visible result;
- the files changed by the patch;
- the core editor operations the React code is expected to call.

For example: “Pressing Enter in a page block creates one sibling, moves the
caret, and can be undone in one step.” This sentence is the review boundary.
Anything unrelated can wait for another review.

If comments have already been added to the source, first turn them into a
scratch list. Give each comment one label:

- **question** — the behavior or reason is not understood yet;
- **bug** — a concrete input produces the wrong result;
- **risk** — lifecycle, browser, or concurrent-update behavior needs proof;
- **cleanup** — readability only, with no behavior change.

Do not fix comments while reading. Verify them during the passes below. Remove
questions that the code answers, and report only reproducible bugs or risks
with a clear failure scenario.

## Step 1: Establish the public behavior

Start at the feature's public entry point, not at a helper in the middle:

1. Read `demo/src/App.tsx` to see how the core and React runtimes are created.
2. Read the relevant export in `packages/react/src/index.ts` or
   `packages/react/src/extensions.ts`.
3. Find the extension that installs the behavior in
   `packages/react/src/extensions/built-ins.tsx`.
4. Read an existing test for the feature before reading its implementation.

At the end of this pass, be able to state what callers provide, what users see,
and who destroys any runtime object or registration.

## Step 2: Trace one path end to end

Follow one real interaction in both directions:

```text
browser event
  -> extension event registration
  -> core editor command or operation
  -> document/selection/mode update
  -> revision subscription
  -> React render or DOM reconciliation
```

Search by the event registration ID, command name, or editor method. Do not
read every file in a directory. Open only the next caller or callee in this
chain.

For rendering, use this path:

```text
EditorView
  -> active surface
  -> block hook
  -> renderer
  -> BlockView DOM boundary
  -> child blocks
```

Useful files, in order, are:

1. `packages/react/src/react-editor.tsx`
2. `packages/react/src/editor-view.tsx`
3. `packages/react/src/extensions/built-ins.tsx`
4. the relevant file in `packages/react/src/extensions/`
5. the relevant hook in `packages/react/src/hooks/`
6. the active surface in `packages/react/src/surfaces/`
7. the manager used by the feature in `packages/react/src/managers/`

Stop when the path reaches a core API in `src/editor/`. Review core storage only
if the proposed change also alters persisted data or a core operation.

## Step 3: Check ownership and state

For every value that can change, ask who owns it:

| Kind of state | Expected owner |
| --- | --- |
| Document, block tree, history, portable selection, mode | Core editor |
| Renderer, surface, event, and extension registrations | React runtime manager |
| Open popup, hover, drag preview, temporary gesture state | React component/extension |
| Editable text and painted caret during native editing | Browser DOM |

Flag duplicated state unless there is a synchronization rule explaining why it
must exist. In particular:

- detached block snapshots are read-only;
- callbacks that need current data should use an editor getter rather than an
  old rendered snapshot;
- React code must not import native Yjs;
- core `src/` code must not import React, React DOM, or `@dnd-kit`;
- multiple core mutations that form one user action should use
  `editor.batchUpdates` when they must be one collaborative update/undo step.

## Step 4: Review React correctness

Check components and hooks in this order:

1. Hooks are unconditional and always run in the same order.
2. Render is pure: it does not register handlers, mutate snapshots, update the
   DOM, or call editor mutations.
3. Effects synchronize with an external system. Derived values stay in render
   and event-driven mutations stay in handlers.
4. Every subscription, native listener, timer, and registration has cleanup.
5. Setup and cleanup remain safe when React Strict Mode mounts, cleans up, and
   mounts again.
6. Dependency arrays include every changing value used by the effect or
   callback. Stable editor/manager objects do not need copied React state.
7. `useMemo` and `useCallback` exist for identity or measured work, not by
   default.
8. Lists use stable domain IDs as keys. Index keys are acceptable only for a
   truly static list with no item identity.

For external stores, verify that `subscribe` returns an unsubscribe function
and that `getSnapshot` is stable until the store changes. A mutation must
advance the revision observed by the consumer.

## Step 5: Review editor-specific browser behavior

React editor bugs often live at the browser boundary rather than in JSX.
Check the relevant section only.

### `contentEditable` and IME

- The browser owns editable text while the user types; React children must not
  overwrite it on every render.
- `onInput` persists plain text through the editor API.
- External, undo, and remote updates reconcile without resetting a valid caret.
- Composition is not committed midway through IME input.
- Interactive children opt out of parent text-selection behavior.

### Events

- Local controls use ordinary React handlers; editor-wide behavior uses the
  delegated event manager.
- A handler returns `true` only when it handled the event.
- Claimed events do not continue into later editor handlers or browser default
  behavior.
- Keyboard behavior accounts for mode, target, selection, and composition.
- Listener registration and removal use the same target, type, and phase.

### Selection

- Core selection contains portable block IDs and text offsets; DOM selection
  contains nodes and ranges. Neither representation is stored as the other.
- DOM nodes are treated as replaceable after a React render.
- Selection is restored after structural commands only when the target still
  exists.
- Page and edgeless mode share core selection without rewriting it.

### Extension lifecycle

- Extension IDs and event IDs are stable and unique.
- Setup failure rolls back earlier registrations.
- Disposers are idempotent and teardown happens in reverse order.
- `ReactEditor.destroy()` does not destroy the host-owned core editor.

## Step 6: Test the smallest useful surface

Run cheap checks first from the repository root:

```sh
pnpm --filter @chulane/rivto-react check-types
pnpm --filter @chulane/rivto-react lint
pnpm --filter @chulane/rivto-react test
```

Then run the broader checks when the change crosses package boundaries:

```sh
pnpm check-types
pnpm lint
pnpm test
pnpm demo:build
```

Use `pnpm demo` for caret, focus, drag, clipboard, keyboard, IME, and mode-switch
behavior. Add or run `pnpm test:e2e` when correctness depends on a real browser.
A DOM mock passing is not enough evidence for geometry, selection, or native
editing behavior.

Test the failure scenario, not the implementation detail. Prefer one focused
regression test that fails before the fix. Also exercise cleanup/remount for
subscription or registration changes and undo/redo for document mutations.

## Step 7: Write actionable findings

A useful finding contains four parts:

```text
[severity] file:line - condition -> incorrect result; expected result.
```

Illustrative example (not a finding in the current code):

```text
[high] page-enter.ts:74 - during IME composition, Enter reaches the block-create
handler -> a sibling is inserted before composition finishes; ignore composed
keydown events.
```

Before posting a finding, confirm:

- there is a reachable input or state that triggers it;
- the cited line is the cause, not merely where the symptom appears;
- an existing guard or cleanup elsewhere does not already handle it;
- the expected behavior follows from a test, public API, browser behavior, or
  documented invariant;
- severity reflects user impact, not how unusual the code looks.

Keep questions separate from defects. Do not block a review on naming,
formatting, or optional refactors when lint passes and behavior is clear.

## Step 8: Finish the review

1. Revisit every source comment from the initial scratch list.
2. Delete comments that were answered by tracing the code.
3. Convert verified bugs and risks into findings with a scenario and expected
   result.
4. Move useful permanent explanations to the nearest invariant or public API;
   do not leave a conversation embedded in source code.
5. Summarize what was traced and which checks ran.

A review is complete when the bounded user behavior has been traced, relevant
ownership and browser boundaries have been checked, and every reported problem
is reproducible. Understanding every file in the package is not required.

## Quick checklist

- [ ] I defined one user behavior and kept the review inside that boundary.
- [ ] I traced event -> core mutation -> subscription -> rendered result.
- [ ] Each changing value has one clear owner.
- [ ] Render is pure; effects and registrations clean up correctly.
- [ ] Strict Mode, stale callbacks, and external-store snapshots are safe.
- [ ] Relevant contentEditable, IME, event, and selection cases are covered.
- [ ] The narrow type, lint, and test checks pass.
- [ ] Each finding has a trigger, impact, expected result, and source location.
- [ ] Questions and style preferences are not reported as bugs.
