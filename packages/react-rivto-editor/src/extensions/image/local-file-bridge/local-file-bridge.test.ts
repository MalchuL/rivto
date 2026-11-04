/** Tests the host filesystem adapter's limits and URI ownership. @module */
import { LocalFileBridge } from "./local-file-bridge";

it("writes and reads owned files and rejects oversized files", async () => {
  const writes: string[] = [];
  const provider = new LocalFileBridge({
    directory: "/assets",
    uriPrefix: "assets",
    maxBytes: 3,
    writeFile: ({ fileName }) => {
      writes.push(fileName);
      return true;
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

it("writes collision-resistant filenames when randomUUID is unavailable", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
  Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
  try {
    const names: string[] = [];
    const provider = new LocalFileBridge({
      directory: "/assets",
      uriPrefix: "assets/",
      writeFile: ({ fileName }) => {
        if (names.includes(fileName)) {
          return false;
        }
        names.push(fileName);
        return true;
      },
      readFile: async () => new Blob(),
    });
    const context = {
      documentId: "doc",
      mode: "block" as const,
      signal: new AbortController().signal,
      source: "drop" as const,
      destination: "block" as const,
      name: "photo.png",
      mimeType: "image/png",
    };
    await provider.write(new Blob(["a"]), context);
    await provider.write(new Blob(["b"]), context);
    expect(names[0]).toBe("photo.png");
    expect(names[1]).toMatch(/^photo_[0-9a-f]{7}\.png$/);
    expect(names[1]).not.toBe(names[0]);
  } finally {
    if (descriptor) {
      Object.defineProperty(crypto, "randomUUID", descriptor);
    } else {
      Reflect.deleteProperty(crypto, "randomUUID");
    }
  }
});

it("preserves available names, removes unsafe characters, and avoids collisions", async () => {
  const files = new Map<string, string>();
  const provider = new LocalFileBridge({
    directory: "/assets",
    uriPrefix: "assets/",
    writeFile: async ({ fileName, file }) => {
      if (files.has(fileName)) {
        return false;
      }
      files.set(fileName, String(file.size));
      return true;
    },
    readFile: async () => new Blob(),
  });
  const context = {
    documentId: "doc",
    mode: "block" as const,
    signal: new AbortController().signal,
    source: "drop" as const,
    destination: "block" as const,
    name: "Photo 1.PNG",
    mimeType: "image/png",
  };
  expect(await provider.write(new Blob(["first"]), context)).toBe("assets/Photo%201.PNG");
  const second = await provider.write(new Blob(["second"]), context);
  expect(second).toMatch(/^assets\/Photo%201_[0-9a-f]{7}\.PNG$/);
  expect(files.get("Photo 1.PNG")).toBe("5");
  expect(await provider.write(new Blob(), { ...context, name: "a/b?.txt" })).toBe("assets/ab.txt");
  expect(await provider.write(new Blob(), { ...context, name: "<>" })).toBe("assets/file");
  expect(await provider.write(new Blob(), { ...context, name: "CON.txt" })).toBe("assets/_CON.txt");
  const longName = `${"é".repeat(120)}.png`;
  await provider.write(new Blob(), { ...context, name: longName });
  const longCollision = decodeURIComponent(
    await provider.write(new Blob(), { ...context, name: longName }),
  );
  expect(longCollision).toMatch(/_[0-9a-f]{7}\.png$/);
  expect(
    new TextEncoder().encode(longCollision.slice("assets/".length)).length,
  ).toBeLessThanOrEqual(80);
});

it("propagates write failures and stops after repeated collisions", async () => {
  const context = {
    documentId: "doc",
    mode: "block" as const,
    signal: new AbortController().signal,
    source: "drop" as const,
    destination: "block" as const,
    name: "a.txt",
    mimeType: "text/plain",
  };
  const options = { directory: "/assets", uriPrefix: "assets/", readFile: async () => new Blob() };
  const failure = new LocalFileBridge({
    ...options,
    writeFile: () => {
      throw new Error("disk failure");
    },
  });
  await expect(failure.write(new Blob(), context)).rejects.toThrow("disk failure");
  const collision = new LocalFileBridge({ ...options, writeFile: () => false });
  await expect(collision.write(new Blob(), context)).rejects.toThrow(
    "Unable to find an available filename",
  );
});

it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "rejects an invalid file size limit at construction: %s",
  (maxBytes) => {
    expect(
      () =>
        new LocalFileBridge({
          directory: "/assets",
          uriPrefix: "assets/",
          maxBytes,
          writeFile: () => true,
          readFile: () => new Blob(),
        }),
    ).toThrow("File limit must be a positive integer");
  },
);

it("does not claim paths outside the configured file directory", async () => {
  const reads: string[] = [];
  const provider = new LocalFileBridge({
    directory: "file:///assets",
    uriPrefix: "assets/",
    writeFile: () => true,
    readFile: ({ uri }) => {
      reads.push(uri);
      return new Blob();
    },
  });
  const context = {
    documentId: "doc",
    mode: "block" as const,
    signal: new AbortController().signal,
  };
  await expect(provider.read("file:///assets/photo.png", context)).resolves.toBeInstanceOf(Blob);
  await expect(provider.read("file:///assets-other/photo.png", context)).resolves.toBeUndefined();
  await expect(
    provider.read("file:///assets/%2e%2e/private.png", context),
  ).resolves.toBeUndefined();
  await expect(provider.read("assets/%2e%2e/private.png", context)).resolves.toBeUndefined();
  await expect(provider.read("assets/%2fprivate.png", context)).resolves.toBeUndefined();
  expect(reads).toEqual(["file:///assets/photo.png"]);
});
