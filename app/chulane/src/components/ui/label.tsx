/**
 * Presents the shared shadcn label linked to its native form control.
 * Initialized through the shadcn CLI; preserves primitive behavior while owning
 * component-specific class constants for application forms in both hosts.
 */
"use client"

import * as React from "react"
import { cn } from "cn"
import { Label as LabelPrimitive } from "radix-ui"

const labelClasses = "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50";

/**
 * Renders the Label primitive without changing native form behavior.
 * @param props - Native control properties and optional additional classes.
 * @returns The themed form primitive.
 */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(labelClasses,
        className
      )}
      {...props}
    />
  )
}

export { Label }
