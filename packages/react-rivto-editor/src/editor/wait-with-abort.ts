/**
 * Waits for an operation while allowing this caller to stop waiting with an AbortSignal.
 *
 * Aborting rejects this caller's promise but does not cancel the supplied operation.
 * Other callers can continue waiting for the same document load or reference lookup.
 * The abort listener is removed when the operation settles or this caller cancels.
 *
 * @param pending - Operation to await; its lifetime is independent of this caller's signal.
 * @param signal - Optional cancellation signal. Without it, waits for the operation normally.
 * @returns The operation's result if it completes before cancellation.
 * @throws The operation's error, or the signal's reason if already aborted or cancelled while waiting.
 */
export async function waitWithAbort<Result>(pending: Promise<Result>, signal?: AbortSignal): Promise<Result> {
  if (!signal) return pending;
  signal.throwIfAborted();
  let onAbort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener("abort", onAbort, { once: true }); });
  try { return await Promise.race([pending, cancelled]); }
  finally { signal.removeEventListener("abort", onAbort); }
}
