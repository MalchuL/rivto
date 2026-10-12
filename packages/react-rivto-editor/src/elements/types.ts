

/**
 * Inclusive document-order boundaries rendered by one edgeless block element.
 *
 * The range is resolved from current root order instead of persisting every ID.
 * Therefore blocks inserted between the boundaries, including empty roots,
 * automatically become part of the same canvas card.
 */
export interface BlockElementProps {
  readonly [key: string]: unknown;
  /** First root rendered by the card. */
  readonly startBlockId: string;
  /** Last root rendered by the card. */
  readonly endBlockId: string;
  /** Missing/true fits the card height to all rendered blocks; false keeps a fixed frame. */
  readonly autoHeight?: boolean;
  /** Clockwise canvas rotation in degrees; omitted values render without rotation. */
  readonly rotation?: number;
}
