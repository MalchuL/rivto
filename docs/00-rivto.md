# Rivto

Rivto is an extensible editor workspace built around a framework-neutral document core and a React browser presentation layer.

This documentation site is itself editable. Run `pnpm docs:dev`, open the local URL, edit a page, and save it directly back to itgfjhs Markdown source. Run `pnpm docs:build` followed by `pnpm docs:preview` to inspect the static production build; it remains editable and downloads changed Markdown.

/home/vlad/Downloads/photo\_2026-07-08\_14-54-39.jpg

## Packages

- `@chulane/rivto` owns canonical document state and framework-neutral behavior.
- `@chulane/rivto-react` owns React rendering and browser interactions.

More application and package documentation can be added with the **New sibling** and **New child** buttons. Files use numeric prefixes so navigation order remains explicit and stable.

Paste images directly into the editor while running `pnpm docs:dev`; Rivto saves them inside the selected page's asset folder and inserts the Markdown image reference automatically.