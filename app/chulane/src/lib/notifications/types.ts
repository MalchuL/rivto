/**
 * Defines the application-owned error notification contract for Chulane.
 * Producers report unknown failures without depending on the Sonner UI adapter.
 * Implementations normalize thrown values without exposing arbitrary object data.
 */
export interface ErrorNotifications {
  /**
   * Presents a failure to the user without consuming the underlying exception.
   * @param error - Error, message, or other value thrown by an operation.
   * @returns No value; notification delivery must not throw.
   */
  error(error: unknown): void;
}
