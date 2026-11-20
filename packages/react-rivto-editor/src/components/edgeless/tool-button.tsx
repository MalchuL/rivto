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
import { editorControlProps } from "../../constants";
import { CANVAS_TOOL_ATTRIBUTE } from "@chulane/rivto-edgeless/react";
import type { EdgelessToolIcon, EdgelessToolButtonProps } from "./types";
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
import { Button } from "../ui/button";
import { Toggle } from "../ui/toggle";

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
 * kept for hosts and tests; controls.css defines the 36px square, the accent
 * hover/pressed tint, and the 22px icon or thumbnail size shared by toolbars.
 */
const TOOL_BUTTON_CLASS = "edgeless-tool-button";

/**
 * Renders one consistent accessible button for edgeless toolbars.
 *
 * @param props - Toolbar presentation attributes plus its accessible label, icon,
 * and optional pressed state.
 * @returns A ghost `Button`, or a `Toggle` when `pressed` is provided.
 */
export function EdgelessToolButton({
  label,
  icon,
  pressed,
  children,
  className,
  toolId,
  menuId,
  menuOpen,
  onActivate,
  ...button
}: EdgelessToolButtonProps) {
  const Icon =
    typeof icon === "string" && Object.prototype.hasOwnProperty.call(icons, icon)
      ? icons[icon as EdgelessToolIcon]
      : null;
  const content = (
    <>
      {Icon ? <Icon {...iconProps} /> : icon}
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
    ...(toolId === undefined ? {} : { [CANVAS_TOOL_ATTRIBUTE]: toolId }),
    ...(menuOpen === undefined
      ? {}
      : { "aria-haspopup": "dialog" as const, "aria-controls": menuId, "aria-expanded": menuOpen }),
    ...(onActivate && { onClick: () => onActivate() }),
  };
  return pressed === undefined ? (
    <Button {...editorControlProps} variant="ghost" size="icon" {...shared}>
      {content}
    </Button>
  ) : (
    <Toggle {...editorControlProps} pressed={pressed} {...shared}>
      {content}
    </Toggle>
  );
}
