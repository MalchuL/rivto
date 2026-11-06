import * as React from "react";
import { cn } from "cn";
import { CheckIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { useAnimationDuration } from "../../hooks/editor/use-animation-duration";

/**
 * Renders a Radix checkbox with an animated check indicator.
 *
 * Controlled and uncontrolled values follow Radix's change callbacks; the
 * indicator remains mounted so both checking and unchecking can transition.
 *
 * @param props - Radix checkbox properties and optional styling.
 * @returns An accessible checkbox with immediate state and focus updates.
 */
function Checkbox({
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  const [uncontrolledChecked, setUncontrolledChecked] = React.useState(defaultChecked ?? false);
  const reducedMotion = useReducedMotion();
  const duration = useAnimationDuration("checkbox");
  const visible = (checked ?? uncontrolledChecked) !== false;
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={(value) => {
        if (checked === undefined) {
          setUncontrolledChecked(value);
        }
        onCheckedChange?.(value);
      }}
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        forceMount
        className="grid place-content-center text-current transition-none"
      >
        <motion.span
          className="inline-flex"
          initial={false}
          animate={{ opacity: visible ? 1 : 0, scale: visible || reducedMotion ? 1 : 0.8 }}
          transition={{
            duration: reducedMotion ? duration / 2 : duration,
            ease: [0.23, 1, 0.32, 1],
          }}
        >
          <CheckIcon className="size-3.5" />
        </motion.span>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
