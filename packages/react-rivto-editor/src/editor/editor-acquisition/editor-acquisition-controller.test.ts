import {
  EditorAcquisitionController,
  type SourceEditorLease,
} from "./editor-acquisition-controller";
const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

test("releases a late acquisition once without publishing after destruction", async () => {
  let complete!: (lease: SourceEditorLease<object>) => void;
  const pending = new Promise<SourceEditorLease<object>>((resolve) => {
    complete = resolve;
  });
  const provider = { acquireEditor: jestApi.fn(() => pending) };
  const publish = jestApi.fn();
  const report = jestApi.fn();
  const release = jestApi.fn(async () => {});
  const acquisition = new EditorAcquisitionController(provider, "source", publish, report);
  const loading = acquisition.start();
  await acquisition.start();
  acquisition.destroy();
  acquisition.destroy();
  complete({ editor: {}, release });
  await loading;
  expect(provider.acquireEditor).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
  expect(publish).not.toHaveBeenCalled();
  expect(report).not.toHaveBeenCalled();
});

test("publishes one load error without retrying", async () => {
  const error = new Error("offline");
  const provider = {
    acquireEditor: jestApi.fn(async () => {
      throw error;
    }),
  };
  const publish = jestApi.fn();
  const acquisition = new EditorAcquisitionController(provider, "source", publish, jestApi.fn());
  await acquisition.start();
  await acquisition.start();
  expect(publish).toHaveBeenCalledWith({ error });
  expect(provider.acquireEditor).toHaveBeenCalledTimes(1);
  acquisition.destroy();
});

test("keeps independent occurrences leased and reports asynchronous release failures", async () => {
  const editor = {};
  const error = new Error("release failure");
  const release = jestApi.fn(async () => {
    throw error;
  });
  const provider = { acquireEditor: jestApi.fn(async () => ({ editor, release })) };
  const publish = jestApi.fn();
  const report = jestApi.fn();
  const first = new EditorAcquisitionController(provider, "source", publish, report);
  const second = new EditorAcquisitionController(provider, "source", publish, report);
  await Promise.all([first.start(), second.start()]);
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
