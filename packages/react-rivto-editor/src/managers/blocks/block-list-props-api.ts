import type { BlockListPropsManagerApi, ListPropsRegistration } from "@chulane/rivto";

/** Core list-property policy whose registrations are owned by the active React extension. */
export type BlockListPropsRegistration = ListPropsRegistration;

/**
 * Exposes core property defaults and validation through the React extension lifecycle.
 *
 * Registration returns a disposer owned by the active extension. Destroying the
 * React manager releases its registrations while caller-owned core policies remain installed.
 */
export type BlockListPropsApi = BlockListPropsManagerApi;
