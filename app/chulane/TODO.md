# Chulane TODO

Start each stage after user approval. Record completed stages and validation in
[PROGRESS.md](./PROGRESS.md).

## Completed: initialize the UI foundation

- [x] Choose and confirm the folder for application components before running
  the shadcn/ui CLI. Keep them inside `app/chulane`; configure `components.json`
  aliases and TypeScript paths to match the chosen location.
- [x] Initialize or verify Tailwind CSS through the CLI before installing
  shadcn/ui. Tailwind v4, its PostCSS plugin, and the stylesheet import are
  already present from `create-next-app`; complete any missing setup via CLI.
- [x] Initialize shadcn/ui through its CLI using the existing Tailwind setup
  and the confirmed component folder. Tailwind must be configured first.
- [x] Verify styles in both web and Electron, then run type checks, lint,
  production build, and the application smoke tests.

## Next stage: initialize the application runtime

- [ ] Establish a focused test command for application runtime and domain tests.
- [ ] Write and run a failing composition/lifecycle test before implementation.
- [ ] Initialize `@deepseek-ai/cordis` composition with application-owned lifecycle
  boundaries and verify setup and disposal through that test.
- [ ] Run type checks, lint, build, and affected application tests; record results
  in `PROGRESS.md`.

After the runtime stage: local users, workspace ownership, and SQLite-backed
application services, followed by Rivto hosting with durable CRDT persistence.
