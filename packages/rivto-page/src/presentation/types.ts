import type { ButtonHTMLAttributes, DOMAttributes, HTMLAttributes } from "react";

/** Presentation attributes without native React event callbacks. */
export type BlockPresentationAttributes = Omit<
  HTMLAttributes<never>,
  Exclude<keyof DOMAttributes<never>, "children" | "dangerouslySetInnerHTML">
>;

/** Button presentation attributes without native React event callbacks. */
export type BlockButtonPresentationAttributes = Omit<
  ButtonHTMLAttributes<never>,
  Exclude<keyof DOMAttributes<never>, "children" | "dangerouslySetInnerHTML">
>;
