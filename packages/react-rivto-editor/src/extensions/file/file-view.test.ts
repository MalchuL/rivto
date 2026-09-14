/** File preview icon selection regression coverage. @module */
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileText,
  FileVideo,
} from "lucide-react";
import { fileTypeIcon } from "./file-view";

describe("fileTypeIcon", () => {
  test.each([
    ["track.mp3", "application/octet-stream", FileAudio],
    ["movie.bin", "video/mp4", FileVideo],
    ["table.csv", "text/csv", FileSpreadsheet],
    ["source.ts", "application/octet-stream", FileCode],
    ["manual.pdf", "application/pdf", FileText],
    ["backup.zip", "application/zip", FileArchive],
    ["unknown.bin", "application/octet-stream", File],
  ])("selects an icon for %s", (name, mimeType, Icon) => {
    expect(fileTypeIcon({ name, mimeType })).toBe(Icon);
  });
});
