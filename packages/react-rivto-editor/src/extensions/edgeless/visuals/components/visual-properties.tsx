import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EdgelessVisualController } from "../controller";
import type { EdgelessFontOption, EdgelessVisual, TextHorizontalAlign, TextVerticalAlign } from "../types";
import { ColorControl } from "./color-control";
import { EdgelessToolButton, type EdgelessToolIcon } from "./tool-button";
import { SizeControl } from "./size-control";

const horizontalAlignments: readonly { value: TextHorizontalAlign; label: string; icon: EdgelessToolIcon }[] = [
  { value: "left", label: "Align text left", icon: "align-left" },
  { value: "center", label: "Align text center", icon: "align-center" },
  { value: "right", label: "Align text right", icon: "align-right" },
];

const verticalAlignments: readonly { value: TextVerticalAlign; label: string; icon: EdgelessToolIcon }[] = [
  { value: "top", label: "Align text top", icon: "align-top" },
  { value: "middle", label: "Align text middle", icon: "align-middle" },
  { value: "bottom", label: "Align text bottom", icon: "align-bottom" },
];

function PropertyGroup({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="edgeless-property-group" aria-label={title}>
      <header className="edgeless-property-group-title">{title}</header>
      <div className="edgeless-property-group-body">{children}</div>
    </section>
  );
}

function PropertyRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="edgeless-property-row">
      <span className="edgeless-property-row-label">{label}</span>
      <div className="edgeless-property-row-controls">{children}</div>
    </div>
  );
}

