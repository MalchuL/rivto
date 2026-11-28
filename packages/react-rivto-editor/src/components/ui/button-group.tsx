import type { ComponentProps } from "react";
import { cn } from "cn";

/**
 * Joins adjacent action buttons with a shared edge and keeps keyboard focus visible.
 *
 * @param props - Native group attributes and the buttons to display.
 * @param props.className - Additional styles for the group.
 * @returns A horizontal group of individually focusable buttons.
 */
export function ButtonGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="button-group"
      className={cn(
        "isolate inline-flex w-fit items-stretch rounded-md shadow-xs",
        "[&>button]:relative [&>button]:shadow-none [&>button:focus-visible]:z-10",
        "[&>button:not(:first-child)]:-ms-px [&>button:not(:first-child)]:rounded-s-none [&>button:not(:last-child)]:rounded-e-none",
        className,
      )}
      {...props}
    />
  );
}
