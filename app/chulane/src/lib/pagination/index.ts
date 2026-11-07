/**
 * Exposes the shared pagination contract and validation through one public entry.
 * Validation remains in pagination.ts and contracts in types.ts; this module re-exports their API.
 */
export { assertPagination } from "./pagination.ts";
export type { Pagination } from "./types.ts";
