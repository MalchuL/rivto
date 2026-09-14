/** Checks real atomic file replacement, cleanup and bounded read behavior. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomicWrite, readDocument, fingerprint, MAX_FILE_BYTES } from '../src/files.ts';

test('atomic writes round trip Unicode, replace existing data and leave no temp files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rivto-files-'));
  try {
    const path = join(directory, 'notes.json');
    await atomicWrite(path, 'Original');
    await atomicWrite(path, 'Привет 🌱');
    assert.equal(await readDocument(path), 'Привет 🌱');
    assert.notEqual(fingerprint('Original'), fingerprint(await readDocument(path)));
    assert.deepEqual(await readdir(directory), ['notes.json']);
    await assert.rejects(atomicWrite(directory, 'cannot replace a directory'));
    assert.equal(await readDocument(path), 'Привет 🌱');
    await writeFile(path, '');
    await truncate(path, MAX_FILE_BYTES + 1);
    await assert.rejects(readDocument(path), /32 MB/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
