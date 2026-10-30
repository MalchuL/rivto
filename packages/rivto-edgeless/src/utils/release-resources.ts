/**
 * Runs every cleanup even when an earlier resource fails to release.
 *
 * Callers supply dependency order explicitly. A single failure is rethrown unchanged;
 * multiple failures remain available through AggregateError.errors.
 *
 * @param releases - Cleanup operations in the order they must run.
 * @returns All supplied cleanup operations have run.
 * @throws The cleanup failure, or AggregateError when several cleanups fail.
 */
export function releaseResources(releases: readonly (() => void)[]): void {
  const errors: unknown[] = [];
  for (const release of releases) {
    try {
      release();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Canvas resource cleanup failed");
  }
}
