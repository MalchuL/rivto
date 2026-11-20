import type { CSSProperties } from "react";

/** DOM styles accept named CSS interfaces and inline CSS custom properties. */
export type BlockCssProperties =
  CSSProperties | (CSSProperties & { readonly [key: `--${string}`]: string | number | undefined });
