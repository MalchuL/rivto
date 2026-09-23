# Repository Guidelines

## Structure and Ownership

The main editor layers are:

- `packages/crdt-doc/` owns adapter-neutral CRDT contracts and the Yjs adapter (`YjsDoc`, providers, wrappers). Keep native `yjs` imports inside `packages/crdt-doc/src/yjs-doc/`.
- `packages/document-model/` owns canonical persisted document invariants: blocks, elements, plugin data, snapshots, and hierarchy.
- `packages/rivto-editor-core/` owns framework-neutral editor behavior: commands, selection, clipboard, snapshots, mode, and undo.
- `packages/react-rivto-editor/` owns presentation and browser behavior: renderers, hooks, DOM events/selection, page and edgeless surfaces, keyboard handling, slash commands, and extensions.

Use `demo/` for integration, `e2e/` for Playwright, and `docs/` or `dev_notes/` for guidance.

## Choosing Where to Change Code

- Change persisted shapes, validation, hierarchy, or transactions in `packages/document-model/src/core/`.
- Expose user operations through the focused core manager in `src/managers/`; avoid editor forwarding methods.
- Put optional interaction behavior in React `src/extensions/`.
- Put registries and lifecycle ownership in React `src/managers/`, block presentation in `src/blocks/` and `src/hooks/`, and layout containers in `src/surfaces/`.

Slash commands belong to React. IDs remain stable except when creating entities or resolving collisions.

## Solving Changes Safely

Inspect the code path and callers relevant to the change. Fix shared behavior in its owning layer. For bugs, reproduce the failure when practical and leave a focused regression check for behavior that could recur. Use Playwright when browser interaction or cross-layer integration is essential to the assertion.

For persisted fields, consider snapshots, clipboard, undo, and rendering. For selection, navigation, clipboard, or hierarchy changes, check page and edgeless modes where affected. Mutations remain transactional and go through managers. React extensions register in `setup` and clean up on destruction.

Breaking changes are allowed, including changes that affect schemas or previously saved data. Backward compatibility and data migrations are not required unless explicitly requested.

## Commands and Tests

- `pnpm demo` — run the demo.
- `pnpm build`, `pnpm check-types`, `pnpm lint` — build and statically validate the workspace.
- `pnpm test` — run core Jest tests.
- `pnpm --filter @chulane/rivto-react test` — run React Jest tests.
- `pnpm test:e2e` — run Playwright.

Use `*.test.ts(x)` for Jest and `*.spec.ts` for Playwright. Run checks proportionate to the change; use focused tests first and build when exports or packaging change. Run relevant local checks and fix failures caused by the requested change without asking for approval at each step.

## Style and Reviews

Use ES modules and nearby formatting. Use `PascalCase` for types/components, `camelCase` for functions/values, and kebab-case directories. Prefer existing managers and narrow types.

Document public APIs and non-obvious invariants. Use comments to explain tricky algorithms and edge cases; avoid restating straightforward code. Define repeated or cross-file HTML class names once in the narrowest owning scope.

Keep commits focused and imperative. Pull requests state the problem, solution, validation, and API/UI impact.
