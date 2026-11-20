import type { ComponentType, ReactNode } from "react";
import type { CanvasToolbarLayout } from "@chulane/rivto-edgeless/react";
import type { StartPresetDrag } from "../hooks/types";
import type { SnapGuide } from "../../../../elements/visuals/utils/geometry";
import type { EdgelessToolContext } from "../../../../managers/edgeless-tools/edgeless-tool-context";
import type { EdgelessOperations } from "../../../../managers/elements/edgeless-operations";
import type { ElementPropertiesProps } from "../../../../managers/elements/types";

/** Normalized placement bindings kept inside the toolbar implementation. */
export interface PresetDragHandlers {
  /**
   * Captures a primary pointer for a placement preset without inserting content.
   *
   * @param input - Detached pointer-down values and browser capabilities.
   * @param tool - Surface tool providing the detached placement draft.
   * @returns An eligible pointer is captured for subsequent placement.
   * @throws Browser capture or input registration failures, including failed rollback.
   */
  readonly startPresetDrag: StartPresetDrag;
}

/** Surface dependencies and private placement bindings for the toolbar. */
export interface ToolBarProps extends PresetDragHandlers {
  readonly edgelessOperation: EdgelessOperations;
  readonly tools: EdgelessToolContext;
}

/** Shared layout and surface-owned tool session. */
export interface ToolBarLayoutProps extends CanvasToolbarLayout {
  readonly tools: EdgelessToolContext;
}

/** SVG capture-layer content and normalized-input activation. */
export interface DrawingCaptureProps {
  /** Whether the layer accepts pointer input; defaults to false. */
  readonly active?: boolean;
  /** Feedback drawn in absolute canvas coordinates. */
  readonly children?: ReactNode;
}

/** Alignment and spacing guides drawn in canvas world coordinates. */
export interface SnapGuidesProps {
  readonly guides: readonly SnapGuide[];
}

/** Selected objects and operations used by the visual property editor. */
export interface ElementPropertiesPanelProps {
  /** Selected element identities whose property previews are edited. */
  readonly ids: readonly string[];
  /** Label shown in the properties panel. */
  readonly title: string;
  /** Registered controls for the selected element type. */
  readonly component: ComponentType<ElementPropertiesProps>;
  /** Borrowed canvas operations for preview and commit. */
  readonly operations: EdgelessOperations;
}
