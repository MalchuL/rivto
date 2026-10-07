import { BroadcastChannelProvider, YjsDocumentRegistry, type Provider } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "../document-model";
import type { DocumentModel } from "../types";
import { DocumentStorage } from "../document-storage";

async function eventually(assertion: () => void): Promise<void> {
  const start = Date.now();
  for (;;) {
    try { assertion(); return; }
    catch (error) {
      if (Date.now() - start > 1500) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

describe("host document storage", () => {
  test("transfers model ownership to the caller and loads only requested identities", async () => {
    const registry = new YjsDocumentRegistry(crypto.randomUUID());
    const disconnect = jest.fn(async () => undefined);
    const storage = new DocumentStorage({ registry, createProviders: (id) => [{ id, connect: async () => undefined, disconnect }] });
    await expect(storage.openDocument("unknown")).rejects.toThrow("Unknown document");
    storage.registerDocument("unused");
    const created = await storage.create("source", [{ id: "target", type: "paragraph", content: "session text" }]);
    expect(created.blocks.getBlockNode("target")?.content).toBe("session text");
    expect(registry.getDocumentIds().sort()).toEqual(["source", "unused"]);
    expect(disconnect).not.toHaveBeenCalled();
    await created.destroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
    const fresh = await storage.openDocument("source");
    expect(fresh).not.toBe(created);
    expect(fresh.blocks.hasBlock("target")).toBe(false);
    await fresh.destroy(); await storage.destroy(); await storage.destroy();
    expect(disconnect).toHaveBeenCalledTimes(3);
    await expect(storage.openDocument("source")).rejects.toThrow("destroyed");
  });

  test("cleans partial provider failure before retrying", async () => {
    const registry = new YjsDocumentRegistry(crypto.randomUUID());
    registry.registerDocument("source");
    let fail = true;
    const disconnect = jest.fn(async () => undefined);
    const onError = jest.fn();
    const storage = new DocumentStorage({ registry, onError, createProviders: (channel): Provider[] => [
      { id: `${channel}:first`, connect: async () => undefined, disconnect },
      { id: `${channel}:second`, connect: async (doc) => { if (doc.id === "source" && fail) throw new Error("connection failure"); }, disconnect },
    ] });
    await expect(storage.openDocument("source")).rejects.toThrow("connection failure");
    await eventually(() => expect(disconnect).toHaveBeenCalledTimes(1));
    fail = false;
    const recovered = await storage.openDocument("source");
    await recovered.destroy(); await storage.destroy();
    expect(disconnect).toHaveBeenCalledTimes(5);
  });

  test("shutdown during a pending load destroys its connection and rejects the waiting consumer", async () => {
    const registry = new YjsDocumentRegistry(crypto.randomUUID());
    registry.registerDocument("source");
    let finish!: () => void;
    const disconnect = jest.fn(async () => undefined);
    const onError = jest.fn();
    const storage = new DocumentStorage({ registry, onError, createProviders: (id) => [{
      id, connect: async (doc) => {
        if (doc.id === "source") await new Promise<void>((resolve) => { finish = resolve; });
      }, disconnect,
    }] });
    const pending = storage.openDocument("source");
    const rejected = expect(pending).rejects.toThrow("destroyed");
    await eventually(() => expect(finish).toBeDefined());
    const cleanup = storage.destroy();
    finish();
    await cleanup; await rejected;
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  test("partial registry connections are cleaned on failure", async () => {
    const registry = new YjsDocumentRegistry(crypto.randomUUID());
    registry.registerDocument("source");
    let finish!: () => void;
    const disconnect = jest.fn(async () => undefined);
    const storage = new DocumentStorage({ registry, onError: jest.fn(), createProviders: (id) => [
      { id: `${id}:first`, connect: async () => undefined, disconnect },
      { id: `${id}:second`, connect: async () => {
        await new Promise<void>((resolve) => { finish = resolve; });
        throw new Error("registry unavailable");
      }, disconnect },
    ] });
    await eventually(() => expect(finish).toBeDefined());
    finish();
    await expect(storage.ready).rejects.toThrow("registry unavailable");
    expect(disconnect).toHaveBeenCalledTimes(1);
    await storage.destroy();
  });

  test("delegates location search without opening content and forwards cancellation", async () => {
    const registry = new YjsDocumentRegistry(crypto.randomUUID());
    registry.registerDocument("unopened");
    const lookupDocumentIds = jest.fn(async () => ["unopened"]);
    const connections: string[] = [];
    const storage = new DocumentStorage({ registry, lookupDocumentIds, createProviders: (channel) => {
      connections.push(channel); return [];
    } });
    await storage.ready;
    const controller = new AbortController();
    expect(await storage.findDocumentIdsWithBlock("target", { signal: controller.signal })).toEqual(["unopened"]);
    expect(lookupDocumentIds).toHaveBeenCalledWith("target", { signal: controller.signal });
    expect(connections).toHaveLength(1);
    const changes = jest.fn(); const unsubscribe = storage.subscribe(changes);
    const source = await storage.create("source", [{ id: "target", type: "application-defined", props: { opaque: true } }]);
    changes.mockClear();
    source.blocks.setBlockText("target", "changed");
    expect(changes).not.toHaveBeenCalled();
    controller.abort();
    await expect(storage.findDocumentIdsWithBlock("unresolved", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    unsubscribe(); await source.destroy(); await storage.destroy();
  });

  test("loads only requested documents and recovers their content from a connected peer", async () => {
    const workspaceId = crypto.randomUUID();
    const registryA = new YjsDocumentRegistry(workspaceId);
    const registryB = new YjsDocumentRegistry(workspaceId);
    const connections: string[] = [];
    const makeProviders = (channel: string) => [new BroadcastChannelProvider(channel)];
    const left = new DocumentStorage({ registry: registryA, createProviders: makeProviders });
    const source = await left.create("source", [{ id: "target", type: "paragraph", content: "first" }]);
    const unused = await left.create("unused", [{ id: "unopened", type: "paragraph" }]);
    const right = new DocumentStorage({ registry: registryB, lookupDocumentIds: async () => ["source"], createProviders: (channel) => { connections.push(channel); return makeProviders(channel); } });
    let loaded: DocumentModel | undefined;
    try {
      await eventually(() => expect(registryB.getDocumentIds().sort()).toEqual(["source", "unused"]));
      expect(connections).toHaveLength(1);
      expect(await right.findDocumentIdsWithBlock("target")).toEqual(["source"]);
      expect(connections).toHaveLength(1);
      loaded = await right.openDocument("source");
      await eventually(() => expect(loaded!.blocks.hasBlock("target")).toBe(true));
      expect(connections).toHaveLength(2);
      loaded.blocks.setBlockText("target", "from embed");
      await eventually(() => expect(source.blocks.getBlockNode("target")?.content).toBe("from embed"));
      await loaded.destroy();
      loaded = await right.openDocument("source");
      await eventually(() => expect(loaded!.blocks.getBlockNode("target")?.content).toBe("from embed"));
    } finally {
      await loaded?.destroy(); await source.destroy(); await unused.destroy(); await right.destroy(); await left.destroy();
    }
  });
});


test("constructs an application model and restores data before content providers attach", async () => {
  class ApplicationDocument extends DocumentModelImpl {}
  let constructed: ApplicationDocument | undefined;
  const order: string[] = [];
  const storage = new DocumentStorage({
    registry: new YjsDocumentRegistry(crypto.randomUUID()),
    createDocumentModel: (crdt) => {
      order.push("model");
      constructed = new ApplicationDocument(crdt);
      constructed.blocks.insertBlock({ id: "saved", type: "paragraph", content: "Restored before connection" });
      return constructed;
    },
    createProviders: (channel) => [{ id: channel, connect: async (crdt) => {
      if (crdt.id !== "source") return;
      order.push("provider");
      expect(constructed!.blocks.getBlockNode("saved")?.content).toBe("Restored before connection");
    }, disconnect: async () => {} }],
  });
  storage.registerDocument("source");
  const document = await storage.openDocument("source");
  expect(document).toBeInstanceOf(ApplicationDocument);
  expect(order).toEqual(["model", "provider"]);
  await document.destroy(); await storage.destroy();
});

test("cleans the opened adapter when application model construction fails and allows retry", async () => {
  let fail = true;
  let destroyed: ReturnType<typeof jest.spyOn> | undefined;
  const storage = new DocumentStorage({ registry: new YjsDocumentRegistry(crypto.randomUUID()), createDocumentModel: (crdt) => {
    destroyed = jest.spyOn(crdt, "destroy");
    if (fail) throw new Error("database unavailable");
    return new DocumentModelImpl(crdt);
  } });
  storage.registerDocument("source");
  await expect(storage.openDocument("source")).rejects.toThrow("database unavailable");
  expect(destroyed).toHaveBeenCalledTimes(1);
  fail = false;
  const document = await storage.openDocument("source");
  expect(document.id).toBe("source");
  await document.destroy(); await storage.destroy();
});
