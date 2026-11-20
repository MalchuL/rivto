import type { RegionIdentity } from "@chulane/rivto-root";
import type { CSSProperties, RefObject } from "react";

/** Mounting and geometry values for one positioned edgeless element. */
export interface EdgelessElementStyle<Host extends HTMLElement = HTMLElement> {
  /**
   * Captures or releases the positioned host's opaque identity during React mounting.
   *
   * @param host - Mounted host, or null when React releases it.
   * @returns The identity ref reflects the current host.
   */
  ref(host: Host | null): void;
  /** Opaque identity of the mounted host, or undefined while unmounted. */
  readonly identity: RefObject<RegionIdentity | undefined>;
  /** Current positioned style, or undefined when the element is missing. */
  readonly style: CSSProperties | undefined;
}
