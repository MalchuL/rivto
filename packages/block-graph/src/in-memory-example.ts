/**
 * Runnable in-memory example for block graph integration.
 * It demonstrates host subscriptions, undirected property sync, directed value
 * flow, and independent slot flow without depending on the Rivto document model.
 */
import { BlockGraph, blockPropertyId, type BlockPropertyAddress, type BlockValueHost, type PropagationContext } from "./index";

/** Runs the headless block graph example and returns its final values and calls. */
export async function runInMemoryExample(): Promise<{ title: unknown; mirror: unknown; calls: unknown[] }> {
  const values = new Map<string, unknown>();
  const listeners = new Map<string, Set<(value: unknown, context?: PropagationContext) => void>>();
  const key = (address: BlockPropertyAddress) => blockPropertyId(address);
  const host: BlockValueHost = {
    read: (address) => values.get(key(address)),
    write: (address, value, context) => {
      values.set(key(address), value);
      listeners.get(key(address))?.forEach((listener) => listener(value, context));
    },
    subscribe: (address, listener) => {
      const id = key(address);
      const current = listeners.get(id) ?? new Set();
      current.add(listener);
      listeners.set(id, current);
      return () => current.delete(listener);
    },
  };
  const graph = new BlockGraph(host);
  const title = { blockId: "a", field: "props", key: "title" } as const;
  const mirror = { blockId: "b", field: "props", key: "title" } as const;
  const output = { blockId: "c", field: "content" } as const;
  const calls: unknown[] = [];
  graph.registerProperty("title", title);
  graph.registerProperty("mirror", mirror);
  graph.registerProperty("output", output);
  graph.registerSlot("start", "start-block", (payload, context) => context.emit("next", payload));
  graph.registerSlot("finish", "finish-block", (payload) => calls.push(payload));
  graph.runtime.connect({ id: "sync", kind: "undirected-value", endpoints: ["title", "mirror"] });
  graph.runtime.connect({ id: "copy", kind: "directed-value", from: "mirror", to: "output" });
  graph.runtime.connect({ id: "call", kind: "slot-flow", from: { slotId: "start", output: "next" }, to: "finish" });
  graph.runtime.enable();
  values.set(key(title), "Hello");
  await graph.runtime.publishValue("title", "Hello");
  await graph.runtime.invokeSlot("start", 42);
  return { title: values.get(key(title)), mirror: values.get(key(mirror)), calls };
}
