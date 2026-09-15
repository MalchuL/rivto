/** Regression checks for portable files, collapsed hierarchy and complex export. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportMarkdown, parseDocument, type DocumentFile } from '../renderer/documents.ts';
import type { EditorBlock } from '@chulane/rivto';

/** Builds a complete block for export tests.
 * @param content - Markdown source.
 * @param children - Stored descendants.
 * @param type - Block plugin type.
 * @returns Portable block.
 */
function block(content: string, children: EditorBlock[] = [], type = 'paragraph'): EditorBlock {
  return { id: content || type, type, content, children, props: {}, listProps: {}, pluginData: {} };
}
/** Wraps a forest in the application's versioned document envelope.
 * @param blocks - Root block forest.
 * @returns Portable document.
 */
function document(blocks: EditorBlock[]): DocumentFile {
  return { format: 'rivto-document', version: 1, title: 'Notes', snapshot: { version: 6, blocks, elements: [] } };
}

test('root Markdown stays prose and collapsed descendants remain nested lists', () => {
  const parent = block('# Heading', [block('Child\nsecond line', [block('Grandchild')])]);
  parent.listProps = { collapsed: true };
  assert.equal(exportMarkdown(document([parent, block('Paragraph')])), '# Heading\n\n- Child\n  second line\n\n    - Grandchild\n\nParagraph\n');
});

test('Kanban exports uneven columns, escaped pipes and collapsed card hierarchy', () => {
  const card = block('A | B', [block('<script>\nchild', [block('deep')])]);
  card.listProps = { collapsed: true };
  const board = block('', [block('To | do', [card, block('Next')], 'kanban-column'), block('Done', [], 'kanban-column')], 'kanban');
  assert.equal(exportMarkdown(document([board])), '| To &#124; do | Done |\n| --- | --- |\n| A &#124; B<ul><li>&lt;script&gt;<br>child<ul><li>deep</li></ul></li></ul> |  |\n| Next |  |\n');
});

test('table uses its first row as headers and retains nested cell contents', () => {
  const table = block('', [block('', [block('Name'), block('Details')], 'table-row'), block('', [block('One', [block('nested')])], 'table-row')], 'table');
  assert.match(exportMarkdown(document([table])), /\| Name \| Details \|\n\| --- \| --- \|\n\| One<ul><li>nested<\/li><\/ul> \| {2}\|/);
});

test('empty boards, explicit checkboxes, and nested multiline fences export', () => {
  const todo = block('Done'); todo.listProps = { type: 'checkbox', checked: true };
  const result = exportMarkdown(document([block('', [], 'kanban'), todo, block('Code', [block('```js\na()\n```')])]));
  assert.match(result, /- \[x\] Done/);
  assert.match(result, /- ```js\n {2}a\(\)\n {2}```/);
});

test('file envelopes and raw snapshots round trip, malformed and future files reject', () => {
  const original = document([block('Hello')]);
  assert.deepEqual(parseDocument(JSON.stringify(original)), original);
  assert.deepEqual(parseDocument(JSON.stringify(original.snapshot)).snapshot, original.snapshot);
  for (const value of ['{', '{}', '{"version":5,"blocks":[],"elements":[]}', JSON.stringify({ ...original, version: 2 }), JSON.stringify(document([{ children: null } as never]))]) assert.throws(() => parseDocument(value));
  let tree = block('end');
  for (let i = 0; i < 102; i++) tree = block(String(i), [tree]);
  assert.throws(() => parseDocument(JSON.stringify(document([tree]))), /nesting/);
});
