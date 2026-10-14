/**
 * Upward popover chrome anchored to the edgeless create toolbar.
 *
 * The shadcn Popover positions content and owns dismissal. Its portal stays a
 * DOM descendant of the toolbar so panel event routing, styling and drag hit
 * testing retain their receiving canvas. It remains open during canvas creation;
 * Select/Pan, category toggles and Escape dismiss it. The toolbar exposes
 * data-menu-open for stacking. Registered groups supply Tools and optional Defaults
 * sections or a custom layout in the same non-modal dialog, styled with Tailwind
 * utilities on the rivto-ui scope. Opening/closing never steals canvas focus.
 */
import { PopoverContent } from "../../../../components/ui/popover";
import type { EdgelessOperations } from "../../../../managers/elements/edgeless-operations";
import type { ReactNode } from "react";
import { UI_SCOPE_CLASS } from "../../../../components/ui-scope";

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
 * @param props - Category (used for the accessible dialog name), the tool
 * buttons, optional default-value controls, receiving operations and portal container. Custom children replace those
 * sections while retaining positioning and the accessible container.
 * @returns The positioned popover element.
 */
export function ToolPopover({
  id,
  category,
  container,
  operations,
  tools,
  defaults,
  children,
}: {
  readonly id: string;
  readonly category: string;
  readonly container: HTMLElement | null;
  readonly operations: EdgelessOperations;
  readonly tools?: ReactNode;
  readonly children?: ReactNode;
  readonly defaults?: ReactNode;
}) {
  return (
    <PopoverContent id={id} container={container} side="top" sideOffset={10} className={POPOVER_CLASS}
      data-edgeless-ui="true" aria-label={`${category} tools`}
      onOpenAutoFocus={event => event.preventDefault()}
      onCloseAutoFocus={event => event.preventDefault()}
      // Radix consumes Escape before editor keyboard routing; changing tools also cancels its active gesture.
      onEscapeKeyDown={() => operations.setTool('select')}
      onInteractOutside={event => {
        const current = operations.getTool().tool;
        // Group buttons own toggling; canvas placement must not dismiss its defaults.
        if (container?.contains(event.target as Node) || (current !== 'select' && current !== 'pan')) event.preventDefault();
      }}>
      {children ?? <ToolSections tools={tools} defaults={defaults} />}
    </PopoverContent>
  );
}

/**
 * Common Tools / Defaults layout; custom group contents may supply a different arrangement.
 * @param props - Resolved tool buttons and optional default-value controls.
 * @returns Tools section and, when supplied, Defaults section; neither adds a popover or owns tool state.
 */
export function ToolSections({ tools, defaults }: { readonly tools: ReactNode; readonly defaults?: ReactNode }) {
  return <>
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
  </>;
}
