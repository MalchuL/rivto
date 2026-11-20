/** Timing for one pointer delivery and the following two animation frames. */
export interface WrapperPointerTiming {
  /** Synchronous pointer propagation duration, in milliseconds. */
  readonly sync: number;
  /** Duration through two animation frames, in milliseconds. */
  readonly frames: number;
}

/** Window state used by the standalone wrapper pointer benchmark. */
export interface WrapperPointerTimingWindow extends Window {
  /** Current sample, or null while its frame marker is pending. */
  wrapperPointerTiming: WrapperPointerTiming | null;
}

/** Timing for wrapper creation and the following two animation frames. */
export interface WrapperMountTiming {
  /** Time from the toggle click to the wrappers appearing, in milliseconds. */
  readonly mount: number;
  /** Duration through two animation frames, in milliseconds. */
  readonly frames: number;
}

/** Window state used by the standalone wrapper mount benchmark. */
export interface WrapperMountTimingWindow extends Window {
  /** Current sample, or null while its frame marker is pending. */
  wrapperMountTiming: WrapperMountTiming | null;
}
