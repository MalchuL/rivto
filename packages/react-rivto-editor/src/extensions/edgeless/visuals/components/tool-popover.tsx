/**
 * Upward popover chrome anchored to the edgeless create toolbar.
 *
 * The popover is deliberately not a portalled Radix popover: it must stay a
 * DOM descendant of the toolbar so `ToolBar` can keep it open while the user
 * places or draws on the canvas, dismiss it only on explicit tool changes, and
 * expose `data-menu-open` stacking to tests. It renders a `role="menu"`
 * region with a Tools section and an optional Defaults section, styled with
 * Tailwind utilities on the `rivto-ui` scope.
 */
import type { ReactNode } from "react";
import { UI_SCOPE_CLASS } from "../../../../components/ui-scope";
import type { ToolCategory } from "../types";

/** Floating panel above the toolbar; `edgeless-tool-popover` is a stable hook. */
const POPOVER_CLASS = `${UI_SCOPE_CLASS} edgeless-tool-popover`;
const SECTION_CLASS = "edgeless-tool-popover-section";
const HEADING_CLASS = "edgeless-tool-popover-heading";
/* Tool buttons inside the popover widen to fit an icon plus a short label. */
const TOOLS_CLASS = "edgeless-tool-popover-tools";
const DEFAULTS_CLASS = "edgeless-tool-popover-defaults";

/**
 * Renders the Tools / Defaults popover for one create-tool category.
 *
 * @param props - Category (used for the accessible menu name), the tool
 * buttons, and optional default-value controls.
 * @returns The positioned popover element.
 */
export function ToolPopover({
  category,
  tools,
  defaults,
}: {
  readonly category: ToolCategory;
  readonly tools: ReactNode;
  readonly defaults?: ReactNode;
}) {
  return (
    <div className={POPOVER_CLASS} data-edgeless-ui="true" role="menu" aria-label={`${category} tools`}>
      <section className={SECTION_CLASS}>
        <h3 className={HEADING_CLASS}>Tools</h3>
        <div className={TOOLS_CLASS}>{tools}</div>
      </section>
      {defaults && (
        <section className={SECTION_CLASS}>
          <h3 className={HEADING_CLASS}>Defaults</h3>
          <div className={DEFAULTS_CLASS}>{defaults}</div>
        </section>
      )}
    </div>
  );
}
