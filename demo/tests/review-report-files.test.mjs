import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  reviewReportFileName,
  reviewReportSlug,
  writeReviewReportFile,
} from "../review-report-files.ts";

const report = {
  kind: "block",
  reportId: "review-1",
  problem: "Ошибка структуры",
  savedAt: "2026-09-15T12:34:56.789Z",
  previousReportSiblingId: "before",
  nextReportSiblingId: null,
  parentReportId: "parent",
  snapshot: { version: 6, blocks: [], elements: [], pluginData: {} },
};

test("Review filenames transliterate, timestamp, fall back, and respect NAME_MAX", () => {
  assert.equal(reviewReportSlug(report.problem), "oshibka-struktury");
  assert.equal(
    reviewReportFileName(report),
    "20260915-123456789-oshibka-struktury.json",
  );
  assert.match(
    reviewReportFileName({ ...report, problem: "", reportId: "Отчёт 7" }),
    /-review-otchyot-7\.json$/,
  );
  assert.equal(reviewReportFileName({ ...report, problem: "я".repeat(400) }).length, 255);
});

test("Review writer stores the complete reusable JSON envelope", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "rivto-review-"));
  const directory = join(temporaryDirectory, "reports");
  try {
    const filename = await writeReviewReportFile(directory, report);
    const stored = JSON.parse(await readFile(join(directory, filename), "utf8"));
    assert.deepEqual(Object.keys(stored), [
      "reportId",
      "problem",
      "savedAt",
      "solved",
      "solutionText",
      "reportBlock",
      "snapshot",
    ]);
    assert.equal(stored.reportId, report.reportId);
    assert.equal(stored.problem, report.problem);
    assert.equal(stored.savedAt, report.savedAt);
    assert.equal(stored.solved, false);
    assert.equal(stored.solutionText, "");
    assert.deepEqual(stored.reportBlock, {
      previousReportSiblingId: "before",
      nextReportSiblingId: null,
      parentReportId: "parent",
    });
    assert.deepEqual(stored.snapshot, report.snapshot);
    assert.equal(stored.snapshot.version, 6);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
