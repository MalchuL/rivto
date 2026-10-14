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
  const edgelessOperation = props.operations;
  const defaults = edgelessOperation.getDefaults();
  return (
    <CreationPanel {...props}>
      <>
        <ColorControl
          label="Default fill"
          value={defaults.shape.fill}
          onChange={(fill) => edgelessOperation.setCreationDefaults("shape", { fill })}
        />
        <ColorControl
          label="Default stroke"
          value={defaults.shape.stroke}
          onChange={(stroke) => edgelessOperation.setCreationDefaults("shape", { stroke })}
        />
        <SizeControl
          label="Default stroke width"
          preview="dot"
          value={defaults.shape.strokeWidth}
          max={32}
          onChange={(strokeWidth) =>
            edgelessOperation.setCreationDefaults("shape", { strokeWidth })
          }
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
  const edgelessOperation = props.operations;
  const defaults = edgelessOperation.getDefaults();
  return (
    <CreationPanel {...props}>
      <>
        <ColorControl
          label="Default drawing color"
          value={defaults.drawing.stroke}
          onChange={(stroke) => edgelessOperation.setCreationDefaults("drawing", { stroke })}
        />
        <SizeControl
          label="Default drawing width"
          preview="dot"
          value={defaults.drawing.strokeWidth}
          max={48}
          onChange={(strokeWidth) =>
            edgelessOperation.setCreationDefaults("drawing", { strokeWidth })
          }
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
  const edgelessOperation = props.operations;
  const defaults = edgelessOperation.getDefaults();
  const fontOptions = props.fonts;
  return (
    <CreationPanel {...props}>
      <>
        <NativeSelect
          {...editorControlProps}
          size="sm"
          className={SELECT_CLASS}
          aria-label="Default font"
          value={defaults.text.fontFamily}
          onChange={(event) =>
            edgelessOperation.setCreationDefaults("text", { fontFamily: event.currentTarget.value })
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
          value={defaults.text.color}
          onChange={(color) => edgelessOperation.setCreationDefaults("text", { color })}
        />
        <SizeControl
          label="Default font size"
          preview="text"
          value={defaults.text.fontSize}
          min={10}
          max={96}
          onChange={(fontSize) => edgelessOperation.setCreationDefaults("text", { fontSize })}
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
  const edgelessOperation = props.operations;
  const defaults = edgelessOperation.getDefaults();
  return (
    <CreationPanel {...props}>
      <>
        <ColorControl
          label="Default connector color"
          value={defaults.connector.stroke}
          onChange={(stroke) => edgelessOperation.setCreationDefaults("connector", { stroke })}
        />
        <SizeControl
          label="Default connector width"
          preview="dot"
          value={defaults.connector.strokeWidth}
          max={24}
          onChange={(strokeWidth) =>
            edgelessOperation.setCreationDefaults("connector", { strokeWidth })
          }
        />
        <NativeSelect
          {...editorControlProps}
          size="sm"
          className={SELECT_CLASS}
          aria-label="Default connector line style"
          value={defaults.connector.lineStyle}
          onChange={(event) =>
            edgelessOperation.setCreationDefaults("connector", {
              lineStyle: event.currentTarget.value as ConnectorLineStyle,
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
