import * as React from "react";
import { cn } from "cn";

/** Forwarded native textarea inputs and optional utility overrides. */
export type TextareaProps = React.ComponentProps<"textarea">;

/**
 * Renders a shadcn textarea while keeping native editing and change events.
 *
 * @param props - Native textarea attributes, events, and optional utility overrides.
 * @param props.className - Utilities merged with the default field appearance.
 * @returns A textarea styled by the package stylesheet.
 */
function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      data-rivto-page-ui=""
      data-slot="textarea"
      className={cn(
        "page:flex page:field-sizing-content page:min-h-16 page:w-full page:rounded-md page:border page:border-input page:bg-transparent page:px-3 page:py-2 page:text-base page:shadow-xs page:transition-[color,box-shadow] page:outline-none page:placeholder:text-muted-foreground page:focus-visible:border-ring page:focus-visible:ring-[3px] page:focus-visible:ring-ring/50 page:disabled:cursor-not-allowed page:disabled:opacity-50 page:aria-invalid:border-destructive page:aria-invalid:ring-destructive/20 page:md:text-sm page:dark:bg-input/30 page:dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
