/** Optional animation durations in seconds; zero or omission disables the animation. */
export interface BlockAnimationDurations {
  /** Fade applied to descendants when a collapsed block expands. */
  readonly blockExpand?: number;
  /** Fade applied to mounted block subtrees added to a root or child list. */
  readonly blockInsert?: number;
}
