/**
 * Makes cleanup idempotent and releases its captured dependencies before invocation.
 *
 * @param cleanup - Resource cleanup owned by the returned function.
 * @returns An idempotent disposer that drops its cleanup reference before invoking it
 * and propagates the first cleanup failure.
 * @throws If the cleanup fails on its first invocation.
 */
export function releaseAfterCall(cleanup: () => void): () => void {
  let pending: (() => void) | undefined = cleanup;
  return () => {
    const current = pending;
    pending = undefined;
    current?.();
  };
}
