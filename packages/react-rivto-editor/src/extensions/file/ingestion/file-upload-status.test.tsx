import { renderToStaticMarkup } from "react-dom/server";
import { FileUploadStatusOverlay, FileUploadStatusStore } from "./file-upload-status";

test("keeps independent upload feedback and renders both existing presentations", () => {
  const fileUploads = new FileUploadStatusStore();
  const imageUploads = new FileUploadStatusStore();
  const revisions: number[] = [];
  // Record each revision emitted by the file store only.
  const unsubscribe = fileUploads.subscribe(() => revisions.push(fileUploads.getRevision()));
  // These rendering assertions do not need the retry callbacks to perform work.
  fileUploads.set({ id: "1", name: "note.txt", x: 12, y: 24, retry: () => {} });
  fileUploads.update("1", { error: "Upload failed" });
  imageUploads.set({ id: "1", name: "photo.png", x: 0, y: 0, retry: () => {} });

  const fileMarkup = renderToStaticMarkup(
    <FileUploadStatusOverlay store={fileUploads} kind="file" />,
  );
  const imageMarkup = renderToStaticMarkup(
    <FileUploadStatusOverlay store={imageUploads} kind="image" />,
  );
  expect(fileMarkup).toContain('class="rivto-file-uploads"');
  expect(fileMarkup).toContain('role="alert"');
  expect(fileMarkup).toContain("Upload failed");
  expect(fileMarkup).toContain("Retry");
  expect(imageMarkup).toContain('class="rivto-image-uploads"');
  expect(imageMarkup).toContain('role="status"');
  expect(imageMarkup).toContain("Uploading photo.png");
  fileUploads.delete("1");
  unsubscribe();
  fileUploads.set({ id: "2", name: "other", x: 0, y: 0, retry: () => {} });
  expect(revisions).toEqual([1, 2, 3]);
  expect(imageUploads.getUploads()).toHaveLength(1);
});

test("notifies a stable snapshot when listeners unsubscribe during delivery", () => {
  const store = new FileUploadStatusStore();
  const calls: string[] = [];
  // The first listener calls the second listener's disposer during notification.
  let unsubscribeSecond = () => {};
  // Remove the second subscriber while the first notification is being delivered.
  store.subscribe(() => {
    calls.push("first");
    unsubscribeSecond();
  });
  // Record whether the captured listener still receives the current notification.
  unsubscribeSecond = store.subscribe(() => calls.push("second"));
  store.set({ id: "1", name: "a", x: 0, y: 0, retry: () => {} });
  store.update("1", { progress: 0.5 });
  expect(calls).toEqual(["first", "second", "first"]);
});
