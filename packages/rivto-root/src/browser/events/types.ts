import type { BrowserListenerControl, BrowserRoutedEventDefinition } from "../../events/types";

/** Browser-free cancellation and identity borrowed only during synchronous delivery. */
export interface BrowserRoutedDelivery<EventValue> {
  readonly event: EventValue;
  readonly identity: object;
  readonly control: BrowserListenerControl;
}

/** One registered browser handler owned by the routed event runtime. */
export interface BrowserRoutedEntry {
  readonly definition: BrowserRoutedEventDefinition;
  /**
   * Removes this handler from retained dispatch snapshots.
   *
   * @returns The handler is no longer eligible for delivery.
   */
  readonly release: () => void;
  active: boolean;
}
