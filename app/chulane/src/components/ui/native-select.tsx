/**
 * Presents native selection controls styled by the shared shadcn theme.
 * Initialized through the shadcn CLI; preserves primitive behavior while owning
 * component-specific class constants for application forms in both hosts.
 */
import * as React from "react"
import { cn } from "cn"
import { ChevronDownIcon } from "lucide-react"

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default"
}

const selectClasses = "h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm transition-colors outline-none select-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-[size=sm]:py-0.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40";
const iconClasses = "pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground select-none";
const wrapperClasses = "group/native-select relative w-fit has-[select:disabled]:opacity-50";
const optionClasses = "bg-[Canvas] text-[CanvasText]";

/**
 * Renders the NativeSelect primitive without changing native form behavior.
 * @param props - Native control properties and optional additional classes.
 * @returns The themed form primitive.
 */
function NativeSelect({
  className,
  size = "default",
  ...props
}: NativeSelectProps) {
  return (
    <div
      className={cn(wrapperClasses,
        className
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={selectClasses}
        {...props}
      />
      <ChevronDownIcon className={iconClasses} aria-hidden="true" data-slot="native-select-icon" />
    </div>
  )
}

/**
 * Renders the NativeSelectOption primitive without changing native form behavior.
 * @param props - Native control properties and optional additional classes.
 * @returns The themed form primitive.
 */
function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn(optionClasses, className)}
      {...props}
    />
  )
}

/**
 * Renders the NativeSelectOptGroup primitive without changing native form behavior.
 * @param props - Native control properties and optional additional classes.
 * @returns The themed form primitive.
 */
function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn(optionClasses, className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
