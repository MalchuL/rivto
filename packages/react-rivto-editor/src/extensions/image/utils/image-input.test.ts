/** @jest-environment jsdom */
import { findTransferredImageUris } from "./image-input";

test("recognizes copied image links without claiming ordinary HTML links", () => {
  const transfer = (uri: string, html: string) =>
    ({
      files: [],
      getData: (type: string) => (type === "text/html" ? html : uri),
    }) as unknown as DataTransfer;

  const image = "https://example.test/photo.png?size=large";
  expect(findTransferredImageUris(transfer(image, `<a href="${image}">${image}</a>`))).toEqual([
    {
      uri: image,
      alt: "",
    },
  ]);
  const page = "https://example.test/article";
  expect(findTransferredImageUris(transfer(page, `<a href="${page}">${page}</a>`))).toEqual([]);
  expect(
    findTransferredImageUris(transfer(image, `<p>See <a href="${image}">the photo</a></p>`)),
  ).toEqual([]);
});

test("collects image-only HTML and URI lists without consuming mixed text", () => {
  const transfer = (text: string, html = "") =>
    ({
      files: [],
      getData: (type: string) => (type === "text/html" ? html : text),
    }) as unknown as DataTransfer;
  const first = "https://example.test/first.png";
  const second = "https://example.test/second.png";
  expect(findTransferredImageUris(transfer(`${first}\n${second}`))).toEqual([
    { uri: first, alt: "" },
    { uri: second, alt: "" },
  ]);
  expect(
    findTransferredImageUris(
      transfer("", `<img src="${first}" alt="first"><img src="${second}" alt="second">`),
    ),
  ).toEqual([
    { uri: first, alt: "first" },
    { uri: second, alt: "second" },
  ]);
  expect(findTransferredImageUris(transfer(`${first}\nordinary text`))).toEqual([]);
  expect(findTransferredImageUris(transfer("https://example.test/article"))).toEqual([]);
});
