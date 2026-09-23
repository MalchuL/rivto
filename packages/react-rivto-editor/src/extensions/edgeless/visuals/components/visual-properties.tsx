/**
 * Property editor for one or more selected visual objects of the same kind.
 *
 * Edits are previewed live through the controller and committed as a single
 * undo entry when the pointer leaves the panel or the panel unmounts. Rows
 * whose values differ across the selection render as "Mixed" until the user
 * picks a value. Controls are shadcn primitives (`NativeSelect`, `Checkbox`)
 * plus the shared edgeless size and color controls.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { Checkbox } from "../../../../components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "../../../../components/ui/native-select";
import { isNodeLike } from "../../../../managers/events/dom-nodes";
import type { EdgelessVisualController } from "../controller";
import type { EdgelessFontOption, EdgelessVisual, TextHorizontalAlign, TextVerticalAlign } from "../types";
import { ColorControl } from "./color-control";
import { EdgelessToolButton, type EdgelessToolIcon } from "./tool-button";
import { SizeControl } from "./size-control";
import { EdgelessPropertiesPanel, PropertyGroup, PropertyRow } from "./properties-panel";

/* Segmented control for text alignment; buttons keep `aria-pressed` for the active value. */
const ALIGN_TOGGLES_CLASS = "inline-flex gap-0.5 rounded-lg border border-border bg-secondary p-0.5 [&_button]:size-7 [&_button]:min-w-7";
const PAINT_TOGGLE_CLASS = "ml-auto grid h-7 w-[18px] place-items-center";
const SELECT_CLASS = "text-xs";

/**
 * Renders a compact property select with a disabled "Mixed" placeholder.
 *
 * @param props - Accessible label, current value (empty when mixed), change
 * callback, and the option elements.
 * @returns A small shadcn `NativeSelect`.
 */
function PropertySelect({
  label,
  value,
  onChange,
  children,
}: {
  readonly label: string;
  readonly value: unknown;
  onChange(value: string): void;
  readonly children: ReactNode;
}) {
  return (
    <NativeSelect size="sm" className={SELECT_CLASS} aria-label={label} value={String(value ?? "")} onChange={(event) => onChange(event.currentTarget.value)}>
      <NativeSelectOption value="" disabled>Mixed</NativeSelectOption>
      {children}
    </NativeSelect>
  );
}

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

/**
 * Renders the same-type multi-selection property editor.
 *
 * @param props - Selected visuals (all of one kind), font options, and the
 * visual controller that previews and commits edits.
 * @returns The right-side visual properties panel.
 */
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

  useEffect(() => {
    const view = panelRef.current?.ownerDocument.defaultView;
    if (!view) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!isNodeLike(target)) return;
      if (panelRef.current?.contains(target)) return;
      if (controller.hasPropertyPreview()) controller.commitPropertyPreview();
    };
    view.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      view.removeEventListener("pointerdown", onPointerDown, true);
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
    <span className={PAINT_TOGGLE_CLASS} title={enabled ? `Disable ${label.toLowerCase()}` : `Enable ${label.toLowerCase()}`}>
      <Checkbox
        aria-label={`Enable ${label.toLowerCase()}`}
        checked={enabled}
        onCheckedChange={(checked) => preview({ [key]: checked === true })}
      />
    </span>
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
        <PropertySelect label="Font family" value={common("fontFamily")} onChange={(fontFamily) => preview({ fontFamily })}>
          {fontOptions.map((font) => <NativeSelectOption key={font.fontFamily} value={font.fontFamily}>{font.label}</NativeSelectOption>)}
        </PropertySelect>
        <SizeControl label="Font size" preview="text" value={common("fontSize")} min={10} max={96} onChange={(fontSize) => preview({ fontSize })} />
      </PropertyRow>
      <PropertyRow label="Align">
        <span className={ALIGN_TOGGLES_CLASS} role="group" aria-label="Horizontal text alignment">
          {horizontalAlignments.map(({ value, label, icon }) => (
            <EdgelessToolButton
              key={value}
              label={label}
              icon={icon}
              pressed={common("align") === value}
              onClick={() => preview({ align: value })}
            />
          ))}
        </span>
        <span className={ALIGN_TOGGLES_CLASS} role="group" aria-label="Vertical text alignment">
          {verticalAlignments.map(({ value, label, icon }) => (
            <EdgelessToolButton
              key={value}
              label={label}
              icon={icon}
              pressed={common("verticalAlign") === value}
              onClick={() => preview({ verticalAlign: value })}
            />
          ))}
        </span>
      </PropertyRow>
      {visual.kind === "connector" && (
        <PropertyRow label="Rotation">
          <PropertySelect label="Connector text rotation" value={common("textRotation")} onChange={(textRotation) => preview({ textRotation })}>
            <NativeSelectOption value="horizontal">Horizontal</NativeSelectOption>
            <NativeSelectOption value="90">90°</NativeSelectOption>
            <NativeSelectOption value="180">180°</NativeSelectOption>
            <NativeSelectOption value="270">270°</NativeSelectOption>
            <NativeSelectOption value="along">Along path</NativeSelectOption>
          </PropertySelect>
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
              <PropertySelect label="Connector route" value={common("route")} onChange={(route) => preview({ route })}>
                <NativeSelectOption value="straight">Straight</NativeSelectOption>
                <NativeSelectOption value="orthogonal">Orthogonal</NativeSelectOption>
                <NativeSelectOption value="curve">Curve</NativeSelectOption>
              </PropertySelect>
            </PropertyRow>
            <PropertyRow label="Style">
              <PropertySelect label="Connector line style" value={common("lineStyle")} onChange={(lineStyle) => preview({ lineStyle })}>
                <NativeSelectOption value="solid">Solid</NativeSelectOption>
                <NativeSelectOption value="dashed">Dashed</NativeSelectOption>
                <NativeSelectOption value="dashed-animated">Dashed animated</NativeSelectOption>
              </PropertySelect>
            </PropertyRow>
            <PropertyRow label="Ends">
              {(["startStyle", "endStyle"] as const).map((key) => (
                <PropertySelect
                  key={key}
                  label={key === "startStyle" ? "Start endpoint" : "End endpoint"}
                  value={common(key)}
                  onChange={(style) => preview({ [key]: style })}
                >
                  <NativeSelectOption value="none">None</NativeSelectOption>
                  <NativeSelectOption value="arrow">Arrow</NativeSelectOption>
                </PropertySelect>
              ))}
            </PropertyRow>
          </PropertyGroup>
          {textGroup}
        </>
      )}
    </>
  );

  return (
    <EdgelessPropertiesPanel
      title={kindTitle}
      count={visuals.length}
      ariaLabel="Visual properties"
      panelRef={panelRef}
      onClose={() => controller.reactEditor.commands.execute("edgeless.selection.clear")}
    >
      {body}
    </EdgelessPropertiesPanel>
  );
}
