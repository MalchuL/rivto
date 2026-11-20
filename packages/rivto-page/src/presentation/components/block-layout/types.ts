import type { ComponentType, ReactNode } from "react";
import type { RegionIdentity } from "@chulane/rivto-root";
import type { BlockEditorNodeSnapshot, BlockListType } from "../../../adapter/types";
import type { BlockRegionEventsApi } from "../../../editor/events/types";
import type { BlockEditorTheme } from "../../block-editor-theme";
import type { BlockPresentationAttributes } from "../../types";
import type { BlockChildrenItemProps } from "./block-list";
import type {
  BlockDropBoundaryMode,
  BlockDropGutterSize,
} from "../../../editor/drag-and-drop/types";

/**
 * Installs normalized input subscriptions for one mounted block layout region.
 *
 * The callback runs after the host is committed and any layout registration
 * supplied by that host is installed. It must release any subscriptions it
 * already installed if it throws before returning cleanup.
 *
 * @param identity - Opaque identity of this mounted region.
 * @param events - Region registration borrowed from the owning editor.
 * @returns Cleanup called when the region or binding is replaced or unmounted.
 * @throws Propagates registration and cleanup failures.
 */
export type BlockLayoutInputBinding = (
  identity: RegionIdentity,
  events: Pick<BlockRegionEventsApi, "observeRegion">,
) => () => void;

/** Normalized input binding for one mounted block item. */
export type BlockItemInputBinding = BlockLayoutInputBinding;

/** Presentation and optional normalized input for one already-rendered child block. */
export interface BlockItemProps extends BlockPresentationAttributes {
  /** Native styles and the existing shared geometry/theme tokens. */
  readonly style?: BlockEditorTheme;
  /** Borrowed own-node snapshot for a decorator; omission observes the enclosing child placement. */
  readonly block?: BlockEditorNodeSnapshot;
  /** Places this block's left-top controls in row flow or outside it; omission inherits the child layout, or outside at the editor root. Descendants keep their own placement. */
  readonly controlsPlacement?: "inside" | "outside";
  /** JSX contents arranged by the owning layout; no recursive traversal is performed here. */
  readonly children?: ReactNode;
  /** Installs region input for this mounted item; keep the callback stable to avoid reconnecting. */
  readonly bindInput?: BlockItemInputBinding;
}

/** Native item geometry bound to the child supplying its list decoration. */
export interface BlockItemContentProps extends Omit<BlockItemProps, "block"> {
  readonly blockId: string;
}

/** Identity and list decoration already supplied by a snapshot owner. */
export interface BlockItemFrameProps extends BlockItemContentProps {
  readonly listType?: BlockListType;
}

/** Mounted layout roles shared by hover, selection and drop geometry. */
export type BlockLayoutRegion = "shell" | "row" | "content" | "children" | "body" | "slot" | "item";

/** Result of looking up a role within a registered layout owner. */
export interface RegisteredLayoutRegion {
  /** Whether the queried owner has an active layout registration. */
  readonly registered: boolean;
  /** Opaque element identity, absent when the registered owner omitted this role. */
  readonly identity?: RegionIdentity;
}

/** Private registration retained by the mounted-layout registry. */
export interface MountedRegion {
  readonly blockId: string;
  readonly role: BlockLayoutRegion;
  readonly identity: RegionIdentity;
}

/** Native row attributes and interior JSX, including an independently placed BlockContent. */
export interface BlockRowProps extends BlockPresentationAttributes {
  /** Native styles and the existing shared geometry/theme tokens. */
  readonly style?: BlockEditorTheme;
  /** Automatic contributions by default; manual layouts place BlockSlot explicitly. */
  readonly slots?: "automatic" | "manual";
  /** JSX contents arranged by the owning layout; no recursive traversal is performed here. */
  readonly children?: ReactNode;
  /** Installs normalized input for this mounted region; keep the callback stable to avoid reconnecting. */
  readonly bindInput?: BlockLayoutInputBinding;
}

/** Child host geometry and optional layout-owned item/control composition. */
export interface BlockChildrenProps extends BlockPresentationAttributes {
  /** Native styles and the existing shared geometry/theme tokens. */
  readonly style?: BlockEditorTheme;
  readonly item?: ComponentType<BlockChildrenItemProps>;
  /** Left-top control placement inherited by child rows and descendants; omission inherits the enclosing layout. An explicit BlockItem placement takes precedence for its own row. */
  readonly controlsPlacement?: "inside" | "outside";
  /** Whether to retain the host for an empty child list; defaults to true for custom drop regions. */
  readonly renderEmpty?: boolean;
  /** Register the retained empty child host as an inside destination; defaults to false. */
  readonly emptyDropTarget?: boolean;
  /** Enable declared physical gaps independently of item edges; grid defaults to false. */
  readonly dropGaps?: boolean;
  /** Finite nonnegative local CSS-pixel continuation distance; zero disables it, row fills the host, and omission defaults to row when gaps are enabled. */
  readonly dropGutterSize?: BlockDropGutterSize;
  /** Extend linear endpoint boundaries through all remaining free space; defaults to true. False keeps edge-sized continuation while farther space uses the declared background action. */
  readonly dropEndGaps?: boolean;
  /** Matching sibling feedback; omission inherits the editor default. */
  readonly dropBoundaries?: BlockDropBoundaryMode;
  /** Append on unoccupied background, including filtered lists; defaults to false. */
  readonly dropBackground?: boolean;
  /** Whether this host bounds row hover; defaults to true. Outline layouts opt into inherited width. */
  readonly hoverBoundary?: boolean;
  /** Flow for declared insertion regions; defaults to vertical, grid items own their placement edges. */
  readonly dropAxis?: "vertical" | "horizontal" | "grid";
  /** Inherited inset edge thickness in local CSS pixels; omission preserves the theme token. */
  readonly targetSize?: number;
  /** Outline declares depth bands; siblings keeps each region at this parent. Defaults to outline. */
  readonly dropPlacement?: "outline" | "siblings";
  /** Local (default) keeps the owner's outer boundaries at its sibling level. Outline continues ordinary nesting depth through the owner. Body drops and depth choices within this list remain independent. */
  readonly dropScope?: "local" | "outline";
  /** Optional non-block JSX appended after mapped children, such as an add-column button. */
  readonly children?: ReactNode;
  /** Installs normalized input for this mounted region; keep the callback stable to avoid reconnecting. */
  readonly bindInput?: BlockLayoutInputBinding;
}

/** Structural container inputs; layout contents are composed by the registered block layout. */
export interface BlockViewProps extends BlockPresentationAttributes {
  /** Immutable own fields reflected in protected DOM attributes. */
  readonly block: BlockEditorNodeSnapshot;
  /** Whole-block selection; omitted/false removes the selection marker. */
  readonly selected?: boolean;
  /** Ordinary styles, common background override, and inherited layout/theme parameters. */
  readonly style?: BlockEditorTheme;
  /** Installs normalized input for this mounted shell; keep the callback stable to avoid reconnecting. */
  readonly bindInput?: BlockLayoutInputBinding;
}
