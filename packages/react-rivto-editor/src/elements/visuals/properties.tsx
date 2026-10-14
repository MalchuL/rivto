/**
 * Property editor for one or more selected visual objects of the same kind.
 *
 * Edits are previewed live through the edgeless operations and committed as a single
 * undo entry on an outside pointer press, selection change, or panel unmount. Rows
 * whose values differ across the selection render as "Mixed" until the user
 * picks a value. Controls are shadcn primitives (`NativeSelect`, `Checkbox`)
 * plus the shared edgeless size and color controls.
 */
import { createContext, useContext, type ReactNode } from "react";
import { Checkbox } from "../../components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "../../components/ui/native-select";
import { editorControlProps } from "../../constants";
import type { ElementPropertiesProps } from "../../managers/elements/types";
import { DEFAULT_FONTS } from "./presets";
import type { EdgelessFontOption, TextHorizontalAlign, TextVerticalAlign } from "./types";
import { ColorControl } from "../../components/edgeless/color-control";
import { PropertyGroup, PropertyRow } from "../../components/edgeless/properties-panel";
import { SizeControl } from "../../components/edgeless/size-control";
import { EdgelessToolButton, type EdgelessToolIcon } from "../../components/edgeless/tool-button";

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
    <NativeSelect {...editorControlProps} size="sm" className={SELECT_CLASS} aria-label={label} value={String(value ?? "")} onChange={(event) => onChange(event.currentTarget.value)}>
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

/** Host-configured font choices are shared by built-in text property editors. */
export const VisualFontContext = createContext<readonly EdgelessFontOption[]>(DEFAULT_FONTS);

/** Reuses the shared preview API for color and paint controls without dispatching element types. */
function propertyControls({ elements, common, preview }: ElementPropertiesProps) {
  const color = (label: string, key: "fill" | "stroke" | "color", disabled?: boolean) =>
    key in elements[0]!.props && (
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
      <Checkbox {...editorControlProps}
        aria-label={`Enable ${label.toLowerCase()}`}
        checked={enabled}
        onCheckedChange={(checked) => preview({ [key]: checked === true })}
      />
    </span>
  );

  return { color, paintToggle, common, preview };
}

/**
 * Renders the same-type multi-selection text property editor.
 * @param props - Selected snapshots and shared preview operations; connector adds label rotation.
 * @returns Text property rows inside the surface-owned right-side panel.
 */
export function TextProperties(props: ElementPropertiesProps & { connector?: boolean }) {
  const { connector } = props;
  const { color, common, preview } = propertyControls(props);
  const fontOptions = useContext(VisualFontContext);
  return (
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
      {connector && (
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
}
/** Shape fill, stroke, and text properties for either registered shape. */
export function ShapeProperties(props: ElementPropertiesProps) {
  const { color, paintToggle, common, preview } = propertyControls(props);
  return (
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
      <TextProperties {...props} />
    </>

  );
}
/** Drawing color and width, committed using the same lifecycle as custom properties. */
export function DrawingProperties(props: ElementPropertiesProps) {
  const { color, common, preview } = propertyControls(props);
  return (
    <PropertyGroup title="Stroke">
      <PropertyRow label="Color">{color("Stroke color", "stroke")}</PropertyRow>
      <PropertyRow label="Width">
        <SizeControl label="Stroke width" preview="dot" value={common("strokeWidth")} max={48} onChange={(strokeWidth) => preview({ strokeWidth })} />
      </PropertyRow>
    </PropertyGroup>

  );
}
/** Sticky fill plus shared text properties. */
export function StickerProperties(props: ElementPropertiesProps) {
  const { color } = propertyControls(props);
  return <><PropertyGroup title="Style"><PropertyRow label="Fill">{color('Fill color', 'fill')}</PropertyRow></PropertyGroup><TextProperties {...props} /></>;
}
/** Connector route, stroke, endpoints, and text properties. */
export function ConnectorProperties(props: ElementPropertiesProps) {
  const { color, common, preview } = propertyControls(props);
  return (
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
      <TextProperties {...props} connector />
    </>
  );
}
