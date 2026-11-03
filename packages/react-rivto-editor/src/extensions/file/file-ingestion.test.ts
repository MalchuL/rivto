import type { ReactPanelApi } from "../../panels/types";
import { ingestFileBatch } from "./file-ingestion";
import type { FileIngestionStatuses } from "./types";

test("commits successful jobs in input order and leaves failed jobs available to retry", async () => {
  const statuses = new Map<string, { retry: () => void; error?: string }>();
  const feedback: FileIngestionStatuses = {
    set: (status) => {
      statuses.set(status.id, status);
    },
    update: (id, patch) => {
      Object.assign(statuses.get(id)!, patch);
    },
    delete: (id) => {
      statuses.delete(id);
    },
  };
  let finishFirst: ((value: string) => void) | undefined;
  const first = new Promise<string>((resolve) => {
    finishFirst = resolve;
  });
  let nextId = 0;
  const committed: string[][] = [];
  const retried: string[] = [];
  ingestFileBatch({
    panel: {} as ReactPanelApi,
    destination: { kind: "element", x: 0, y: 0 },
    items: ["first", "failed", "last"],
    point: { x: 0, y: 0 },
    signal: new AbortController().signal,
    statuses: feedback,
    nextId: () => String(++nextId),
    name: (item) => item,
    prepare: async (item) => {
      if (item === "first") {
        return first;
      }
      if (item === "failed") {
        throw new Error("failed upload");
      }
      return item;
    },
    retry: (item) => {
      retried.push(item);
    },
    commit: (items) => {
      committed.push([...items]);
    },
    failureMessage: "Unable to upload",
    staleMessage: "Destination changed",
  });
  finishFirst!("first");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(committed).toEqual([["first", "last"]]);
  expect([...statuses.keys()]).toEqual(["2"]);
  expect(statuses.get("2")?.error).toBe("failed upload");
  statuses.get("2")!.retry();
  expect(retried).toEqual(["failed"]);
  expect(statuses.size).toBe(0);
});
