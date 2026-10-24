import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

const badgeVariants = cva(
  "page:inline-flex page:w-fit page:shrink-0 page:items-center page:justify-center page:gap-1 page:overflow-hidden page:rounded-full page:border page:border-transparent page:px-2 page:py-0.5 page:text-xs page:font-medium page:whitespace-nowrap page:transition-[color,box-shadow] page:focus-visible:border-ring page:focus-visible:ring-[3px] page:focus-visible:ring-ring/50 page:aria-invalid:border-destructive page:aria-invalid:ring-destructive/20 page:dark:aria-invalid:ring-destructive/40 page:[&>svg]:pointer-events-none page:[&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "page:bg-primary page:text-primary-foreground page:[a&]:hover:bg-primary/90",
        secondary:
          "page:bg-secondary page:text-secondary-foreground page:[a&]:hover:bg-secondary/90",
        destructive:
          "page:bg-destructive page:text-white page:focus-visible:ring-destructive/20 page:dark:bg-destructive/60 page:dark:focus-visible:ring-destructive/40 page:[a&]:hover:bg-destructive/90",
        outline:
          "page:border-border page:text-foreground page:[a&]:hover:bg-accent page:[a&]:hover:text-accent-foreground",
        ghost: "page:[a&]:hover:bg-accent page:[a&]:hover:text-accent-foreground",
        link: "page:text-primary page:underline-offset-4 page:[a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/** Styled shadcn primitive inputs, including its native or Radix interaction contract. */
export interface BadgeProps
  extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {
  /** Renders through the supplied child's DOM element; false by default. */
  readonly asChild?: boolean;
}

/**
 * Renders the shadcn badge primitive with package-prefixed Tailwind classes.
 *
 * Native/Radix attributes are forwarded; state remains owned by the caller.
 * The package stylesheet supplies the scoped reset and theme defaults.
 *
 * @param props - Primitive inputs, forwarded attributes, and optional class overrides.
 * @param props.className - Additional utilities merged with the default appearance.
 * @returns The styled primitive; asChild variants borrow their child's DOM element.
 * @throws Propagates Radix Slot failures when asChild receives an invalid child.
 */
function Badge({ className, variant = "default", asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-rivto-page-ui=""
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
