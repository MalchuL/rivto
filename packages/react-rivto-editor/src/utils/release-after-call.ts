/**
 * Makes cleanup idempotent and releases its captured dependencies after invocation.
 *
 * @param cleanup - Cleanup to invoke at most once.
 * @returns A disposer that drops its reference before invoking the cleanup.
 * @throws If the supplied cleanup throws on its first invocation.
 */
export function releaseAfterCall(cleanup: () => void): () => void {
  let pending: (() => void) | undefined = cleanup;
  return () => {
    const current = pending;
    pending = undefined;
    current?.();
  };
}
