import type { DOMEventName } from "../types";

type Assert<Value extends true> = Value;

/** Root-supported input names remain available to panel registrations. */
export type SupportsTouchStart = Assert<"touchstart" extends DOMEventName ? true : false>;
export type SupportsContextMenu = Assert<"contextmenu" extends DOMEventName ? true : false>;

/** Unsupported native-only names are not advertised as normalized inputs. */
export type RejectsUnnormalizedAnimation = Assert<
  "animationend" extends DOMEventName ? false : true
>;

it("accepts normalized touch and context-menu literals", () => {
  const names: DOMEventName[] = ["touchstart", "contextmenu"];
  expect(names).toEqual(["touchstart", "contextmenu"]);
});
