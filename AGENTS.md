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

For every feature implementation or bug fix, read
[rivto-performance-testing](.agents/skills/rivto-performance-testing/SKILL.md)
when choosing tests and execute its verification workflow after the final code
change, before reporting completion. This is mandatory even when the user does
not explicitly request tests or performance checks. Follow the file directly if
the skill is not listed in the session's skill catalog. Report any blocked or
failing checks; do not describe unverified work as fully validated.

- `pnpm demo` — run the demo.
- `pnpm build`, `pnpm check-types`, `pnpm lint` — build and statically validate the workspace.
- `pnpm test` — run core Jest tests.
- `pnpm --filter @chulane/rivto-react test` — run React Jest tests.
- `pnpm test:e2e` — run Playwright.

Run Playwright behavioral tests with `--workers=12`. Rerun failed tests with `--workers=1` before diagnosing or classifying the failures; report the parallel and serial results separately. Run dedicated performance measurements with `--workers=1` to avoid contention between workers.

Use `*.test.ts(x)` for Jest and `*.spec.ts` for Playwright. Run checks proportionate to the change; use focused tests first and build when exports or packaging change. Run relevant local checks and fix failures caused by the requested change without asking for approval at each step.

## Required API and ownership review

Before completing any API or dependency change, inspect the entire affected path:
creation, passing dependencies, use, and destruction. Complete these checks after
the final implementation change:

1. Inspect all consumers and identify the methods each actually uses. Limit their
   dependency interfaces to those operations; do not expose unrelated registration,
   attachment, or teardown capabilities.
2. Identify who creates each object, who borrows it, and who destroys it. Justify
   concrete implementation types by actual lifecycle responsibilities; a consumer
   needing only resource cleanup must not depend on an entire extension manager.
3. Check adjacent managers, constructors, hooks, contexts, and extension callbacks
   for the same dependency mistake. Apply the principle throughout the affected
   path, without expanding into unrelated refactors.
4. Remove duplicate references, unnecessary wrappers, type casts used to bypass
   boundaries, forwarding methods, and API options with no current consumer. Do
   not introduce replacement abstractions without a present requirement.
5. Review architectural boundaries separately from behavioral validation. Passing
   tests does not establish that an interface is minimal or ownership is correct.
   Report which boundaries were inspected and any remaining limitations; do not
   claim an architecture review solely from green tests.

## Style and Reviews

Use ES modules and nearby formatting. Use `PascalCase` for types/components, `camelCase` for functions/values, and kebab-case directories. Prefer existing managers and narrow types.

Keep one field per manager in a controller. A lifecycle owner may use the concrete implementation type to create, attach, and destroy its manager. Consumers must depend on the smallest interface covering their actual operations; receiving a manager does not imply ownership of its lifecycle. Do not keep duplicate references merely to expose a narrow API, such as `events`/`eventManager` or `extensions`/`registrations`. Define the narrow editor interface at the consumer boundary: components, hooks, and extension setup receive manager interfaces that exclude internal attachment and teardown methods. Pass the existing controller object through that interface; do not replace duplicate fields with wrapper objects, type casts, forwarding methods, or duplicate getters. The host retains the concrete controller and owns its lifecycle. Interface narrowing is a TypeScript contract, not runtime access control.

Use concrete names that describe the implemented behavior and reuse existing domain terminology. Name functions for what they actually do, including meaningful scope or side effects; name values for what they contain. Avoid vague names such as `processData`, `handleLogic`, or `AbstractManager` when the code has a specific responsibility. Do not imply validation, persistence, synchronization, or completeness unless the implementation provides it. Check the implementation and callers before choosing or changing a name.

Avoid nested or chained ternary operators. Use `if`/`else` or early returns for multiple conditions; a single simple ternary is fine.

Use Prettier's default ternary style (`experimentalTernaries: false`): when a ternary wraps, put `?` and `:` at the beginning of their respective lines. Short ternaries may remain on one line; do not force every ternary onto multiple lines.

Always use braces (`{}`) around the bodies of `if`, `else`, `for`, `for...in`, `for...of`, `while`, and `do...while`, including single statements. ESLint enforces this with `curly: ["error", "all"]`; Prettier controls brace placement and spacing.

Put non-empty block contents on a new line after `{`, and put the closing `}` on a separate line after the contents. This also applies to function bodies, methods, classes, `switch`, and `try`/`catch`/`finally`. Empty blocks may remain `{}`. ESLint enforces the internal line breaks with `@stylistic/curly-newline: ["error", { minElements: 1, consistent: true }]`, configured after `eslint-config-prettier` so it remains enabled. Prettier controls where the opening brace sits relative to declarations and how comments between branches are formatted.

