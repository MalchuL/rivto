/** Tests block address binding independently from the Rivto document model. */
import { BlockGraph, blockPropertyId, runInMemoryExample } from "./index";

describe("BlockGraph", () => {
  test("formats supported top-level block addresses", () => {
    expect(blockPropertyId({ blockId: "a", field: "content" })).toBe("block:a:content");
    expect(blockPropertyId({ blockId: "a", field: "props", key: "x:y" })).toBe("block:a:props:x%3Ay");
    expect(blockPropertyId({ blockId: "a", field: "pluginData", namespace: "graph" })).toBe("block:a:pluginData:graph");
  });

  test("runs the in-memory value and slot example", async () => {
    const result = await runInMemoryExample();
    expect(result).toEqual({ title: "Hello", mirror: "Hello", calls: [42] });
  });

  test("supports a host without subscriptions", () => {
    const values = new Map<string, unknown>();
    const graph = new BlockGraph({
      read: (address) => values.get(blockPropertyId(address)),
      write: (address, value) => { values.set(blockPropertyId(address), value); },
    });
    expect(graph.registerProperty("content", { blockId: "a", field: "content" })).toEqual(expect.any(Function));
  });
});
