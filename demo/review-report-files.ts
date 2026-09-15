/**
 * Demo development-server persistence for standalone Review reports.
 *
 * The browser submits a report envelope; this trusted server adapter derives a
 * safe filename and writes JSON beneath the output directory captured by the
 * Vite plugin closure. No filesystem capability is exposed to editor packages.
 *
 * @module
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { ReviewReport } from "./src/extensions/review-report-model";

/** HTTP endpoint consumed by the demo Review extension callback. */
export const REVIEW_REPORT_ENDPOINT = "/__review-reports";

const CYRILLIC_TO_LATIN: Readonly<Record<string, string>> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

/**
 * Converts Russian text to a lowercase filesystem-safe ASCII slug.
 *
 * @param value - Problem statement or fallback identifier.
 * @returns Latin letters and digits separated by single hyphens.
 */
export function reviewReportSlug(value: string): string {
  return [...value.toLowerCase()].map((character) => (
    CYRILLIC_TO_LATIN[character] ?? character
  )).join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Formats an ISO instant as the compact UTC filename prefix.
 *
 * @param savedAt - Valid ISO-8601 timestamp stored in the report envelope.
 * @returns `YYYYMMDD-HHmmssSSS` in UTC.
 */
function compactTimestamp(savedAt: string): string {
  const date = new Date(savedAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Review savedAt must be ISO-8601");
  return date.toISOString()
    .replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/, "$1$2$3-$4$5$6$7");
}

/**
 * Derives a portable filename capped at the common 255-byte component limit.
 *
 * @param report - Self-describing report envelope.
 * @param maximumLength - Complete ASCII filename limit, including `.json`.
 * @returns Safe timestamped JSON filename.
 */
export function reviewReportFileName(report: ReviewReport, maximumLength = 255): string {
  const prefix = `${compactTimestamp(report.savedAt)}-`;
  const fallback = `review-${reviewReportSlug(report.reportId) || "report"}`;
  const slug = reviewReportSlug(report.problem) || fallback;
  const suffix = ".json";
  const available = Math.max(1, maximumLength - prefix.length - suffix.length);
  return `${prefix}${slug.slice(0, available).replace(/-+$/g, "") || "r"}${suffix}`;
}

/**
 * Writes metadata first and the reusable snapshot last for a stable, readable file.
 *
 * @param outputDirectory - Directory captured by the host adapter.
 * @param report - Validated report envelope to persist.
 * @returns Generated filename without its parent path.
 */
export async function writeReviewReportFile(
  outputDirectory: string,
  report: ReviewReport,
): Promise<string> {
  const filename = reviewReportFileName(report);
  const details = {
    reportId: report.reportId,
    problem: report.problem,
    savedAt: report.savedAt,
    solved: false,
    solutionText: "",
  };
  const storedReport = report.kind === "block" ? {
    ...details,
    reportBlock: {
      previousReportSiblingId: report.previousReportSiblingId,
      nextReportSiblingId: report.nextReportSiblingId,
      parentReportId: report.parentReportId,
    },
    snapshot: report.snapshot,
  } : {
    ...details,
    snapshot: report.snapshot,
  };
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    resolve(outputDirectory, filename),
    `${JSON.stringify(storedReport, null, 2)}\n`,
    "utf8",
  );
  return filename;
}

/**
 * Reads one bounded JSON request body.
 *
 * @param request - Incoming Vite development-server request.
 * @returns Parsed JSON value.
 */
async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 50 * 1024 * 1024) throw new Error("Review report exceeds 50 MB");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

/**
 * Validates the report fields used by the server trust boundary.
 *
 * @param value - Parsed request body.
 * @returns Valid report envelope.
 */
function validateReport(value: unknown): ReviewReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Review report must be an object");
  }
  const report = value as Partial<ReviewReport>;
  if ((report.kind !== "block" && report.kind !== "element") ||
    typeof report.reportId !== "string" || !report.reportId ||
    typeof report.problem !== "string" ||
    typeof report.savedAt !== "string" ||
    !report.snapshot || report.snapshot.version !== 6 ||
    !Array.isArray(report.snapshot.blocks) || !Array.isArray(report.snapshot.elements)) {
    throw new Error("Invalid Review report envelope");
  }
  if (report.kind === "block" && ![
    report.previousReportSiblingId,
    report.nextReportSiblingId,
    report.parentReportId,
  ].every((id) => id === null || typeof id === "string")) {
    throw new Error("Invalid Review block placement");
  }
  return report as ReviewReport;
}

/**
 * Installs a Vite-only JSON writer rooted at a host-selected directory.
 *
 * @param outputDirectory - Directory that receives generated reports.
 * @returns Vite plugin serving the Review report endpoint in dev and preview.
 */
export function reviewReportFilesPlugin(outputDirectory: string): Plugin {
  /** Handles the endpoint for either a Vite dev or preview Connect server. */
  const configure = (server: { middlewares: { use(handler: (request: IncomingMessage, response: ServerResponse, next: () => void) => void): void } }): void => {
    server.middlewares.use((request, response, next) => {
      if (request.url !== REVIEW_REPORT_ENDPOINT) return next();
      if (request.method !== "POST") {
        response.statusCode = 405;
        response.end("Method not allowed");
        return;
      }
      void readJson(request).then(validateReport).then(async (report) => {
        const filename = await writeReviewReportFile(outputDirectory, report);
        response.statusCode = 201;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ filename }));
      }).catch((error: unknown) => {
        response.statusCode = 400;
        response.end(error instanceof Error ? error.message : "Failed to write Review report");
      });
    });
  };
  return {
    name: "demo-review-report-files",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
