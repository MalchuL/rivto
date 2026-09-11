/**
 * Public paste extension point and Rivto's built-in paste algorithms.
 *
 * Hosts register destination-specific strategies here without teaching core
 * about extension IDs or browser event types.
 */
export * from "./paste-strategies";
export * from "./paste-strategy-registry";
