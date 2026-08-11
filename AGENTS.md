# Repository Guidelines

## Project Structure & Module Organization

This TypeScript monorepo uses pnpm 11. `packages/rivto-editor-core/src` implements `@chulane/rivto`; `packages/react-rivto-editor/src` implements `@chulane/rivto-react`.

`demo/src` is the Vite integration playground; browser scenarios live in `e2e/`. Tests are colocated as `*.test.ts(x)` or under `__tests__/`. Put architecture notes in `docs/`, `dev_notes/`, or package `docs/`. Never edit generated `dist/`, `test-results/`, or `node_modules/` content.

## Package Boundaries

Core owns the Yjs-backed `DocumentModel`, CRDT adapters, blocks, links, elements, commands, snapshots, selection, clipboard, mode, and undo. Keep it framework-neutral: no React, JSX, DOM APIs, or presentation-specific features. Native Yjs imports belong only under `store/crdt-doc/yjs-doc`; other core code uses adapter interfaces. Persisted format changes require snapshot validation and round-trip tests.

React owns renderers, hooks, page/edgeless surfaces, DOM selection, browser events, keyboard mappings, slash commands, and extensions. It presents a core editor and must not duplicate canonical document state. Add optional behavior through `ReactEditorExtension`; register resources during `setup` and release them during cleanup. Destroy React runtime before core runtime.

## Build, Test, and Development Commands

- `pnpm demo` starts the Vite demo from package source.
- `pnpm build` builds core, then React.
- `pnpm check-types` checks core, React, and demo TypeScript.
- `pnpm lint` runs ESLint with zero warnings allowed.
- `pnpm test` runs core Jest tests.
- `pnpm --filter @chulane/rivto-react test` runs React Jest tests.
- `pnpm test:e2e` builds the demo and runs Playwright in Chromium and Firefox.
- `pnpm --dir app dev` starts the product app; `pnpm --dir app check-types` checks it.

## Coding Style & Naming Conventions

Use TypeScript/TSX, ES modules, two-space indentation, double quotes, semicolons, and trailing commas. Use `PascalCase` for classes/components/types, `camelCase` for functions/values, and kebab-case directories such as `clipboard-manager`. Public editor and document APIs require concise JSDoc. Prefer narrow types to `any`.

## Testing Guidelines

Use Jest for packages and Playwright for browser behavior. Add the smallest regression test beside the affected module. Name tests `feature.test.ts(x)` and E2E files `feature.spec.ts`. There is no numeric coverage gate; exercise new branches and interactions. Run focused tests first, then type checks, lint, and relevant full suites.

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries such as `Update docs` and `Fix clipboard to keep same ids`. Keep commits focused and explain behavior, not implementation trivia. Pull requests should include a concise problem/solution summary, validation commands, linked issues when applicable, and screenshots or recordings for UI changes. Call out schema, clipboard, selection, or compatibility changes explicitly.
