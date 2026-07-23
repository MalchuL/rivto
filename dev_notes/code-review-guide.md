# How to review the Rivto editor code

Review from the public composition inward:

1. `demo/src/App.tsx` — core creation, functional plugin list, custom block
   registration, mode toolbar, and lifecycle.
2. `packages/react/src/react-editor.tsx` — plugin setup/rollback, surfaces,
   renderer registration, providers, and destruction.
3. `packages/react/src/events.ts` and `keyboard-events.ts` — delegated event
   ordering, root replacement, mode filtering, and shortcut matching.
4. `packages/react/src/plugin-factories.tsx` — semantic built-in plugins and
   their mode ownership.
5. `packages/react/src/surfaces/**` — page traversal versus edgeless root-card
   layout; both reuse the same block renderers.
6. `src/editor/rivto-editor.ts` — framework-neutral commands and runtime state.
7. `src/store/document-model/**`, then `src/store/crdt-doc/**` — collaborative
   mutation and adapter boundaries.

Useful invariants:

- Nothing under `src/` imports React, React DOM, or `@dnd-kit`.
- React code does not import native Yjs.
- A custom block uses one `registerBlock` call.
- Plugins are factories in `createReactEditor`, not JSX children.
- Plugin setup is ordered, failure is atomic, and cleanup is reversed.
- Later event handlers do not run after an earlier handler prevents default.
- Page and Edgeless switch presentation without rewriting persisted blocks.

Run `pnpm check-types`, React package tests, demo tests/build, and both browser
projects before accepting interaction changes.
