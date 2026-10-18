/**
 * Category-specific Tools / Defaults content for the bottom create toolbar.
 *
 * Each category renders its tool presets (draggable onto the canvas or
 * clickable to arm the tool) and the default fill, stroke, size, font, and
 * line-style controls that new objects of that category inherit. Defaults are
 * persisted through the edgeless operations so they survive tool switches.
 */
import type { ReactNode } from "react";
import type { EdgelessToolbarGroupProps } from "../../../../managers/edgeless-toolbar/types";
import type { EdgelessFontOption, ConnectorLineStyle } from "../../../../elements/visuals/types";
import { NativeSelect, NativeSelectOption } from "../../../../components/ui/native-select";
import { editorControlProps } from "../../../../constants";
import { ColorControl } from "../../../../components/edgeless/color-control";
import { SizeControl } from "../../../../components/edgeless/size-control";
import { ToolSections } from "./tool-popover";

const SELECT_CLASS = "edgeless-creation-panel-select";

/**
 * Renders the Tools / Defaults popover content for one registered create-tool group.
 *
 * @param props - Resolved group members and their common renderer, receiving panel,
 * and shared edgeless operations. Font options belong to the registered text group.
 * @returns Group contents inside the toolbar-owned popover.
 */
function CreationPanel({
  items,
  renderTool,
  children,
}: EdgelessToolbarGroupProps & { readonly children?: ReactNode }) {
  return <ToolSections tools={items.map((item) => renderTool(item))} defaults={children} />;
}

/**
 * Registered ShapeTools contents include every contributed tool and the built-in creation defaults.
 * @param props - All contributed group members, the common button renderer and panel operations; TextTools also receives its font catalog.
 * @returns Group contents; default controls update panel-local settings for subsequent creation without changing existing elements.
 */
export function ShapeTools(props: EdgelessToolbarGroupProps) {
  const defaults = props.group.getSettings().props!;
  return (
    <CreationPanel {...props}>
      <>
        <ColorControl
          label="Default fill"
          value={String(defaults.fill)}
          onChange={(fill) => props.group.setSettings({ props: { fill } })}
        />
        <ColorControl
          label="Default stroke"
          value={String(defaults.stroke)}
          onChange={(stroke) => props.group.setSettings({ props: { stroke } })}
        />
        <SizeControl
          label="Default stroke width"
          preview="dot"
          value={defaults.strokeWidth}
          max={32}
          onChange={(strokeWidth) => props.group.setSettings({ props: { strokeWidth } })}
        />
      </>
    </CreationPanel>
  );
}

/**
 * Registered DrawingTools contents include every contributed tool and the built-in creation defaults.
 * @param props - All contributed group members, the common button renderer and panel operations; TextTools also receives its font catalog.
 * @returns Group contents; default controls update panel-local settings for subsequent creation without changing existing elements.
 */
export function DrawingTools(props: EdgelessToolbarGroupProps) {
  const defaults = props.group.getSettings().props!;
  return (
    <CreationPanel {...props}>
      <>
        <ColorControl
          label="Default drawing color"
          value={String(defaults.stroke)}
          onChange={(stroke) => props.group.setSettings({ props: { stroke } })}
        />
        <SizeControl
          label="Default drawing width"
          preview="dot"
          value={defaults.strokeWidth}
          max={48}
          onChange={(strokeWidth) => props.group.setSettings({ props: { strokeWidth } })}
        />
      </>
    </CreationPanel>
  );
}

/**
 * Registered TextTools contents include every contributed tool and the built-in creation defaults.
 * @param props - All contributed group members, the common button renderer and panel operations; TextTools also receives its font catalog.
 * @returns Group contents; default controls update panel-local settings for subsequent creation without changing existing elements.
 */
export function TextTools(
  props: EdgelessToolbarGroupProps & { readonly fonts: readonly EdgelessFontOption[] },
) {
  const defaults = props.group.getSettings().props!;
  const fontOptions = props.fonts;
  return (
    <CreationPanel {...props}>
      <>
        <NativeSelect
          {...editorControlProps}
          size="sm"
          className={SELECT_CLASS}
          aria-label="Default font"
          value={String(defaults.fontFamily)}
          onChange={(event) =>
            props.group.setSettings({ props: { fontFamily: event.currentTarget.value } })
          }
        >
          {fontOptions.map((font) => (
            <NativeSelectOption key={font.fontFamily} value={font.fontFamily}>
              {font.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <ColorControl
          label="Default text color"
          value={String(defaults.color)}
          onChange={(color) => props.group.setSettings({ props: { color } })}
        />
        <SizeControl
          label="Default font size"
          preview="text"
          value={defaults.fontSize}
          min={10}
          max={96}
          onChange={(fontSize) => props.group.setSettings({ props: { fontSize } })}
        />
      </>
    </CreationPanel>
  );
}

/**
 * Registered ConnectorTools contents include every contributed tool and the built-in creation defaults.
 * @param props - All contributed group members, the common button renderer and panel operations; TextTools also receives its font catalog.
 * @returns Group contents; default controls update panel-local settings for subsequent creation without changing existing elements.
 */
export function ConnectorTools(props: EdgelessToolbarGroupProps) {
  const defaults = props.group.getSettings().props!;
  return (
    <CreationPanel {...props}>
      <>
        <ColorControl
          label="Default connector color"
          value={String(defaults.stroke)}
          onChange={(stroke) => props.group.setSettings({ props: { stroke } })}
        />
        <SizeControl
          label="Default connector width"
          preview="dot"
          value={defaults.strokeWidth}
          max={24}
          onChange={(strokeWidth) => props.group.setSettings({ props: { strokeWidth } })}
        />
        <NativeSelect
          {...editorControlProps}
          size="sm"
          className={SELECT_CLASS}
          aria-label="Default connector line style"
          value={String(defaults.lineStyle)}
          onChange={(event) =>
            props.group.setSettings({
              props: {
                lineStyle: event.currentTarget.value as ConnectorLineStyle,
              },
            })
          }
        >
          <NativeSelectOption value="solid">Solid</NativeSelectOption>
          <NativeSelectOption value="dashed">Dashed</NativeSelectOption>
          <NativeSelectOption value="dashed-animated">Dashed animated</NativeSelectOption>
        </NativeSelect>
      </>
    </CreationPanel>
  );
}

/**
 * Sticky presets supply thumbnail icons; contributed tools use the same resolved list.
 * @param props - All contributed group members, the common button renderer and panel operations; TextTools also receives its font catalog.
 * @returns Group contents; default controls update panel-local settings for subsequent creation without changing existing elements.
 */
export function StickerTools(props: EdgelessToolbarGroupProps) {
  return (
    <ToolSections
      tools={props.items.map((item) =>
        props.renderTool(item, item.tool.icon ? null : item.tool.title),
      )}
    />
  );
}
