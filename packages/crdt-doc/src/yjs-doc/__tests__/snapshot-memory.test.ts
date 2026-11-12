import * as Y from "yjs";
import { YjsUndoManager } from "../yjs-undo-manager";
import { YjsDoc } from "../yjs-doc";

test("reloading an encoded document collects expired map values but starts without undo", () => {
  jest.useFakeTimers();
  const doc = new Y.Doc();
  const restored = new Y.Doc();
  const map = doc.getMap<string>("values");
  const nativeHistory = new Y.UndoManager(map, { captureTimeout: 0 });
  const history = new YjsUndoManager(nativeHistory, 100);
  try {
    const payload = "x".repeat(512);
    for (let index = 0; index < 250; index++) {
      map.set("value", `${index}-${payload}`);
    }
    jest.runOnlyPendingTimers();
    const encoded = Y.encodeStateAsUpdate(doc);
    Y.applyUpdate(restored, encoded);
    expect(nativeHistory.undoStack).toHaveLength(100);
    expect(restored.getMap("values").get("value")).toBe(`249-${payload}`);
    expect(encoded.byteLength).toBeGreaterThan(100_000);
    expect(Y.encodeStateAsUpdate(restored).byteLength).toBeLessThan(1_000);
    expect(new Y.UndoManager(restored.getMap("values")).undoStack).toHaveLength(0);
  } finally {
    history.destroy();
    doc.destroy();
    restored.destroy();
    jest.useRealTimers();
  }
});

test("a reloaded document merges an offline edit restored by the peer's undo", () => {
  const local = new Y.Doc();
  const peer = new Y.Doc();
  const restored = new Y.Doc();
  const root = local.getMap<Y.Map<Y.Text>>("root");
  const peerRoot = peer.getMap<Y.Map<Y.Text>>("root");
  root.set("block", new Y.Map<Y.Text>([["text", new Y.Text("original")]]));
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(local));
  const history = new Y.UndoManager(root, { trackedOrigins: new Set(["local"]) });
  const peerHistory = new Y.UndoManager(peerRoot, { trackedOrigins: new Set(["remote"]) });
  try {
    peer.transact(() => peerRoot.get("block")!.get("text")!.insert(4, "-offline"), "local");
    local.transact(() => root.delete("block"), "local");
    Y.applyUpdate(restored, Y.encodeStateAsUpdate(local));
    Y.applyUpdate(restored, Y.encodeStateAsUpdate(peer), "remote");
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(restored), "remote");
    peerHistory.undo();
    Y.applyUpdate(restored, Y.encodeStateAsUpdate(peer), "remote");
    expect(restored.getMap("root").toJSON()).toEqual({ block: { text: "orig-offlineinal" } });
    expect(restored.getMap("root").toJSON()).toEqual(peerRoot.toJSON());
  } finally {
    history.destroy();
    peerHistory.destroy();
    local.destroy();
    peer.destroy();
    restored.destroy();
  }
});

test("bounded adapter histories preserve independent offline edits after reconnection", async () => {
  const [local, peer] = [new YjsDoc("offline-local"), new YjsDoc("offline-peer")];
  const localText = local.getText("content");
  const localValues = local.getMap<{ local: string; peer: string }>("values");
  local.transact(() => localText.insert(0, "base"));
  peer.applySnapshot(local.getSnapshot());
  const peerText = peer.getText("content");
  const peerValues = peer.getMap<{ local: string; peer: string }>("values");
  const localHistory = local.createUndoManager([localText, localValues], undefined, 2);
  const peerHistory = peer.createUndoManager([peerText, peerValues], undefined, 2);
  try {
    local.transact(() => localText.insert(4, "L"));
    localHistory.stopCapturing();
    peer.transact(() => peerText.insert(4, "R"));
    peerHistory.stopCapturing();
    for (let index = 0; index < 3; index++) {
      local.transact(() => localValues.set("local", `L${index}`));
      localHistory.stopCapturing();
      peer.transact(() => peerValues.set("peer", `R${index}`));
      peerHistory.stopCapturing();
    }
    const [localOffline, peerOffline] = [local.getSnapshot(), peer.getSnapshot()];
    local.applySnapshot(peerOffline);
    peer.applySnapshot(localOffline);
    expect(localText.toString()).toBe(peerText.toString());
    expect(localText.toString()).toMatch(/^base(?:LR|RL)$/);
    expect(localValues.get("peer")).toBe("R2");
    expect(peerValues.get("local")).toBe("L2");
    localHistory.undo();
    peerHistory.undo();
    expect(localValues.get("local")).toBe("L1");
    expect(peerValues.get("peer")).toBe("R1");
    const [localUndo, peerUndo] = [local.getSnapshot(), peer.getSnapshot()];
    local.applySnapshot(peerUndo);
    peer.applySnapshot(localUndo);
    expect(localValues.toJSON()).toEqual(peerValues.toJSON());
    expect(localValues.toJSON()).toEqual({ local: "L1", peer: "R1" });
    localHistory.undo();
    localHistory.undo();
    expect(localValues.get("local")).toBe("L0");
    expect(localValues.get("peer")).toBe("R1");
    expect(localText.toString()).toMatch(/^base(?:LR|RL)$/);
    peer.applySnapshot(local.getSnapshot());
    expect(peerValues.toJSON()).toEqual(localValues.toJSON());
  } finally {
    localHistory.destroy();
    peerHistory.destroy();
    await Promise.all([local.destroy(), peer.destroy()]);
  }
});
