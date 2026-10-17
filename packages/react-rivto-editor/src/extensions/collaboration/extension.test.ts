import { collaborationExtension } from "./extension";

const user = { id: "vlad", name: "Vlad", color: "#7c3aed" };

for (const option of ["pointerThrottleMs", "pointerSmoothingMs"] as const) {
  test.each([-1, NaN, Infinity, -Infinity])(`rejects invalid ${option}: %s`, (value) => {
    expect(() => collaborationExtension({ user, [option]: value })).toThrow();
  });
}

test("rejects pointer intervals that overflow browser timers", () => {
  expect(() => collaborationExtension({ user, pointerThrottleMs: 2_147_483_648 })).toThrow();
});

test("accepts omitted timing, zero timing and independent custom timing", () => {
  expect(() => collaborationExtension({ user })).not.toThrow();
  expect(() =>
    collaborationExtension({ user, pointerThrottleMs: 0, pointerSmoothingMs: 0 }),
  ).not.toThrow();
  expect(() =>
    collaborationExtension({ user, pointerThrottleMs: 100, pointerSmoothingMs: 80 }),
  ).not.toThrow();
});

test("extension cleanup disposes its human while retaining independently registered agents", async () => {
  const { YjsDoc } = await import("@chulane/crdt-doc");
  const { DocumentModelImpl } = await import("@chulane/document-model");
  const { createDocumentEditor } = await import("@chulane/rivto");
  const document = new DocumentModelImpl(new YjsDoc("extension-ownership"));
  const core = createDocumentEditor({ document });
  try {
    const agent = core.collaboration.registerParticipant({ id: "agent", user });
    agent.setPointer({ type: "canvas", x: 10, y: 20 });
    expect(() =>
      collaborationExtension({ user }).setup({
        collaboration: core.collaboration,
        extensions: {
          mount: () => {
            throw new Error("mount failed");
          },
        },
      } as unknown as import("../../editor/types").ReactEditorApi),
    ).toThrow("mount failed");
    expect(core.collaboration.getParticipants()).toEqual([agent.getState()]);
    const cleanup = collaborationExtension({ user }).setup({
      collaboration: core.collaboration,
      extensions: { mount: () => () => undefined },
    } as unknown as import("../../editor/types").ReactEditorApi);
    expect(core.collaboration.getParticipants()).toHaveLength(2);
    cleanup?.();
    expect(core.collaboration.getParticipants()).toEqual([agent.getState()]);
    agent.setPointer({ type: "canvas", x: 30, y: 40 });
    expect(core.collaboration.getParticipants()[0]!.pointer).toEqual({
      type: "canvas",
      x: 30,
      y: 40,
    });
  } finally {
    await core.destroy();
    await document.destroy();
  }
});
