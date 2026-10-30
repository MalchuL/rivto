import { Separator } from "../ui/separator";

const DIVIDER_CLASS = "edgeless-tool-bar-divider";

/**
 * Renders the thin vertical rule that separates groups of toolbar buttons.
 *
 * @returns A decorative vertical shadcn `Separator`.
 */
export function ToolBarDivider() {
  return <Separator orientation="vertical" className={DIVIDER_CLASS} />;
}
