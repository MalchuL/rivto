# Chulane TODO

Start each stage after user approval. Record completed stages and validation in
[PROGRESS.md](./PROGRESS.md).

## Next stage: initialize the UI foundation

- [ ] Choose and confirm the folder for application components before running
  the shadcn/ui CLI. Keep them inside `app/chulane`; configure `components.json`
  aliases and TypeScript paths to match the chosen location.
- [ ] Initialize or verify Tailwind CSS through the CLI before installing
  shadcn/ui. Tailwind v4, its PostCSS plugin, and the stylesheet import are
  already present from `create-next-app`; complete any missing setup via CLI.
- [ ] Initialize shadcn/ui through its CLI using the existing Tailwind setup
  and the confirmed component folder. Tailwind must be configured first.
- [ ] Verify styles in both web and Electron, then run type checks, lint,
  production build, and the application smoke tests.
