import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

const buttonVariants = cva(
  "page:inline-flex page:shrink-0 page:items-center page:justify-center page:gap-2 page:rounded-md page:text-sm page:font-medium page:whitespace-nowrap page:transition-all page:outline-none page:focus-visible:border-ring page:focus-visible:ring-[3px] page:focus-visible:ring-ring/50 page:disabled:pointer-events-none page:disabled:opacity-50 page:aria-invalid:border-destructive page:aria-invalid:ring-destructive/20 page:dark:aria-invalid:ring-destructive/40 page:[&_svg]:pointer-events-none page:[&_svg]:shrink-0 page:[&_svg:not([class*=size-])]:size-4",
  {
    variants: {
      variant: {
        default: "page:bg-primary page:text-primary-foreground page:hover:bg-primary/90",
        destructive:
          "page:bg-destructive page:text-white page:hover:bg-destructive/90 page:focus-visible:ring-destructive/20 page:dark:bg-destructive/60 page:dark:focus-visible:ring-destructive/40",
        outline:
          "page:border page:bg-background page:shadow-xs page:hover:bg-accent page:hover:text-accent-foreground page:dark:border-input page:dark:bg-input/30 page:dark:hover:bg-input/50",
        secondary: "page:bg-secondary page:text-secondary-foreground page:hover:bg-secondary/80",
        ghost:
          "page:hover:bg-accent page:hover:text-accent-foreground page:dark:hover:bg-accent/50",
        link: "page:text-primary page:underline-offset-4 page:hover:underline",
      },
      size: {
        default: "page:h-9 page:px-4 page:py-2 page:has-[>svg]:px-3",
        xs: "page:h-6 page:gap-1 page:rounded-md page:px-2 page:text-xs page:has-[>svg]:px-1.5 page:[&_svg:not([class*=size-])]:size-3",
        sm: "page:h-8 page:gap-1.5 page:rounded-md page:px-3 page:has-[>svg]:px-2.5",
        lg: "page:h-10 page:rounded-md page:px-6 page:has-[>svg]:px-4",
        icon: "page:size-9",
        "icon-xs": "page:size-6 page:rounded-md page:[&_svg:not([class*=size-])]:size-3",
        "icon-sm": "page:size-8",
        "icon-lg": "page:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/** Styled shadcn primitive inputs, including its native or Radix interaction contract. */
export interface ButtonProps
  extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /** Renders through the supplied child's DOM element; false by default. */
  readonly asChild?: boolean;
}

/**
 * Renders the shadcn button primitive with package-prefixed Tailwind classes.
 *
 * Native/Radix attributes are forwarded; state remains owned by the caller.
 * The package stylesheet supplies the scoped reset and theme defaults.
 *
 * @param props - Primitive inputs, forwarded attributes, and optional class overrides.
 * @param props.className - Additional utilities merged with the default appearance.
 * @returns The styled primitive; asChild variants borrow their child's DOM element.
 * @throws Propagates Radix Slot failures when asChild receives an invalid child.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-rivto-page-ui=""
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
