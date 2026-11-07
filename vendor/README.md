# Vendored Cordis

`cordis/` is the Cordis package from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), at commit `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159` (`vendor/cordis`, version 4.1.0). It is a copy of that directory, not a Git submodule. Its original MIT license and copyright notice are in `cordis/LICENSE`.

Chulane uses this copy through the `@deepseek-ai/cordis` workspace dependency. `pnpm --filter @chulane/app build:runtime` builds Cordis first. The local `cordis/package.json` replaces upstream workspace dependency ranges with published versions, marks the package private, and adds a TypeScript build and local declaration paths. `cordis/tsconfig.json` is also local. The upstream package's `README.md` and `bin.js` are retained; its optional CLI requires the loader and include plugins.

## Update from upstream

From the repository root, first commit or otherwise preserve local Cordis changes. These commands overwrite the listed files and replace `src/`:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git /tmp/deepseek-harness-cordis
git -C /tmp/deepseek-harness-cordis checkout master
git -C /tmp/deepseek-harness-cordis rev-parse HEAD
rsync -a --delete /tmp/deepseek-harness-cordis/vendor/cordis/src/ vendor/cordis/src/
cp /tmp/deepseek-harness-cordis/vendor/cordis/{LICENSE,README.md,bin.js} vendor/cordis/
```

For later updates, run `git -C /tmp/deepseek-harness-cordis pull --ff-only` instead of cloning again. Compare the upstream `vendor/cordis/package.json` and `tsconfig.json` with the local versions; carry over the upstream version and any changed dependencies, exports, or compiler requirements while retaining the local build configuration. Replace upstream `workspace:~` ranges with the corresponding published versions. Update the commit and version recorded above, review the diff including license changes, then run:

```sh
pnpm install
pnpm --filter @chulane/app check-types
pnpm --filter @chulane/app test:unit
```

Review upstream breaking changes and resolve any application failures before adopting an update. The upstream Cordis sources themselves originate from the Cordis project; DeepSeek's [vendor manifest](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/README.md) records its upstream revisions and local modifications.
