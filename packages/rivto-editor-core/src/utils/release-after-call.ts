/**
 * Releases a cleanup's captured resources before invoking it at most once.
 *
 * @param cleanup - Resource cleanup owned by the returned function.
 * @returns An idempotent disposer that propagates the first cleanup failure.
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
