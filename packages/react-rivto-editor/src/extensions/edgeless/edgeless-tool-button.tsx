import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Icon names supported by the built-in edgeless tool button. */
export type EdgelessToolIcon =
  | "align-bottom" | "align-center" | "align-left" | "align-middle"
  | "align-right" | "align-top" | "back" | "backward" | "distribute-h"
  | "distribute-v" | "draw" | "ellipse" | "forward" | "front" | "group"
  | "rectangle" | "text" | "ungroup" | "zoom-in" | "zoom-out";

const paths: Record<EdgelessToolIcon, readonly string[]> = {
  "align-bottom": ["M4 19h16", "M7 15h4V7H7zm7 0h4V4h-4z"],
  "align-center": ["M12 3v18", "M4 7h16v4H4zm3 7h10v4H7z"],
  "align-left": ["M4 3v18", "M7 6h12v4H7zm0 8h8v4H7z"],
  "align-middle": ["M3 12h18", "M7 4h4v16H7zm7 3h4v10h-4z"],
  "align-right": ["M20 3v18", "M5 6h12v4H5zm4 8h8v4H9z"],
  "align-top": ["M4 5h16", "M7 9h4v8H7zm7 0h4v11h-4z"],
  back: ["M5 7h10v10H5z", "M9 3h10v10"],
  backward: ["M6 6h11v11H6z", "M3 3h11"],
  "distribute-h": ["M4 3v18m16-18v18", "M8 7h3v10H8zm5 0h3v10h-3z"],
  "distribute-v": ["M3 4h18M3 20h18", "M7 8h10v3H7zm0 5h10v3H7z"],
  draw: ["M4 20l4-1 11-11-3-3L5 16z", "M14 7l3 3"],
  ellipse: ["M3 12c0-5 4-8 9-8s9 3 9 8-4 8-9 8-9-3-9-8z"],
  forward: ["M7 7h11v11H7z", "M4 4h11"],
  front: ["M9 7h10v10H9z", "M5 3h10v10"],
  group: ["M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"],
  rectangle: ["M4 5h16v14H4z"],
  text: ["M5 5h14M12 5v14M8 19h8"],
  ungroup: ["M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z", "M10 6h4m-8 4v4m12-4v4m-8 4h4"],
  "zoom-in": ["M10.5 4a6.5 6.5 0 100 13 6.5 6.5 0 000-13z", "M15.5 15.5L21 21M10.5 7v7m-3.5-3.5h7"],
  "zoom-out": ["M10.5 4a6.5 6.5 0 100 13 6.5 6.5 0 000-13z", "M15.5 15.5L21 21M7 10.5h7"],
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
  return (
    <button
      {...button}
      type="button"
      className={`edgeless-tool-button ${className}`.trim()}
      aria-label={label}
      title={label}
      data-edgeless-ui="true"
    >
      {icon && (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {paths[icon].map((path) => <path key={path} d={path} />)}
        </svg>
      )}
      {children}
    </button>
  );
}
