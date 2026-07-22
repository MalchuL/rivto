import { SlashCommandManager } from "../slash-command-manager";

describe("SlashCommandManager", () => {
  it("lists available commands in registration order and executes by ID", () => {
    const manager = new SlashCommandManager();
    const calls: string[] = [];
    manager.register({ id: "first", title: "First", execute: ({ blockId }) => calls.push(`first:${blockId}`) });
    manager.register({
      id: "conditional",
      title: "Conditional",
      isAvailable: ({ blockId }) => blockId === "allowed",
      execute: ({ blockId }) => calls.push(`conditional:${blockId}`),
    });

    expect(manager.getAll({ blockId: "other" }).map(({ id }) => id)).toEqual(["first"]);
    expect(manager.getAll({ blockId: "allowed" }).map(({ id }) => id)).toEqual(["first", "conditional"]);
    manager.execute("conditional", { blockId: "allowed" });
    expect(calls).toEqual(["conditional:allowed"]);
    expect(() => manager.execute("conditional", { blockId: "other" })).toThrow("unavailable");
  });

  it("validates registrations and disposes only its exact command", () => {
    const manager = new SlashCommandManager();
    expect(() => manager.register({ id: "", title: "Missing", execute: () => undefined })).toThrow("ID");
    expect(() => manager.register({ id: "missing", title: "", execute: () => undefined })).toThrow("title");
    const dispose = manager.register({ id: "one", title: "One", execute: () => undefined });
    expect(() => manager.register({ id: "one", title: "Again", execute: () => undefined })).toThrow("already registered");

    dispose();
    dispose();
    expect(manager.getAll({ blockId: "block" })).toEqual([]);
    expect(() => manager.execute("one", { blockId: "block" })).toThrow("Unknown slash command");
  });

  it("publishes registration revisions and clears during editor teardown", () => {
    const manager = new SlashCommandManager();
    const revisions: number[] = [];
    manager.subscribe(() => revisions.push(manager.revision));
    manager.register({ id: "one", title: "One", execute: () => undefined });
    manager.clear();

    expect(revisions).toEqual([1, 2]);
    expect(manager.getAll({ blockId: "block" })).toEqual([]);
  });
});
