import type { RegionIdentity } from "@chulane/rivto-root";
import type { ReactElement, ReactNode } from "react";
import type {
  BlockDropBoundaryMode,
  BlockDropDestination,
  BlockDropGutterSize,
  BlockDropRegion,
} from "../../editor/drag-and-drop/types";
import type { BlockButtonPresentationAttributes } from "../types";
import type { BlockItemProps } from "../components/block-layout/types";

/**
 * Binds a mounted handle to an occurrence-local consumer without exposing its element.
 *
 * A binding that throws must release any resources it acquired before throwing.
 *
 * @param identity - Opaque identity of this mounted handle.
 * @returns Cleanup invoked when the handle or binding is replaced or unmounted.
 * @throws Propagates registration and cleanup failures.
 */
export type DragHandleBinding = (identity: RegionIdentity) => () => void;

/** Accessible handle capabilities; commands, artwork, and sensor attachment belong to the caller. */
export interface DragHandleProps extends BlockButtonPresentationAttributes {
  readonly children?: ReactNode;
  /** Binds the mounted handle identity; keep the callback stable to avoid reconnecting. */
  readonly bindHandle?: DragHandleBinding;
  /** Finite positive excursion from pointer-down in viewport CSS pixels that prevents navigation, even after returning; defaults to 4. */
  readonly clickMovementThreshold?: number;
  /**
   * Requests navigation when the handle receives an eligible click without default prevention.
   *
   * @returns Host navigation has been requested; omission leaves the handle navigation-free.
   */
  readonly onOpen?: () => void;
  /**
   * Opens host actions at browser context-menu coordinates.
   *
   * @param x - Viewport X coordinate in CSS pixels.
   * @param y - Viewport Y coordinate in CSS pixels.
   * @returns Host actions have been requested; omission leaves the native menu available.
   */
  readonly onMenu?: (x: number, y: number) => void;
}

/** Declarative geometry composed onto one existing child element. */
export interface BlockDropTargetProps {
  /** Real parent or canonical child gap checked at resolution. */
  readonly destination?: BlockDropDestination;
  /** Explicit data-only geometry; omission uses the supplied destination over existing bounds. */
  readonly regions?: readonly BlockDropRegion[];
  /** Finite overlap priority, default zero. */
  readonly priority?: number;
  /** False by default; true excludes this anchor and ancestor fallback, while descendant regions remain eligible. */
  readonly exclude?: boolean;
  /** Composes the registration ref onto one child instead of adding a wrapper. */
  readonly asChild: true;
  /** Existing target forwarding its mounted element or region identity, or no content while absent. */
  readonly children?: ReactNode;
}

/** Explicit exclusion composed onto one existing element without registering a target. */
export interface BlockDropExcludeProps {
  /** Required true; exclusion never creates a wrapper. */
  readonly asChild: true;
  /** Defaults to true; false removes this boundary without declaring a new drop region. */
  readonly exclude?: boolean;
  /** Existing element that receives the exclusion marker. */
  readonly children: ReactElement;
}

/** Existing placement attributes with independently declared edge geometry. */
export interface BlockDropWrapperProps extends Omit<BlockItemProps, "block"> {
  /** Vertical uses block edges, horizontal uses inline edges, grid uses all four. */
  readonly axis?: "vertical" | "horizontal" | "grid";
  /** Local CSS-pixel edge thickness; omission inherits the shared target-size token. */
  readonly targetSize?: number;
  /** Existing subtree and optional host controls rendered inside the placement. */
  readonly children?: ReactNode;
}

/** Configuration attached to an existing ordered host, with independent gap/background policies. */
export interface BlockDropLayoutOptions {
  /** Direction of the mounted child flow; grid supports wrapping rows. */
  readonly axis: "vertical" | "horizontal" | "grid";
  /** Whether physical gaps can receive insertion; omission enables linear gaps. */
  readonly gaps?: boolean;
  /** Finite nonnegative local CSS-pixel continuation distance; zero disables it, row fills the host, and omission defaults to row. */
  readonly gutterSize?: BlockDropGutterSize;
  /** Fill all remaining linear end space; false retains edge-sized continuation and background ownership. Defaults to true. */
  readonly endGaps?: boolean;
  /** Matching sibling feedback; omission inherits the editor default. */
  readonly boundaries?: BlockDropBoundaryMode;
  /** Whether mounted roots require consecutive display indices. */
  readonly virtual?: boolean;
  /** Explicit background or other regions on the existing layout host. */
  readonly regions?: readonly BlockDropRegion[];
  /** Stable child-order identity; changing it republishes mounted DOM order after commit. */
  readonly order: readonly string[];
}

/** Existing ref-forwarding layout element and its declarative flow policy. */
export interface BlockDropLayoutProps {
  /** Live flow, order, and region policy for the existing host. */
  readonly options: BlockDropLayoutOptions;
  /** Existing host forwarding its DOM element or region identity and containing the rendered items. */
  readonly children: ReactElement;
}
