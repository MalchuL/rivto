

/** Presentation-only limits for the page's root-block window. */
export interface PageVirtualizationSettings {
  readonly threshold: boolean | number;
  readonly overscan: number;
}
