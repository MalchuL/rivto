/**
 * Defines offset pagination shared by application service listings.
 * Bounds are nonnegative safe integers applied after access filtering, with
 * zero limit yielding an empty page and omitted pagination returning all rows.
 */
export interface Pagination {
  limit: number;
  offset: number;
}
