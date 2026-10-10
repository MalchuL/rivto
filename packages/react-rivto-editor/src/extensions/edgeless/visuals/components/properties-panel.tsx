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
const PANEL_CLASS = `${UI_SCOPE_CLASS} edgeless-visual-properties group/panel`;
/* The header keeps its bottom rule only while property groups are visible below it. */
const HEADER_CLASS = "edgeless-properties-panel-header";
const TITLE_CLASS = "edgeless-properties-panel-title";
const KIND_CLASS = "edgeless-properties-panel-kind";
const COUNT_CLASS = "edgeless-properties-panel-count";
const ACTIONS_CLASS = "edgeless-properties-panel-actions";
const ACTION_CLASS = "edgeless-properties-panel-action";
const GROUP_CLASS = "edgeless-properties-panel-group";
const GROUP_TITLE_CLASS = "edgeless-properties-panel-group-title";
const GROUP_BODY_CLASS = "edgeless-properties-panel-group-body";
const ROW_CLASS = "edgeless-properties-panel-row";
const ROW_LABEL_CLASS = "edgeless-properties-panel-row-label";
/* Selects share the remaining row width; swatches and toggles keep their size. */
const ROW_CONTROLS_CLASS = "edgeless-properties-panel-row-controls";

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
