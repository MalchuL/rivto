import { listShortcutPatch } from "./utils";

test.each([
  ["0. ", "start_numbered_list"],
  ["1. ", "start_numbered_list"],
  ["01. ", "start_numbered_list"],
  ["2. ", "continue_numbered_list"],
  ["42. ", "continue_numbered_list"],
  ["002. ", "continue_numbered_list"],
])("numbered prefix %s selects %s", (prefix, type) => {
  expect(listShortcutPatch(prefix)).toEqual({ type, checked: false });
});