Keep functions and methods within 50 lines, including blank lines and comment-only lines. ESLint reports longer functions as warnings only; warnings do not fail lint or CI.

Place all private class methods at the bottom of the class, after every other member. This includes static private methods and JavaScript `#private` methods. Keep the relative order of other members unless another rule requires a change.

Every method must have a TypeScript JSDoc docstring (`/** ... */`) directly above its declaration, including private methods, constructors, getters, setters, object methods, interface method signatures, and function-valued class fields.

Document public APIs and non-obvious internal contracts with TypeScript JSDoc (`/** ... */`) directly above the declaration. Describe the actual behavior, relevant constraints and side effects, each parameter's meaning, and the return value (including missing-value behavior). Add `@throws` for meaningful failure conditions. Explain defaults, units, identity, mutation, or transaction behavior when relevant; do not repeat TypeScript types or invent guarantees. Keep docs current when behavior changes. Private helpers also require meaningful documentation of their behavior, parameters, and return values.

Use this required format for function and method documentation, including private helpers, hooks, components, constructors, accessors, and declared callback contracts:

1. Start a multiline `/** ... */` block with a complete sentence describing the concrete behavior. Do not merely expand the declaration's name into words.
2. After a blank `*` line, explain the contract when relevant: ownership, captured versus live state, identity, defaults and units, mutation, transaction boundaries, subscriptions and cleanup, asynchronous completion, and edge cases. Describe only guarantees supported by the implementation and its callers.
3. After another blank `*` line, add `@param name - Meaning and constraints.` for each parameter. For destructured component props, document `@param props` and the meaningful fields as `@param props.field`; describe callback inputs as well as when the callback is invoked.
4. Add `@returns` describing the result and its missing-value cases. For promises, state when they resolve; for disposers, state what they release. For void functions, state the completed side effect rather than writing only "Nothing." Constructors and setters do not need an invented return value.
5. Add `@throws` for meaningful validation, lifecycle, browser, or delegated failures, including rejected promises. Do not promise validation, rollback, atomicity, or error handling that the implementation does not provide.

One-line JSDoc is sufficient for a straightforward data field or constant whose complete contract fits in one sentence. It is not sufficient for a function or callback with parameters, side effects, lifecycle behavior, or failure conditions. Avoid filler, repeated type annotations, and generic phrases such as "handles the operation" or "returns the result." Keep useful existing explanations when expanding a docstring.

Before completing a change, review the added and modified declarations in the diff against these rules. For documentation-only work, verify that executable code and type declarations are unchanged; browser and performance tests are unnecessary when there is no runtime change.

For example, `useBlock` in `packages/react-rivto-editor/src/hooks/blocks/use-block.ts` subscribes to a recursive snapshot and returns ID-bound commands. Its documentation can describe that contract as follows:

```ts
/**
 * Subscribes to a block's complete subtree and returns commands bound to its ID.
 *
 * The snapshot is detached; use the returned operations to change the document.
 * Commands read current document state when invoked.
 *
 * @param blockId - Stable persisted ID of the block to observe.
 * @returns Current recursive snapshot and ID-bound operations. The `block`
 * field is undefined when the ID is unknown or the block has been deleted.
 * @throws If called outside an EditorPanel subtree.
 */
export function useBlock(blockId: string): UseBlockResult;
```

Use comments to explain tricky algorithms and edge cases; avoid restating straightforward code. Define repeated or cross-file HTML class names once in the narrowest owning scope.
Do not invent new terms. Use only names already established in this repository or in widely known domain vocabulary. Do not coin acronyms, shorthand, or new labels for concepts that already have a known name.

Document public APIs and non-obvious invariants. Use comments to explain tricky algorithms and edge cases; avoid restating straightforward code. Define repeated or cross-file HTML class names once in the narrowest owning scope.

Do not shorten existing comments or docstrings, including JSDoc, unless the user explicitly requests it. Preserve their length and level of detail during edits, refactoring, renaming, and code consolidation. Carry documentation over to the surviving implementation, retaining explanations of behavior, invariants, edge cases, parameters, and return values. Update inaccurate descriptions to match the code without condensing the documentation.

Keep commits focused and imperative. Pull requests state the problem, solution, validation, and API/UI impact.
