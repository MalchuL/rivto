import { resolvePrimaryModifier } from "../../keyboard/shortcut";
import type { PrimaryModifier } from "../../keyboard/types";

/**
 * Reads the browser platform for Primary shortcut matching.
 *
 * @returns Meta on Apple platforms; Ctrl when navigator is unavailable or identifies another platform.
 */
export function getBrowserPrimaryModifier(): PrimaryModifier {
  return resolvePrimaryModifier(typeof navigator === "undefined" ? "" : navigator.platform);
}
