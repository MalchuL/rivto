/**
 * Scope marker for editor chrome that receives the package's scoped reset.
 *
 * The package ships Tailwind without preflight because the editor lives inside
 * host pages whose typography it must not disturb. `src/styles/base.css`
 * therefore applies a preflight subset only to shadcn primitives (`[data-slot]`)
 * and to containers carrying this class: toolbars, panels, popovers, and menus
 * built from plain elements. Block content and rendered Markdown never carry it.
 *
 * This module lives outside `components/ui/` so the shadcn CLI never
 * overwrites it.
 * @module
 */

/** Class applied to chrome containers so nested plain elements get the reset. */
export const UI_SCOPE_CLASS = "rivto-ui";
