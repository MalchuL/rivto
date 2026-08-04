import { resolveBlockListNumbers, type BlockListType } from "../list";

describe("resolveBlockListNumbers", () => {
  it("resets, follows adjacent items, and resumes across gaps per sibling list", () => {
    const blocks = [
      ["start", "start_numbered_list"],
      ["next", "numbered_list"],
      ["gap", "list"],
      ["restart", "numbered_list"],
      ["checkbox", "checkbox"],
      ["resume", "continue_numbered_list"],
      ["reset", "start_numbered_list"],
    ].map(([id, type]) => ({ id: id!, listProps: { type: type as BlockListType } }));

    expect([...resolveBlockListNumbers(blocks)]).toEqual([
      ["start", 1],
      ["next", 2],
      ["restart", 1],
      ["resume", 2],
      ["reset", 1],
    ]);
  });
});
