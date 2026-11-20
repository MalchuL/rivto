import type { ReactNode } from "react";

/** Shared chrome and occurrence identity for one Edgeless properties panel. */
export interface EdgelessPropertiesPanelProps {
  /** Optional stable DOM identity for occurrence-specific keyboard routing. */
  readonly id?: string;
  /** Label describing the selected element or block kind. */
  readonly title: string;
  /** Number of selected objects represented by the panel. */
  readonly count: number;
  /** Accessible name of the properties region. */
  readonly ariaLabel: string;
  /**
   * Closes the owning selection's properties panel.
   *
   * @returns The owner has been asked to close the panel.
   */
  readonly onClose: () => void;
  /** Property controls rendered inside the shared chrome. */
  readonly children: ReactNode;
}

/** Icon names supported by the built-in edgeless tool button. */
export type EdgelessToolIcon =
  | "align-bottom"
  | "align-center"
  | "align-left"
  | "align-middle"
  | "align-right"
  | "align-top"
  | "back"
  | "backward"
  | "distribute-h"
  | "distribute-v"
  | "draw"
  | "ellipse"
  | "forward"
  | "front"
  | "group"
  | "connector"
  | "connector-curve"
  | "connector-orthogonal"
  | "connector-straight"
  | "align-objects"
  | "chevron-down"
  | "chevron-up"
  | "close"
  | "eraser"
  | "marker"
  | "pan"
  | "pen"
  | "pencil"
  | "rectangle"
  | "select"
  | "snap"
  | "sticker"
  | "text"
  | "ungroup"
  | "zoom-in"
  | "zoom-out";

/** Presentation and activation of an Edgeless toolbar button. */
export interface EdgelessToolButtonProps {
  /** Additional classes for toolbar-specific layout. */
  readonly className?: string;
  /** Expanded state of the controlled properties panel. */
  readonly "aria-expanded"?: boolean;
  /** Accessible name; also shown as the native tooltip. */
  readonly label: string;
  /** Built-in icon name or custom React content rendered before any children. */
  readonly icon?: EdgelessToolIcon | ReactNode;
  /**
   * Pressed state for tools and toggles. When provided the button renders as a
   * shadcn `Toggle` and exposes `aria-pressed`; the caller keeps ownership of
   * the state and updates it through editor commands.
   */
  readonly pressed?: boolean;
  /** Extra content such as a zoom percentage, preset label, or swatch. */
  readonly children?: ReactNode;
  /** Registered toolbar tool identity used for normalized input routing. */
  readonly toolId?: string;
  /** Accessible identity of the open group menu. */
  readonly menuId?: string;
  /** Whether this button's group menu is open. */
  readonly menuOpen?: boolean;
  /**
   * Activates the registered toolbar tool or toggles its group menu.
   *
   * @returns The requested toolbar action has run.
   * @throws Propagates toolbar activation failures.
   */
  readonly onActivate?: () => void;
}
