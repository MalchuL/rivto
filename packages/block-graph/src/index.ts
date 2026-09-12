/**
 * Block-oriented bindings for `@chulane/graph-runtime`.
 * This package defines portable block addresses and a minimal host contract;
 * document, editor, React, and persistence adapters remain separate concerns.
 */
import {
  GraphRuntime,
  type PropagationContext,
  type SlotHandler,
  type ValueBinding,
} from "@chulane/graph-runtime";

export * from "@chulane/graph-runtime";

/** A graph-addressable top-level block value. */
export type BlockPropertyAddress =
  | { blockId: string; field: "content" }
  | { blockId: string; field: "props"; key: string }
  | { blockId: string; field: "pluginData"; namespace: string };

/** Storage operations supplied by an eventual document or application adapter. */
export interface BlockValueHost {
  read(address: BlockPropertyAddress): unknown;
  write(address: BlockPropertyAddress, value: unknown, context: PropagationContext): void | boolean | Promise<void | boolean>;
  subscribe?(address: BlockPropertyAddress, listener: (value: unknown, context?: PropagationContext) => void): () => void;
}

/** Optional registration behavior for one block property. */
export interface BlockPropertyOptions {
  equals?: ValueBinding["equals"];
}

/** Adapts block property addresses and slots to the generic graph runtime. */
export class BlockGraph {
  /** The generic runtime used to connect, execute, and snapshot endpoints. */
  readonly runtime: GraphRuntime;

  /** Creates a block graph over one host and optional shared runtime. */
  constructor(private readonly host: BlockValueHost, runtime = new GraphRuntime()) {
    this.runtime = runtime;
  }

  /** Registers one block property and returns its cleanup function. */
  registerProperty(endpointId: string, address: BlockPropertyAddress, options: BlockPropertyOptions = {}): () => void {
    const binding: ValueBinding = {
      get: () => this.host.read(address),
      set: (value, context) => this.host.write(address, value, context),
      equals: options.equals,
      subscribe: this.host.subscribe
        ? (listener) => this.host.subscribe!(address, listener)
        : undefined,
    };
    return this.runtime.registerValue({ id: endpointId, nodeId: address.blockId }, binding);
  }

  /** Registers one callable slot owned by a block. */
  registerSlot(endpointId: string, blockId: string, handler: SlotHandler): () => void {
    return this.runtime.registerSlot({ id: endpointId, nodeId: blockId }, handler);
  }
}

/** Builds a stable endpoint ID for a block property address. */
export function blockPropertyId(address: BlockPropertyAddress): string {
  const parts = address.field === "content"
    ? [address.blockId, address.field]
    : [address.blockId, address.field, address.field === "props" ? address.key : address.namespace];
  return `block:${parts.map(encodeURIComponent).join(":")}`;
}

export { runInMemoryExample } from "./in-memory-example";
