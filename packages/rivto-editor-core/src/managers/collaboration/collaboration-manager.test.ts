import { createTestEditor } from "../../editor/test-utils";
import { CollaborationManager } from "./collaboration-manager";

const user = { id: "shared-user", name: "Agent", color: "#16a34a" };

test("human and agents retain independent presence without document or local-selection mutations", async () => {
  const editor = await createTestEditor();
  try {
    editor.blocks.insertBlock({ id: "text", type: "paragraph", content: "abcdef" });
    const before = editor.dump();
    const local = editor.selection.get();
    let writes = 0;
    const stop = editor.getDocument().subscribe(() => writes++);
    const human = editor.collaboration.registerParticipant({ id: "human", user });
    const first = editor.collaboration.registerParticipant({ id: "agent-1", user });
    const second = editor.collaboration.registerParticipant({ id: "agent-2", user });
    human.setSelection({ type: "selection", blocks: [{ id: "text", start: 0, end: 2 }] });
    first.setSelection({ type: "selection", blocks: [{ id: "text", start: 2, end: 4 }] });
    second.setPointer({ type: "canvas", x: 10, y: 20 });
    expect(editor.collaboration.getParticipants()).toHaveLength(3);
    human.clear();
    expect(editor.collaboration.getParticipants().map((peer) => peer.id)).toEqual([
      "agent-1",
      "agent-2",
    ]);
    first.dispose();
    first.dispose();
    expect(second.getState().pointer).toEqual({ type: "canvas", x: 10, y: 20 });
    expect(editor.selection.get()).toEqual(local);
    expect(editor.dump()).toEqual(before);
    expect(writes).toBe(0);
    stop();
  } finally {
    await editor.destroy();
  }
});

test("resolves an inactive agent's anchors after text changes and omits deleted targets", async () => {
  const editor = await createTestEditor();
  try {
    editor.blocks.insertBlock({ id: "text", type: "paragraph", content: "abcdef" });
    const agent = editor.collaboration.registerParticipant({ id: "agent", user });
    agent.setSelection({
      type: "selection",
      blocks: [{ id: "text", start: 2, end: 4 }],
      reversed: true,
    });
    editor.getDocument().blocks.insertText("text", 0, "🙂");
    expect(agent.getState().selection).toMatchObject({
      blocks: [{ id: "text", start: 4, end: 6 }],
      reversed: true,
    });
    const detached = agent.getState();
    detached.selection!.blocks[0]!.start = 0;
    expect(agent.getState().selection!.blocks[0]!.start).toBe(4);
    editor.blocks.removeBlock("text");
    expect(agent.getState().selection!.blocks).toEqual([]);
  } finally {
    await editor.destroy();
  }
});

test("reserves cleared IDs across editors and disposes only registrations belonging to its owner", async () => {
  const editor = await createTestEditor();
  const sibling = new CollaborationManager(editor.getDocument());
  try {
    const agent = editor.collaboration.registerParticipant({ id: "agent", user });
    sibling.registerParticipant({ id: "sibling", user });
    agent.clear();
    expect(() => sibling.registerParticipant({ id: "agent", user })).toThrow("already registered");
    agent.setPointer({ type: "block", blockId: "text", x: 0.5, y: 0.5 });
    expect(agent.getState().mode).toBe("block");
    agent.setMode("edgeless");
    expect(agent.getState().pointer).toBeNull();
    agent.dispose();
    expect(() => agent.setPointer(null)).toThrow("disposed");
    const replacement = sibling.registerParticipant({ id: "agent", user });
    agent.dispose();
    expect(sibling.getParticipants().some((peer) => peer.id === "agent")).toBe(true);
    editor.collaboration.registerParticipant({ id: "owned", user });
    // Destroy the manager independently: the borrowed document/session remains live.
    editor.runtime.collaboration.destroy();
    expect(
      sibling
        .getParticipants()
        .map((peer) => peer.id)
        .sort(),
    ).toEqual(["agent", "sibling"]);
    expect(replacement.getState().user).toEqual(user);
    expect(() => editor.collaboration.registerParticipant({ id: "late", user })).toThrow(
      "destroyed",
    );
  } finally {
    sibling.destroy();
    await editor.destroy();
  }
});

test("rejects invalid agent input without erasing other participants", async () => {
  const editor = await createTestEditor();
  try {
    const agent = editor.collaboration.registerParticipant({ id: "agent", user });
    const before = editor.collaboration.getParticipants();
    expect(() => editor.collaboration.registerParticipant({ id: "agent", user })).toThrow();
    expect(() => editor.collaboration.registerParticipant({ id: "", user })).toThrow();
    expect(() => agent.setPointer({ type: "canvas", x: NaN, y: 0 })).toThrow();
    expect(() =>
      agent.setSelection({ type: "selection", blocks: [{ id: "text", start: -2, end: 1 }] }),
    ).toThrow();
    expect(editor.collaboration.getParticipants()).toEqual(before);
    editor.getDocument().collaboration.setLocalState({ participants: [{ id: "bad" }] });
    expect(editor.collaboration.getParticipants()).toEqual([]);
  } finally {
    await editor.destroy();
  }
});

test("destroy attempts every withdrawal even when a transport callback throws", async () => {
  const editor = await createTestEditor();
  const channel = editor.getDocument().collaboration;
  const publish = channel.setLocalState.bind(channel);
  try {
    const first = editor.collaboration.registerParticipant({ id: "first", user });
    const second = editor.collaboration.registerParticipant({ id: "second", user });
    let attempts = 0;
    channel.setLocalState = (state) => {
      attempts++;
      if (attempts === 1) {
        throw new Error("transport failure");
      }
      publish(state);
    };
    expect(() => editor.runtime.collaboration.destroy()).toThrow(AggregateError);
    expect(attempts).toBe(2);
    expect(() => first.getState()).toThrow("disposed");
    expect(() => second.setPointer(null)).toThrow("disposed");
  } finally {
    channel.setLocalState = publish;
    await editor.destroy();
  }
});
