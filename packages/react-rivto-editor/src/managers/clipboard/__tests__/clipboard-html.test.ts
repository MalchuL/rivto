/** @jest-environment ./jest-browser-environment.mjs */
import { parseClipboardHtml } from "../clipboard-html";
import { parseHtmlFragment } from "@chulane/rivto-root/browser";

const context = { surface: "page", defaultBlockType: "paragraph" } as const;

it("preserves nested list content and ignores embedded or executable content", () => {
  const nodes = parseHtmlFragment(
    '<ol><li>One<br>two<script>ignored</script><ul><li><input type="checkbox" checked>Child</li></ul></li></ol>',
  )!;
  expect(parseClipboardHtml(nodes, [], context)).toEqual({
    blocks: [
      {
        type: "paragraph",
        content: "One\ntwo",
        listProps: { type: "checkbox", checked: true },
        children: [
          {
            type: "paragraph",
            content: "Child",
            listProps: { type: "checkbox", checked: true },
            children: [],
          },
        ],
      },
    ],
    elements: [],
  });
});

it("passes detached subtrees to converters and lets an empty result consume one", () => {
  const nodes = parseHtmlFragment(
    '<section><p data-kind="custom">Hello<br>there</p><p>Keep</p></section>',
  )!;
  const seen: unknown[] = [];
  const result = parseClipboardHtml(
    nodes,
    [
      {
        parseHTML: (element) => {
          if (element.attributes["data-kind"] !== "custom") {
            return;
          }
          seen.push(element);
          return {};
        },
      },
    ],
    context,
  );
  expect(result?.blocks).toEqual([{ type: "paragraph", content: "Keep" }]);
  expect(seen).toEqual([expect.objectContaining({ type: "element", tagName: "P" })]);
  expect(seen[0]).not.toBeInstanceOf(Element);
});

it("rejects canvas elements produced for Page", () => {
  const nodes = parseHtmlFragment("<hr>")!;
  expect(() =>
    parseClipboardHtml(
      nodes,
      [
        {
          parseHTML: () => ({
            elements: [
              { type: "shape", zIndex: 0, props: {}, frame: { x: 0, y: 0, width: 1, height: 1 } },
            ],
          }),
        },
      ],
      context,
    ),
  ).toThrow("Page clipboard parsers must return blocks");
});
