/**
 * Public contracts and components for the optional edgeless React surface.
 *
 * Surface rendering and host-owned snapping state live together in this module;
 * extensions configure them and install optional interactions, while generic
 * persisted block-element projection remains in `elements`.
 *
 * @module
 */
export * from "./edgeless-surface";
export { EdgelessSnappingStore } from "@chulane/rivto-edgeless";
export type { EdgelessSnappingSnapshot, EdgelessSurfaceOptions } from "./types";
