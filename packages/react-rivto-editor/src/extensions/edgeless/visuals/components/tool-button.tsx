/**
 * Icon button shared by every piece of edgeless chrome: the create toolbar,
 * category popovers, the selection toolbar, zoom controls, and property panel
 * actions.
 *
 * The component maps a small icon vocabulary onto lucide-react and renders
 * either a shadcn `Toggle` (when the caller owns a pressed state, so the DOM
 * exposes `aria-pressed`) or a ghost shadcn `Button`. Every instance carries
 * `data-edgeless-ui` so canvas pointer handlers can ignore chrome hits, and an
 * accessible label that doubles as the native tooltip.
 */
import type { ComponentProps, ReactNode } from "react";
import { cn } from "cn";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpRight,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Circle,
  CornerDownRight,
  Eraser,
  Grid3x3,
  Group,
  Hand,
  Highlighter,
  Magnet,
  MousePointer2,
  MoveHorizontal,
  MoveVertical,
  PenLine,
  Pencil,
  Spline,
  Square,
  StickyNote,
  Type,
  Ungroup,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { Toggle } from "../../../../components/ui/toggle";

/** Icon names supported by the built-in edgeless tool button. */
export type EdgelessToolIcon =
  | "align-bottom" | "align-center" | "align-left" | "align-middle"
  | "align-right" | "align-top" | "back" | "backward" | "distribute-h"
  | "distribute-v" | "draw" | "ellipse" | "forward" | "front" | "group"
  | "connector" | "connector-curve" | "connector-orthogonal" | "connector-straight"
  | "align-objects" | "chevron-down" | "chevron-up" | "close" | "eraser" | "marker" | "pan" | "pen" | "pencil" | "rectangle" | "select" | "snap" | "sticker" | "text"
  | "ungroup" | "zoom-in" | "zoom-out";

const icons: Record<EdgelessToolIcon, LucideIcon> = {
  "align-bottom": AlignEndHorizontal,
  "align-center": AlignCenterVertical,
  "align-left": AlignStartVertical,
  "align-middle": AlignCenterHorizontal,
  "align-objects": Magnet,
  "align-right": AlignEndVertical,
  "align-top": AlignStartHorizontal,
  // Excalidraw/Tabler pattern: step = plain arrow; extreme = arrow to a bar.
  front: ArrowUpToLine,
  forward: ArrowUp,
  backward: ArrowDown,
  back: ArrowDownToLine,
  "chevron-down": ChevronDown,
  "chevron-up": ChevronUp,
  close: X,
  "distribute-h": MoveHorizontal,
  "distribute-v": MoveVertical,
  draw: Pencil,
  pencil: Pencil,
  pen: PenLine,
  marker: Highlighter,
  connector: ArrowUpRight,
  "connector-straight": ArrowUpRight,
  "connector-orthogonal": CornerDownRight,
  "connector-curve": Spline,
  eraser: Eraser,
  ellipse: Circle,
  group: Group,
  pan: Hand,
  rectangle: Square,
  select: MousePointer2,
  snap: Grid3x3,
  sticker: StickyNote,
  text: Type,
  ungroup: Ungroup,
  "zoom-in": ZoomIn,
  "zoom-out": ZoomOut,
};

const iconProps: LucideProps = {
  size: 22,
  strokeWidth: 1.8,
  "aria-hidden": true,
};

/**
 * Shared appearance for every tool button. The `edgeless-tool-button` hook is
 * kept for hosts and tests; the utilities give the 36px square, the accent
 * hover/pressed tint, and the 22px icon or thumbnail size shared by toolbars.
 */
const TOOL_BUTTON_CLASS =
  "edgeless-tool-button size-9 min-w-9 shrink-0 rounded-lg p-0 text-xs font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground data-[state=on]:bg-accent data-[state=on]:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40 [&_svg:not([class*='size-'])]:size-[22px] [&_img]:size-[22px] [&_img]:rounded-sm [&_img]:object-contain";

/** Props accepted by {@link EdgelessToolButton}. */
export type EdgelessToolButtonProps = Omit<ComponentProps<"button">, "children"> & {
  /** Accessible name; also shown as the native tooltip. */
  readonly label: string;
  /** Built-in icon rendered before any children. */
  readonly icon?: EdgelessToolIcon;
  /**
   * Pressed state for tools and toggles. When provided the button renders as a
   * shadcn `Toggle` and exposes `aria-pressed`; the caller keeps ownership of
   * the state and updates it through editor commands.
   */
  readonly pressed?: boolean;
  /** Extra content such as a zoom percentage, preset label, or swatch. */
  readonly children?: ReactNode;
};

/**
 * Renders one consistent accessible button for edgeless toolbars.
 *
 * @param props - Native button attributes plus its accessible label, icon,
 * and optional pressed state.
 * @returns A ghost `Button`, or a `Toggle` when `pressed` is provided.
 */
export function EdgelessToolButton({
  label,
  icon,
  pressed,
  children,
  className,
  ...button
}: EdgelessToolButtonProps) {
  const Icon = icon ? icons[icon] : null;
  const content = (
    <>
      {Icon && <Icon {...iconProps} />}
      {children}
    </>
  );
  const shared = {
    ...button,
    type: "button" as const,
    className: cn(TOOL_BUTTON_CLASS, className),
    "aria-label": label,
    title: label,
    "data-edgeless-ui": "true",
  };
  return pressed === undefined ? (
    <Button variant="ghost" size="icon" {...shared}>
      {content}
    </Button>
  ) : (
    <Toggle pressed={pressed} {...shared}>
      {content}
    </Toggle>
  );
}
