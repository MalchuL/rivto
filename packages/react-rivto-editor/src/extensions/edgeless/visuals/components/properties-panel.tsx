/**
 * Shared chrome for edgeless element property panels.
 *
 * The component owns the consistent right-side placement, title, selection
 * count, collapse action, and close action. Element-specific editors supply
 * only their property groups and persistence callbacks. Pointer presses are
 * stopped at the panel root so canvas selection and marquee handlers never
 * treat interaction with a control as a click on the canvas.
 */
import { useState, type ReactNode, type RefObject } from "react";
import { UI_SCOPE_CLASS } from "../../../../components/ui-scope";
import { EdgelessToolButton } from "./tool-button";

/** Right-side floating panel; `edgeless-visual-properties` is a stable hook. */
const PANEL_CLASS = `${UI_SCOPE_CLASS} edgeless-visual-properties group/panel absolute top-[58px] right-3.5 z-10 flex w-[min(280px,calc(100vw-28px))] cursor-default flex-col overflow-hidden rounded-[14px] border border-border bg-background/97 text-secondary-foreground shadow-(--rivto-edgeless-panel-shadow) select-none`;
/* The header keeps its bottom rule only while property groups are visible below it. */
const HEADER_CLASS = "flex items-center justify-between gap-2.5 border-b border-(--rivto-edgeless-panel-divider) bg-(image:--rivto-edgeless-panel-header) py-2.5 pr-2.5 pl-3.5 group-data-[collapsed]/panel:border-b-0";
const TITLE_CLASS = "flex min-w-0 flex-1 flex-wrap items-baseline gap-2";
const KIND_CLASS = "text-[0.8rem]/tight font-[650] tracking-[0.02em] text-foreground";
const COUNT_CLASS = "text-[0.68rem]/none font-medium text-muted-foreground";
const ACTIONS_CLASS = "flex shrink-0 items-center gap-0.5";
const ACTION_CLASS = "size-7 min-w-7 rounded-lg text-muted-foreground [&_svg:not([class*='size-'])]:size-4";
const GROUP_CLASS = "flex flex-col gap-2 px-3.5 py-3 not-first:border-t not-first:border-(--rivto-edgeless-panel-divider)";
const GROUP_TITLE_CLASS = "text-[0.65rem]/none font-[650] tracking-[0.06em] text-muted-foreground uppercase";
const GROUP_BODY_CLASS = "flex flex-col gap-2";
const ROW_CLASS = "grid grid-cols-[52px_minmax(0,1fr)] items-center gap-2";
const ROW_LABEL_CLASS = "text-[0.72rem]/none font-medium text-muted-foreground";
/* Selects share the remaining row width; swatches and toggles keep their size. */
const ROW_CONTROLS_CLASS = "flex min-w-0 flex-wrap items-center gap-1.5 [&_[data-slot=native-select-wrapper]]:min-w-0 [&_[data-slot=native-select-wrapper]]:flex-[1_1_96px]";

/**
 * Renders a titled group inside an edgeless properties panel.
 *
 * @param props - Group title and element-specific controls.
 * @returns One labeled property section.
 */
export function PropertyGroup({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className={GROUP_CLASS} aria-label={title}>
      <header className={GROUP_TITLE_CLASS}>{title}</header>
      <div className={GROUP_BODY_CLASS}>{children}</div>
    </section>
  );
}

/**
 * Renders one label/control row inside a property group.
 *
 * @param props - Row label and its controls.
 * @returns One consistently aligned property row.
 */
export function PropertyRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className={ROW_CLASS}>
      <span className={ROW_LABEL_CLASS}>{label}</span>
      <div className={ROW_CONTROLS_CLASS}>{children}</div>
    </div>
  );
}

/**
 * Renders shared collapsible chrome for visual and block property editors.
 *
 * @param props - Panel identity, selection count, close callback, and body.
 * @returns A right-side edgeless properties region.
 */
export function EdgelessPropertiesPanel({
  title,
  count,
  ariaLabel,
  panelRef,
  onClose,
  children,
}: {
  readonly title: string;
  readonly count: number;
  readonly ariaLabel: string;
  readonly panelRef?: RefObject<HTMLDivElement | null>;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div
      ref={panelRef}
      className={PANEL_CLASS}
      data-edgeless-ui="true"
      data-collapsed={collapsed || undefined}
      role="region"
      aria-label={ariaLabel}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className={HEADER_CLASS}>
        <div className={TITLE_CLASS}>
          <span className={KIND_CLASS}>{title}</span>
          {count > 1 && <span className={COUNT_CLASS}>{count} selected</span>}
        </div>
        <div className={ACTIONS_CLASS}>
          <EdgelessToolButton
            label={collapsed ? "Expand properties" : "Collapse properties"}
            icon={collapsed ? "chevron-down" : "chevron-up"}
            className={ACTION_CLASS}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          />
          <EdgelessToolButton
            label="Close properties"
            icon="close"
            className={ACTION_CLASS}
            onClick={onClose}
          />
        </div>
      </header>
      {!collapsed && children}
    </div>
  );
}
