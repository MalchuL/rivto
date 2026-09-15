/**
 * Adapts block property hosts and block-owned slots to the generic runtime.
 * Address shapes and host contracts live in focused neighboring modules.
 */
import {
  GraphRuntime,
  type SlotHandler,
  type ValueBinding,
} from "@chulane/graph-runtime";
import type { BlockPropertyAddress } from "./addresses";
import type { BlockPropertyOptions, BlockValueHost } from "./host";

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
