import assert from "node:assert/strict";
import test from "node:test";
import {
  keepNoResultMenuOpen,
  levenshtein,
  normalizeSlashText,
  rankSlashCommands,
  slashSearchDistance,
} from "../../packages/react-rivto-editor/src/extensions/slash/slash-search.ts";

const command = (id, title, keywords = []) => ({ id, title, keywords, execute() {} });

test("normalizes Unicode and applies adaptive typo thresholds", () => {
  assert.equal(normalizeSlashText("ＭＡＲＫDOWN"), "markdown");
  assert.deepEqual([1, 2, 3, 5, 6, 9, 10].map(slashSearchDistance), [0, 0, 1, 1, 2, 2, 3]);
  assert.equal(levenshtein("slider", "sloder"), 1);
});

test("ranks prefixes before substrings and fuzzy matches with stable ties", () => {
  const commands = [
    command("substring", "Make supermarkdown"),
    command("prefix-one", "Markdown"),
    command("prefix-two", "Markdown block"),
    command("keyword", "Writing", ["markdown"]),
    command("fuzzy", "Slider"),
  ];

  assert.deepEqual(
    rankSlashCommands(commands, "mark").map(({ command: item }) => item.id),
    ["prefix-one", "prefix-two", "keyword", "substring"],
  );
  assert.deepEqual(rankSlashCommands(commands, "sloder").map(({ command: item }) => item.id), ["fuzzy"]);
});

test("keeps two unmatched characters after the latest successful query", () => {
  assert.equal(keepNoResultMenuOpen(6, 4), true);
  assert.equal(keepNoResultMenuOpen(7, 4), false);
});
