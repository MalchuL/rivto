# Repository Guidelines

## Structure and Ownership

The pnpm workspace has two editor packages:

- `packages/rivto-editor-core/` owns canonical document state and framework-neutral behavior: CRDT storage, blocks, links, elements, commands, selection, clipboard, snapshots, mode, and undo.
- `packages/react-rivto-editor/` owns presentation and browser behavior: renderers, hooks, DOM events/selection, page and edgeless surfaces, keyboard handling, slash commands, and extensions.

Use `demo/` for integration, `e2e/` for Playwright, and `docs/` or `dev_notes/` for guidance. Keep native `yjs` imports inside core `src/store/crdt-doc/yjs-doc/`.

## Choosing Where to Change Code

Recent development follows this stable pipeline:

```text
document invariant → core store → core public manager/editor
browser interaction → React extension → React manager/surface
cross-layer behavior → demo → E2E
```

- Change persisted shapes, validation, hierarchy, or transactions in core `src/store/document-model/core/`.
- Expose user operations through the focused core manager in `src/managers/`; avoid editor forwarding methods.
- Put optional interaction behavior in React `src/extensions/`.
- Put registries and lifecycle ownership in React `src/managers/`, block presentation in `src/blocks/` and `src/hooks/`, and layout containers in `src/surfaces/`.

Slash commands belong to React. IDs remain stable except when creating entities or resolving collisions.

## Solving Changes Safely

1. Reproduce with the narrowest existing test.
2. Find the symbol and every caller with `rg`.
3. Trace the complete path before editing: storage → public operation → React consumer → integration test.
4. Fix the shared owner rather than individual callers.
5. Add a colocated regression test; use Playwright only for browser or cross-layer behavior.

For persisted fields, verify snapshots, clipboard, undo, and rendering. For selection, navigation, clipboard, or hierarchy changes, verify page and edgeless modes. Mutations remain transactional and go through managers. React extensions register in `setup` and clean up on destruction.

## Commands and Tests

- `pnpm demo` — run the demo.
- `pnpm build`, `pnpm check-types`, `pnpm lint` — build and statically validate the workspace.
- `pnpm test` — run core Jest tests.
- `pnpm --filter @chulane/rivto-react test` — run React Jest tests.
- `pnpm test:e2e` — run Playwright.

Use `*.test.ts(x)` for Jest and `*.spec.ts` for Playwright. Run focused tests first, then type checks, lint, affected suites, and build for export changes.

## Style and Reviews

Use ES modules and nearby formatting. Use `PascalCase` for types/components, `camelCase` for functions/values, and kebab-case directories. Public editor/document APIs need JSDoc. Prefer existing managers and narrow types.

Keep commits focused and imperative. Pull requests state the problem, solution, validation, and API/UI impact.
