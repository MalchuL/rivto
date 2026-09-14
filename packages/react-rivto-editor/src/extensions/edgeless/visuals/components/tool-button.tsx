import type { ButtonHTMLAttributes, ReactNode } from "react";
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
 * Renders one consistent accessible button for edgeless toolbars.
 *
 * @param props - Native button attributes plus its accessible label and icon.
 * @returns A styled icon or compact-label button.
 */
export function EdgelessToolButton({
  label,
  icon,
  children,
  className = "",
  ...button
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly label: string;
  readonly icon?: EdgelessToolIcon;
  readonly children?: ReactNode;
}) {
  const Icon = icon ? icons[icon] : null;
  return (
    <button
      {...button}
      type="button"
      className={`edgeless-tool-button ${className}`.trim()}
      aria-label={label}
      title={label}
      data-edgeless-ui="true"
    >
      {Icon && <Icon {...iconProps} />}
      {children}
    </button>
  );
}
