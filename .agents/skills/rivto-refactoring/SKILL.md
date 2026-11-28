---
name: rivto-refactoring
description: Rules for refactoring, implementing or reviewing Rivto code - naming, where code lives, removing duplicates, limits as options, documentation, safe renames and verification. Use before restructuring a module, renaming anything, adding a helper or constant, or reviewing a change for code quality.
---

# Rivto Refactoring and Code Quality

Use this skill when you restructure code, rename things, add helpers or
constants, or review a branch. It turns the repository rules in
[AGENTS.md](../../../AGENTS.md) into a working method. Examples come from the
refactor of `packages/react-rivto-editor/src/extensions/html-surface/`.

Refactoring means behavior stays the same unless you say otherwise. When you
find a real bug while refactoring, fix it as a separate, named change and
report it as a behavior change, not as part of the rename.

## 1. Understand before you move anything

1. Read the whole path: who creates the code, who calls it, who tests it, and
   who documents it (`docs/`, `.agents/skills/`, `dev_notes/`, `e2e/`).
2. Before writing a helper, search for one that already exists, especially in
   lower layers (`packages/rivto-utils`, `packages/document-model`,
   `packages/rivto-editor-core`). Search by behavior, not only by name:

   ```sh
   grep -rnE "__proto__|isPlain|Portable|structured" packages/*/src --include=*.ts
   ```

   Example: `html-surface/model/json-value.ts` had its own `isJsonValue`,
   `isJsonRecord` and `isPrototypeKey`. `document-model` already had the same
   rules as `isPortableValue` and `isDangerousKey`, and the two copies had
   drifted apart. The fix was to delete the copy and use one shared definition
   (now in `@chulane/rivto-utils`).

3. Find out what each consumer actually uses before narrowing or moving an API
   (see "Required API and ownership review" in AGENTS.md).
4. Check what is public: the package `index.ts`, extension options, persisted
   types, wire messages, and attributes or APIs that widget or plugin authors
   write. Renaming those is a breaking change: say so, and ask when the user
   has not asked for it.

## 2. Naming

**Reuse the repository's words.** Search for a term before you introduce it.
If a pattern exists, follow it. Do not invent new terms or acronyms.

| Situation              | Bad                                  | Good                  | Why                                                             |
| ---------------------- | ------------------------------------ | --------------------- | --------------------------------------------------------------- |
| Empty state of a block | `HtmlPasteTarget`, `HtmlSourceInput` | `HtmlBlockEmpty`      | The repo names empty states `<Owner>Empty` (`TodoStorageEmpty`) |
| Iframe content         | `EmbeddedContent`                    | `HtmlFrame`, "iframe" | "Embed" already means nested Rivto content                      |

**One word, one meaning.** If a word already means something nearby, pick
another one.

- `HTML_CHANNEL` was a tag on every message, but the transport is a real
  `MessageChannel`. It became `HTML_IFRAME_MESSAGE_NAMESPACE`, and the message
  field became `namespace`.
- "Host" meant both "the editor" and "the app that installs the extension".
  Use **editor**, **page** (the widget document), **widget** and **host
  application**, and use each one for one thing only.

**Name what it does on every path, not only the first one you saw.** Check
all surfaces and callers before naming.

- `HtmlDragRegion` was wrong. On the canvas a press there moves the element,
  but in Page it starts a block selection. `HtmlEditorPointerRegion` says what
  is true on both: the press goes to the editor surface.

**Keep data and its view apart.** The rectangle a widget reports is a
_region_. The overlay the editor draws over it is a _target_ or _handle_.
Message names, types and state follow the data: `{kind: "editor-pointer-regions", regions}`.

**Do not overpromise.** A name must not claim more than the code does.

- `isJsonValue` rejected `{"constructor": 1}`, which is valid JSON. The
  repo's word for this rule is **portable**: `isPortableValue`.
- `isWritableKey` sounded like a permission check. It only rejected empty and
  prototype keys. It became the private helper `isWidgetPropKey`, next to its
  only caller.

**Do not shadow globals** with local names: `document` became `frameDocument`.
Replace one-letter names (`r`, `l`, `t`) with words (`region`, `overlapLeft`),
including inside script strings.

## 3. Where code lives

- **Organize a feature folder by responsibility.** Example layout:
  `model/` (pure data rules), `sandbox/` (what runs in the iframe and the
  message protocol), `frame/` (iframe lifecycle), `editing/` (source editing
  UI), `block/`, `element/`, `unsafe/`, plus `extension.tsx`, `options.ts`,
  `types.ts`, `constants.ts` and `index.ts`.
- **Narrowest owning scope.** A helper with one caller is private in that
  caller's file. A component used by one renderer lives next to it.
  - `HtmlBlockEmpty` is used only by blocks, so it moved from `editing/` to `block/`.
  - `validateHtmlElementProps` is an element schema rule, not a JSON helper,
    so it moved to `element/html-element-props.ts`.
- **One definition for shared rules, in the lowest layer that needs it.**
  Generic, dependency-free helpers go to `packages/rivto-utils`. Document
  invariants go to `packages/document-model`. Do not keep a local copy "for
  speed", and do not re-export the same helper from two packages.
- **`constants.ts` holds protocol and persisted values only**, such as block
  types and message tags. UI text belongs in a component; for example,
  `HTML_EDIT_HINT` became `<HtmlWidgetApiHint />`. Limits belong in options
  (section 4).
- **Do not duplicate text that must stay in sync.** If two places show the
  same text, render one component. Do not paste the string twice.
- **Tests live in `__tests__/` next to the module they test**, and they move
  with the module.
