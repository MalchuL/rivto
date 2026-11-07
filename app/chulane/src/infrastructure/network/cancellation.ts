/**
 * Detaches an individual operation from shared or externally supplied async work.
 * Aborting a waiter does not cancel another client's credential refresh; the
 * service passes its own lifetime signal to the shared producer instead.
 */
/**
 * @param work - Async work that may ignore cancellation.
 * @param signal - Waiting operation lifetime.
 * @returns Work result or immediate cancellation.
 */
export function waitWithSignal<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    work
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