/** Same-type multi-selection property editor with deferred undo commits. */
export function VisualProperties({
  visuals,
  fonts: fontOptions,
  controller,
}: {
  visuals: readonly EdgelessVisual[];
  fonts: readonly EdgelessFontOption[];
  controller: EdgelessVisualController;
}) {
  const visual = visuals[0]!;
  const ids = visuals.map((item) => item.id);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (controller.hasPropertyPreview()) controller.commitPropertyPreview();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      if (controller.hasPropertyPreview()) controller.commitPropertyPreview();
    };
  }, [controller]);

  const common = (key: string): unknown => {
    const first = (visual as unknown as Record<string, unknown>)[key];
    return visuals.every((item) => (item as unknown as Record<string, unknown>)[key] === first) ? first : undefined;
  };
  const preview = (patch: Record<string, unknown>) => controller.previewProperties(ids, patch);
  const color = (label: string, key: "fill" | "stroke" | "color", disabled?: boolean) =>
    key in visual && (
      <ColorControl
        label={label}
        value={String(common(key) ?? "#888888")}
        mixed={common(key) === undefined}
        disabled={disabled}
        onChange={(value) => preview({ [key]: value })}
      />
    );
  const paintToggle = (label: string, key: "filled" | "stroked", enabled: boolean) => (
    <label className="edgeless-paint-toggle" title={enabled ? `Disable ${label.toLowerCase()}` : `Enable ${label.toLowerCase()}`}>
      <input
        type="checkbox"
        aria-label={`Enable ${label.toLowerCase()}`}
        checked={enabled}
        onChange={(event) => preview({ [key]: event.currentTarget.checked })}
      />
    </label>
  );

  const hasLabel =
    visual.kind === "text"
    || visual.kind === "sticker"
    || visual.kind === "rectangle"
    || visual.kind === "ellipse"
    || visual.kind === "connector";

  const textGroup = hasLabel && (
    <PropertyGroup title="Text">
      <PropertyRow label="Color">
        {color("Text color", "color")}
      </PropertyRow>
      <PropertyRow label="Font">
        <select
          aria-label="Font family"
          value={String(common("fontFamily") ?? "")}
          onChange={(event) => preview({ fontFamily: event.currentTarget.value })}
        >
          <option value="" disabled>Mixed</option>
          {fontOptions.map((font) => <option key={font.fontFamily} value={font.fontFamily}>{font.label}</option>)}
        </select>
        <SizeControl label="Font size" preview="text" value={common("fontSize")} min={10} max={96} onChange={(fontSize) => preview({ fontSize })} />
      </PropertyRow>
      <PropertyRow label="Align">
        <span className="edgeless-align-toggles" role="group" aria-label="Horizontal text alignment">
          {horizontalAlignments.map(({ value, label, icon }) => (
            <EdgelessToolButton
              key={value}
              label={label}
              icon={icon}
              aria-pressed={common("align") === value}
              onClick={() => preview({ align: value })}
            />
          ))}
        </span>
        <span className="edgeless-align-toggles" role="group" aria-label="Vertical text alignment">
          {verticalAlignments.map(({ value, label, icon }) => (
            <EdgelessToolButton
              key={value}
              label={label}
              icon={icon}
              aria-pressed={common("verticalAlign") === value}
              onClick={() => preview({ verticalAlign: value })}
            />
          ))}
        </span>
      </PropertyRow>
      {visual.kind === "connector" && (
        <PropertyRow label="Rotation">
          <select
            aria-label="Connector text rotation"
            value={String(common("textRotation") ?? "")}
            onChange={(event) => preview({ textRotation: event.currentTarget.value })}
          >
            <option value="" disabled>Mixed</option>
            <option value="horizontal">Horizontal</option>
            <option value="90">90°</option>
            <option value="180">180°</option>
            <option value="270">270°</option>
            <option value="along">Along path</option>
          </select>
        </PropertyRow>
      )}
    </PropertyGroup>
  );

  const kindTitle =
    visual.kind === "rectangle" || visual.kind === "ellipse" ? "Shape"
      : visual.kind === "connector" ? "Connector"
        : visual.kind === "sticker" ? "Sticky"
          : visual.kind === "drawing" ? "Drawing"
            : "Text";

  const body = (
    <>
      {(visual.kind === "rectangle" || visual.kind === "ellipse") && (
        <>
          <PropertyGroup title="Style">
            <PropertyRow label="Fill">
              {color("Fill color", "fill", common("filled") === false)}
              {paintToggle("Fill", "filled", common("filled") !== false)}
            </PropertyRow>
            <PropertyRow label="Stroke">
              {color("Stroke color", "stroke", common("stroked") === false)}
              {common("stroked") !== false && (
                <SizeControl
                  label="Stroke width"
                  preview="dot"
                  value={common("strokeWidth")}
                  max={32}
                  onChange={(strokeWidth) => preview({ strokeWidth })}
                />
              )}
              {paintToggle("Stroke", "stroked", common("stroked") !== false)}
            </PropertyRow>
          </PropertyGroup>
          {textGroup}
        </>
      )}

      {visual.kind === "drawing" && (
        <PropertyGroup title="Stroke">
          <PropertyRow label="Color">{color("Stroke color", "stroke")}</PropertyRow>
          <PropertyRow label="Width">
            <SizeControl label="Stroke width" preview="dot" value={common("strokeWidth")} max={48} onChange={(strokeWidth) => preview({ strokeWidth })} />
          </PropertyRow>
        </PropertyGroup>
      )}

      {(visual.kind === "text" || visual.kind === "sticker") && (
        <>
          {visual.kind === "sticker" && (
            <PropertyGroup title="Style">
              <PropertyRow label="Fill">{color("Fill color", "fill")}</PropertyRow>
            </PropertyGroup>
          )}
          {textGroup}
        </>
      )}

      {visual.kind === "connector" && (
        <>
          <PropertyGroup title="Line">
            <PropertyRow label="Stroke">
              {color("Stroke color", "stroke")}
              <SizeControl label="Stroke width" preview="dot" value={common("strokeWidth")} max={24} onChange={(strokeWidth) => preview({ strokeWidth })} />
            </PropertyRow>
            <PropertyRow label="Route">
              <select aria-label="Connector route" value={String(common("route") ?? "")} onChange={(event) => preview({ route: event.currentTarget.value })}>
                <option value="" disabled>Mixed</option>
                <option value="straight">Straight</option>
                <option value="orthogonal">Orthogonal</option>
                <option value="curve">Curve</option>
              </select>
            </PropertyRow>
            <PropertyRow label="Style">
              <select aria-label="Connector line style" value={String(common("lineStyle") ?? "")} onChange={(event) => preview({ lineStyle: event.currentTarget.value })}>
                <option value="" disabled>Mixed</option>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dashed-animated">Dashed animated</option>
              </select>
            </PropertyRow>
            <PropertyRow label="Ends">
              {(["startStyle", "endStyle"] as const).map((key) => (
                <select
                  key={key}
                  aria-label={key === "startStyle" ? "Start endpoint" : "End endpoint"}
                  value={String(common(key) ?? "")}
                  onChange={(event) => preview({ [key]: event.currentTarget.value })}
                >
                  <option value="" disabled>Mixed</option>
                  <option value="none">None</option>
                  <option value="arrow">Arrow</option>
                </select>
              ))}
            </PropertyRow>
          </PropertyGroup>
          {textGroup}
        </>
      )}
    </>
  );

  return (
    <div
      ref={panelRef}
      className="edgeless-visual-properties edgeless-shared-properties"
      data-edgeless-ui="true"
      data-collapsed={collapsed || undefined}
      role="region"
      aria-label="Visual properties"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="edgeless-properties-header">
        <div className="edgeless-properties-title">
          <span className="edgeless-properties-kind">{kindTitle}</span>
          {visuals.length > 1 && <span className="edgeless-properties-count">{visuals.length} selected</span>}
        </div>
        <div className="edgeless-properties-actions">
          <EdgelessToolButton
            label={collapsed ? "Expand properties" : "Collapse properties"}
            icon={collapsed ? "chevron-down" : "chevron-up"}
            className="edgeless-properties-action"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          />
          <EdgelessToolButton
            label="Close properties"
            icon="close"
            className="edgeless-properties-action"
            onClick={() => controller.reactEditor.editor.execute("edgeless.selection.clear")}
          />
        </div>
      </header>
      {!collapsed && body}
    </div>
  );
}
