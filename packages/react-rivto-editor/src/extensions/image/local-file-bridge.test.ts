/** Tests the host filesystem adapter's limits and URI ownership. @module */
import { createLocalFileBridge } from "./local-file-bridge";

it("writes and reads owned files and rejects oversized files", async () => {
  const writes: string[] = [];
  const provider = createLocalFileBridge({
    directory: "/assets",
    uriPrefix: "assets/",
    maxBytes: 3,
    writeFile: ({ fileName }) => {
      writes.push(fileName);
    },
    readFile: async () => new Blob(["ok"]),
  });
  const signal = new AbortController().signal;
  const context = {
    documentId: "doc",
    mode: "block" as const,
    signal,
    source: "drop" as const,
    destination: "block" as const,
    name: "../test.png",
    mimeType: "image/png",
  };
  const uri = await provider.write(new Blob(["ok"]), context);
  expect(uri).toMatch(/^assets\//);
  expect(writes[0]).not.toContain("/");
  await expect(provider.read(uri, context)).resolves.toBeInstanceOf(Blob);
  await expect(provider.read("https://example.test/a", context)).resolves.toBeUndefined();
  await expect(provider.write(new Blob(["four"]), context)).rejects.toThrow(/limit/);
});
