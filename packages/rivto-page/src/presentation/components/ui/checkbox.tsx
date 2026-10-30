import * as React from "react";
import { cn } from "cn";
import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

/** Styled shadcn primitive inputs, including its native or Radix interaction contract. */
export type CheckboxProps = React.ComponentProps<typeof CheckboxPrimitive.Root>;

/**
 * Renders the shadcn checkbox primitive with package-prefixed Tailwind classes.
 *
 * Native/Radix attributes are forwarded; state remains owned by the caller.
 * The package stylesheet supplies the scoped reset and theme defaults.
 *
 * @param props - Primitive inputs, forwarded attributes, and optional class overrides.
 * @param props.className - Additional utilities merged with the default appearance.
 * @returns A Radix checkbox button and its checked indicator; checked state belongs to the caller.
 */
function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-rivto-page-ui=""
      data-slot="checkbox"
      className={cn(
        "page:peer page:size-4 page:shrink-0 page:rounded-[4px] page:border page:border-input page:shadow-xs page:transition-shadow page:outline-none page:focus-visible:border-ring page:focus-visible:ring-[3px] page:focus-visible:ring-ring/50 page:disabled:cursor-not-allowed page:disabled:opacity-50 page:aria-invalid:border-destructive page:aria-invalid:ring-destructive/20 page:data-[state=checked]:border-primary page:data-[state=checked]:bg-primary page:data-[state=checked]:text-primary-foreground page:dark:bg-input/30 page:dark:aria-invalid:ring-destructive/40 page:dark:data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="page:grid page:place-content-center page:text-current page:transition-none"
      >
        <CheckIcon className="page:size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
