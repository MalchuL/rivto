/**
 * Durable UTF-8 file operations for the desktop host. Writes use a sibling
 * temporary file and atomic rename, so failures do not truncate the original.
 * Fingerprints detect external edits before an existing document is replaced.
 */
import { createHash, randomUUID } from 'node:crypto';
import { open, rename, rm, readFile, stat } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';

export const MAX_FILE_BYTES = 32 * 1024 * 1024;

/** Computes a fingerprint for conflict detection.
 * @param text - Exact file contents.
 * @returns Stable SHA-256 digest.
 */
export function fingerprint(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Reads a bounded local document.
 * @param path - User-selected file.
 * @returns UTF-8 text, rejecting oversized files.
 */
export async function readDocument(path: string): Promise<string> {
  if ((await stat(path)).size > MAX_FILE_BYTES) throw new Error('Document exceeds the 32 MB limit.');
  return readFile(path, 'utf8');
}

/** Replaces a file only after all new bytes have reached the filesystem.
 * @param path - Destination selected by the user.
 * @param text - Complete UTF-8 contents.
 * @returns Resolves after the atomic replacement.
 */
export async function atomicWrite(path: string, text: string): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(text, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
