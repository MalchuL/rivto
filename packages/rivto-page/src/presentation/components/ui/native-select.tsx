import * as React from "react";
import { cn } from "cn";
import { ChevronDownIcon } from "lucide-react";

/** Forwarded native select inputs and shadcn appearance options. */
export interface NativeSelectProps extends Omit<React.ComponentProps<"select">, "size"> {
  /** Visual field size, independent of the native select row-count attribute. */
  readonly size?: "sm" | "default";
}

/**
 * Renders the shadcn native select with package-prefixed Tailwind classes.
 *
 * Native selection, keyboard behavior, and events remain available.
 *
 * @param props - Native attributes and optional appearance overrides.
 * @param props.className - Utilities merged with the primitive defaults.
 * @returns A styled select with its decorative arrow wrapper.
 */
function NativeSelect({ className, size = "default", ...props }: NativeSelectProps) {
  return (
    <div
      className="page:group/native-select page:relative page:w-fit page:has-[select:disabled]:opacity-50"
      data-rivto-page-ui=""
      data-slot="native-select-wrapper"
    >
      <select
        data-rivto-page-ui=""
        data-slot="native-select"
        data-size={size}
        className={cn(
          "page:h-9 page:w-full page:min-w-0 page:appearance-none page:rounded-md page:border page:border-input page:bg-transparent page:px-3 page:py-2 page:pr-9 page:text-sm page:shadow-xs page:transition-[color,box-shadow] page:outline-none page:selection:bg-primary page:selection:text-primary-foreground page:placeholder:text-muted-foreground page:disabled:pointer-events-none page:disabled:cursor-not-allowed page:data-[size=sm]:h-8 page:data-[size=sm]:py-1 page:dark:bg-input/30 page:dark:hover:bg-input/50",
          "page:focus-visible:border-ring page:focus-visible:ring-[3px] page:focus-visible:ring-ring/50",
          "page:aria-invalid:border-destructive page:aria-invalid:ring-destructive/20 page:dark:aria-invalid:ring-destructive/40",
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        className="page:pointer-events-none page:absolute page:top-1/2 page:right-3.5 page:size-4 page:-translate-y-1/2 page:text-muted-foreground page:opacity-50 page:select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

/** Forwarded native option inputs and shadcn appearance options. */
export type NativeSelectOptionProps = React.ComponentProps<"option">;

/**
 * Renders the shadcn native option with package-prefixed Tailwind classes.
 *
 * Native selection, keyboard behavior, and events remain available.
 *
 * @param props - Native attributes and optional appearance overrides.
 * @param props.className - Utilities merged with the primitive defaults.
 * @returns A styled option element.
 */
function NativeSelectOption({ className, ...props }: NativeSelectOptionProps) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("page:bg-[Canvas] page:text-[CanvasText]", className)}
      {...props}
    />
  );
}

/** Forwarded native optgroup inputs and shadcn appearance options. */
export type NativeSelectOptGroupProps = React.ComponentProps<"optgroup">;

/**
 * Renders the shadcn native optgroup with package-prefixed Tailwind classes.
 *
 * Native selection, keyboard behavior, and events remain available.
 *
 * @param props - Native attributes and optional appearance overrides.
 * @param props.className - Utilities merged with the primitive defaults.
 * @returns A styled optgroup element.
 */
function NativeSelectOptGroup({ className, ...props }: NativeSelectOptGroupProps) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("page:bg-[Canvas] page:text-[CanvasText]", className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
