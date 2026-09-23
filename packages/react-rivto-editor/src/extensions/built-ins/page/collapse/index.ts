/**
 * Public entry point for page block collapse behavior.
 *
 * Applications usually install this through `collapseExtension` or
 * `standardPreset`. `syncView: false` keeps the open editor's expand/collapse
 * state stable while `listProps.collapsed` continues to replicate.
 *
 * @module
 */
export { registerCollapse } from "./register";
export type { CollapseExtensionOptions } from "./register";
