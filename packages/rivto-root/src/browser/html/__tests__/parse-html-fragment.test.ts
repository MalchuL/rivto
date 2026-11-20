import { parseHtmlFragment, readHtmlAttribute } from "../parse-html-fragment";

it("returns detached element and text data in document order", () => {
  const nodes = parseHtmlFragment(
    '<p data-kind="sample">One<br>Two &amp; three</p><!-- ignored -->',
  );
  expect(nodes).toEqual([
    {
      type: "element",
      tagName: "P",
      attributes: { "data-kind": "sample" },
      children: [
        { type: "text", text: "One" },
        { type: "element", tagName: "BR", attributes: {}, children: [] },
        { type: "text", text: "Two & three" },
      ],
    },
  ]);
  expect(nodes?.[0]).not.toBeInstanceOf(Element);
  if (nodes?.[0]?.type === "element") {
    expect(nodes[0].attributes["constructor"]).toBeUndefined();
  }
});

it("reads the first matching attribute from detached markup", () => {
  expect(
    readHtmlAttribute(
      '<div data-value="first"></div><div data-value="second"></div>',
      "[data-value]",
      "data-value",
    ),
  ).toBe("first");
  expect(readHtmlAttribute("<p>none</p>", "[data-value]", "data-value")).toBeUndefined();
});