- **Export as little as possible.** Remove `export` from anything only its
  own file uses. Keep the public `index.ts` small and deliberate.

## 4. Limits and thresholds are options

Do not hard-code maximum sizes, counts or timeouts as module constants. Expose
them as factory options with documented defaults and validation, even when
nothing uses them yet (AGENTS.md, rule 4):

```ts
export interface HtmlSurfaceOptions {
  /** Most editor pointer regions one widget may report. Positive integer. Default 64. */
  readonly maxEditorPointerRegions?: number;
}
export const DEFAULT_HTML_SURFACE_LIMITS = Object.freeze({ maxEditorPointerRegions: 64 /* … */ });
export function resolveHtmlSurfaceLimits(options: HtmlSurfaceOptions = {}): HtmlSurfaceLimits {
  // Throws RangeError for invalid values, at installation time.
}
```

Resolve the options once, when the extension is installed. Pass the resolved
`limits` down to the code that needs them. Document every option in the
package docs table, then test the defaults, the validation, and one custom
value end to end.

## 5. Code shape

- Keep functions within 50 lines. Split a long component into named pieces
  with one job each (for example `HtmlBlockBody`, `useBlockWidget`,
  `HtmlEditorPane`, `useSourceDraft`). Long ES5 script builders are the
  accepted exception, but document their shared variables.
- No nested ternaries, including in JSX. Use `if`/`else` or early returns.
- Read the latest props in long-lived handlers through a ref, not through a
  closure created in an earlier render.
- When a fix touches a branch that differs by surface, handle each surface
  explicitly. Example: the overlay used `cursor: grab` everywhere, but `grab`
  is correct only on the canvas, so Page now keeps the default cursor.

## 6. Documentation

Follow the JSDoc format in AGENTS.md. In addition:

- Start with what the code does in plain words, then explain _why_: the
  security reason, the edge case, or the ordering that matters.
- Use one vocabulary in every doc, comment, skill and test title. When you
  rename a concept, rename it in prose as well (search for "drag region" as
  well as `DragRegion`).
- Every module gets a short header: what it is and where it fits.
- Document the fields of public types, especially types that third-party
  code sees (for example `rivto.node`).
- Never shorten existing documentation while moving code. Carry it to the
  new location and update what changed.

## 7. Renaming safely

1. List every form of the name before you edit:

   ```sh
   grep -rnoiE "[A-Za-z_-]*drag[ _-]?(region|handle)s?[A-Za-z_-]*" \
     packages demo e2e docs .agents dev_notes --include=*.{ts,tsx,md,mjs,css} \
     | grep -v node_modules | grep -v /dist/
   ```

   Cover PascalCase, camelCase, kebab-case file names, string literals
   (message kinds), CSS classes, `data-*` attributes, test titles, docs,
   skills and `dev_notes`.

2. Move files with `git mv`, so history follows them. Stage a pending move
   before moving the file again.
3. Replace exact identifiers first. Then review the prose by hand; a blind
   regex breaks unrelated words (for example `BroadcastChannel`).
4. Watch for multi-line imports, which single-line patterns miss.
5. Search again afterwards. Zero matches for the old name is the goal; any
   match left must be intentional (for example a public attribute you chose
   to keep).
6. Do not touch files the user is editing beyond what the rename needs, and
   say which of their files you changed.

## 8. Verify

Follow [rivto-performance-testing](../rivto-performance-testing/SKILL.md).
For a refactor, the minimum is:

```sh
pnpm check-types                              # whole workspace
npx eslint <changed dirs>                     # 0 errors; new warnings must be justified
npx prettier --check <changed dirs>
pnpm test                                     # core packages, when shared layers changed
pnpm --filter @chulane/rivto-react test
```

- When a package's exports change, rebuild it before type-checking its
  consumers. For example, React reads `rivto-page` types from `dist`:
  `pnpm --filter @chulane/rivto-page build`.
- When strings that run in the browser change (iframe scripts, message kinds,
  `data-*` attributes, CSS classes), run Playwright against a production
  preview, not someone else's dev server:

  ```sh
  pnpm demo:build
  pnpm --dir demo exec vite preview --host 127.0.0.1 --port 5199 --strictPort
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:5199 pnpm exec playwright test <specs> --workers=12
  ```

  Rerun failures with `--workers=1`, and report the parallel and serial
  results separately. Stop the preview server afterwards.

- When a test fails, read the error before deciding it is unrelated. Say why
  it is unrelated (for example "waits for the Preview alert; does not touch
  pointer regions").
- For a visual change, take a screenshot and look at it.

## 9. Report

- Say what changed, why each name or location was chosen, what is public or
  breaking, and what you did not change on purpose.
- Give exact verification numbers, including failures and flaky tests. Do
  not claim "all green" from a partial run.
- Say what is uncommitted or staged, and which user files you touched.

## Review checklist

Use this list for your own changes and when reviewing someone else's:

- [ ] No local copy of a rule that exists in a lower layer or shared package.
- [ ] Every new name is an existing repo term or a widely known one; no word
      means two things; the name is true on every surface.
- [ ] Data and view have different names (region vs. target).
- [ ] Helpers with one caller are private; single-consumer code sits next to
      its consumer; tests sit in `__tests__/` next to the code.
- [ ] `constants.ts` has no UI text and no limits; limits are validated options.
- [ ] Functions within 50 lines; no nested ternaries; no shadowed globals.
- [ ] JSDoc follows AGENTS.md, and the docs, skills, `dev_notes` and test
      titles use the new vocabulary.
- [ ] Searching for the old names finds nothing unintended.
- [ ] Types, lint, Prettier, Jest and (for browser-facing strings) Playwright
      were run, with the results reported honestly.
