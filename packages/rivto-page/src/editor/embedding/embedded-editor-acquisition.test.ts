import { EmbeddedEditorAcquisition, type SourceEditorLease } from "./embedded-editor-acquisition";

test("releases a late acquisition once without publishing after destruction", async () => {
  let complete!: (lease: SourceEditorLease<object>) => void;
  const pending = new Promise<SourceEditorLease<object>>((resolve) => {
    complete = resolve;
  });
  const provider = { acquireEditor: jest.fn(() => pending) };
  const publish = jest.fn();
  const report = jest.fn();
  const release = jest.fn(async () => {});
  const acquisition = new EmbeddedEditorAcquisition(provider, "source", publish, report);
  acquisition.start();
  acquisition.start();
  acquisition.destroy();
  acquisition.destroy();
  complete({ editor: {}, release });
  await pending;
  await Promise.resolve();
  expect(provider.acquireEditor).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
  expect(publish).not.toHaveBeenCalled();
  expect(report).not.toHaveBeenCalled();
});

test("publishes one load error without retrying", async () => {
  const error = new Error("offline");
  const provider = {
    acquireEditor: jest.fn(async () => {
      throw error;
    }),
  };
  const publish = jest.fn();
  const acquisition = new EmbeddedEditorAcquisition(provider, "source", publish, jest.fn());
  acquisition.start();
  await Promise.resolve();
  await Promise.resolve();
  acquisition.start();
  expect(publish).toHaveBeenCalledWith({ error });
  expect(provider.acquireEditor).toHaveBeenCalledTimes(1);
  acquisition.destroy();
});

test("keeps independent occurrences leased and reports asynchronous release failures", async () => {
  const editor = {};
  const error = new Error("release failure");
  const release = jest.fn(async () => {
    throw error;
  });
  const provider = { acquireEditor: jest.fn(async () => ({ editor, release })) };
  const publish = jest.fn();
  const report = jest.fn();
  const first = new EmbeddedEditorAcquisition(provider, "source", publish, report);
  const second = new EmbeddedEditorAcquisition(provider, "source", publish, report);
  first.start();
  second.start();
  await Promise.resolve();
  expect(publish).toHaveBeenCalledTimes(2);
  first.destroy();
  first.destroy();
  for (let turn = 0; turn < 4; turn++) {
    await Promise.resolve();
  }
  expect(release).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith(error);
  second.destroy();
  for (let turn = 0; turn < 4; turn++) {
    await Promise.resolve();
  }
  expect(release).toHaveBeenCalledTimes(2);
});
