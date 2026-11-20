import { captureTextSelection, restoreTextCaret } from "../text-selection";

it("restores a directed selection across an editable rewrite and another block", () => {
  const host = document.createElement("div");
  const other = document.createElement("div");
  host.textContent = "hello";
  other.textContent = "world";
  document.body.append(host, other);
  const selection = document.getSelection()!;
  selection.setBaseAndExtent(other.firstChild!, 3, host.firstChild!, 2);
  const restore = captureTextSelection(host);
  host.textContent = "hello";
  restore();
  expect(selection.anchorNode).toBe(other.firstChild);
  expect(selection.anchorOffset).toBe(3);
  expect(selection.focusNode).toBe(host.firstChild);
  expect(selection.focusOffset).toBe(2);
  selection.removeAllRanges();
  host.remove();
  other.remove();
});

it("restores a collapsed caret after text nodes are replaced", () => {
  const host = document.createElement("div");
  host.innerHTML = "<span>ab</span><span>cd</span>";
  document.body.append(host);
  restoreTextCaret(host, 3);
  const selection = document.getSelection()!;
  expect(selection.anchorNode).toBe(host.lastChild!.firstChild);
  expect(selection.anchorOffset).toBe(1);
  expect(selection.isCollapsed).toBe(true);
  selection.removeAllRanges();
  host.remove();
});
