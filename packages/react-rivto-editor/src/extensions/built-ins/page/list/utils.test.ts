/** Regression coverage for portable numbered-list serialization values. */
import { resolveBlockListNumbers } from "./utils";

test("resolves starts, adjacent items, gaps, and continued sequences", () => {
  const blocks = [
    { id: "first", listProps: { type: "numbered_list" } },
    { id: "second", listProps: { type: "numbered_list" } },
    { id: "gap", listProps: {} },
    { id: "restart", listProps: { type: "numbered_list" } },
    { id: "continue", listProps: { type: "continue_numbered_list" } },
    { id: "start", listProps: { type: "start_numbered_list" } },
    { id: "last", listProps: { type: "numbered_list" } },
  ];

  expect(Object.fromEntries(resolveBlockListNumbers(blocks))).toEqual({
    first: 1,
    second: 2,
    restart: 1,
    continue: 2,
    start: 1,
    last: 2,
  });
});
