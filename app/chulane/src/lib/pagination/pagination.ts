/**
 * Defines offset pagination shared by application service listings.
 * Supplied bounds are nonnegative safe integers; zero limit yields an empty page.
 * Omitting pagination preserves the complete ordered result. Adapters apply
 * bounds after access filtering and retain each listing's stable ordering.
 */
import { DomainError } from "../../domain/workspaces/access.ts";
import type { Pagination } from "./types.ts";

/**
 * Rejects invalid bounds before storage adapters execute a listing.
 * @param pagination - Requested bounds, or undefined for the complete list.
 * @returns No value when valid; otherwise throws an invalid-input domain error.
 */
export function assertPagination(pagination: Pagination | undefined): void {
  if (pagination === undefined) return;
  if (pagination === null || !Number.isSafeInteger(pagination.limit) || pagination.limit < 0
    || !Number.isSafeInteger(pagination.offset) || pagination.offset < 0) {
    throw new DomainError("invalid", "Pagination limit and offset must be nonnegative safe integers.");
  }
}
