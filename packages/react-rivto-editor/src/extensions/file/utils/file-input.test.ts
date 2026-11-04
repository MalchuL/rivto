import { findImageUri, isImageFile } from "../../image/utils/image-input";
import {
  createFileReferenceFromUri,
  findLocalFileUri,
  findTransferredLocalFileUri,
  getTransferredFiles,
} from "./file-input";

test("prefers a local URI list entry and falls back to plain clipboard text", () => {
  const transfer = (uriList: string, text: string) => ({
    getData: (type: string) => (type === "text/uri-list" ? uriList : text),
  });
  expect(findTransferredLocalFileUri(transfer("file:///first.txt", "/second.txt"))).toBe(
    "file:///first.txt",
  );
  expect(findTransferredLocalFileUri(transfer("https://example.test/", "/second.txt"))).toBe(
    "/second.txt",
  );
  expect(findTransferredLocalFileUri(transfer("", "ordinary text"))).toBeUndefined();
  expect(findTransferredLocalFileUri(null)).toBeUndefined();
});

test("uses the first non-comment URI and only accepts supported local file paths", () => {
  expect(findLocalFileUri("# source\r\n/home/user/file.txt\r\n/other.txt")).toBe(
    "/home/user/file.txt",
  );
  expect(
    findLocalFileUri("# source\nhttps://example.test/file.txt\n/home/user/file.txt"),
  ).toBeUndefined();
  expect(findLocalFileUri("C:\\Users\\name\\file.txt")).toBe("C:\\Users\\name\\file.txt");
});

test("accepts remote images and local image paths without skipping the first URI", () => {
  expect(findImageUri("# source\nhttps://example.test/image.png")).toBe(
    "https://example.test/image.png",
  );
  expect(findImageUri("file:///home/user/image.jpg")).toBe("file:///home/user/image.jpg");
  expect(findImageUri("/home/user/readme.txt\n/home/user/image.png")).toBeUndefined();
});

test("uses generic binary metadata for unknown filename extensions", () => {
  expect(createFileReferenceFromUri("/home/user/report.constructor").mimeType).toBe(
    "application/octet-stream",
  );
  expect(createFileReferenceFromUri("/home/user/photo.JPG").mimeType).toBe("image/jpeg");
});

test("prefers transferred files and falls back to file items", () => {
  const first = new File(["first"], "first.txt", { type: "text/plain" });
  const second = new File(["second"], "second.txt", { type: "text/plain" });
  expect(getTransferredFiles(null)).toEqual([]);
  expect(
    getTransferredFiles({
      files: [first],
      items: [{ kind: "file", getAsFile: () => second }],
    }),
  ).toEqual([first]);
  expect(
    getTransferredFiles({
      files: [],
      items: [
        { kind: "string", getAsFile: () => first },
        { kind: "file", getAsFile: () => second },
        { kind: "file", getAsFile: () => null },
      ],
    }),
  ).toEqual([second]);
});

test("uses generic binary metadata for a path with no extension", () => {
  expect(createFileReferenceFromUri("/home/user/README")).toEqual({
    uri: "/home/user/README",
    name: "README",
    mimeType: "application/octet-stream",
  });
});

test("prefers image files and falls back to image items when file lists contain no images", () => {
  const text = new File(["text"], "note.txt", { type: "text/plain" });
  const image = new File(["image"], "image.png", { type: "image/png" });
  const fallback = new File(["image"], "other.jpg", { type: "application/octet-stream" });
  expect(getTransferredFiles(null, isImageFile)).toEqual([]);
  expect(
    getTransferredFiles(
      {
        files: [text, image],
        items: [{ kind: "file", getAsFile: () => fallback }],
      },
      isImageFile,
    ),
  ).toEqual([image]);
  expect(
    getTransferredFiles(
      {
        files: [text],
        items: [
          { kind: "string", getAsFile: () => image },
          { kind: "file", getAsFile: () => fallback },
          { kind: "file", getAsFile: () => null },
        ],
      },
      isImageFile,
    ),
  ).toEqual([fallback]);
});
