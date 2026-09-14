/**
 * App-owned file envelope and Markdown projection of canonical Rivto snapshots.
 * Export walks stored children regardless of collapse state. Root paragraphs
 * remain Markdown prose; nested paragraphs become lists. Layout-only containers
 * become readable hierarchy, while boards and grids become Markdown tables.
 */
import type { EditorBlock, EditorSnapshot } from '@chulane/rivto';

export interface DocumentFile {
  format: 'rivto-document';
  version: 1;
  title: string;
  snapshot: EditorSnapshot;
}

/** Parses the app envelope or a raw demo snapshot without mutating an editor.
 * @param text - JSON from disk or draft storage.
 * @returns Envelope whose snapshot still requires the core loader's validation.
 */
export function parseDocument(text: string): DocumentFile {
  const value = JSON.parse(text);
  const envelope = value?.format === 'rivto-document';
  if (envelope && (value.version !== 1 || typeof value.title !== 'string' || value.title.length > 240)) throw new Error('Unsupported Rivto document format.');
  const snapshot = envelope ? value.snapshot : value;
  if (!snapshot || snapshot.version !== 6 || !Array.isArray(snapshot.blocks) || !Array.isArray(snapshot.elements)) throw new Error('Expected a Rivto v6 document snapshot.');
  // The core rejects invalid block/element data; this bound also prevents deeply
  // nested untrusted JSON from exhausting recursive validation or rendering.
  const pending = snapshot.blocks.map((block: unknown) => ({ block, depth: 0 }));
  let count = 0;
  while (pending.length) {
    const { block, depth } = pending.pop()!;
    if (++count > 50000 || depth > 100) throw new Error('Document exceeds 50,000 blocks or 100 nesting levels.');
    if (!block || typeof block !== 'object' || !Array.isArray(block.children)) throw new Error('Invalid block hierarchy.');
    pending.push(...block.children.map((child: unknown) => ({ block: child, depth: depth + 1 })));
  }
  return { format: 'rivto-document', version: 1, title: envelope ? value.title : 'Imported document', snapshot };
}

/** Escapes text embedded inside a table's HTML hierarchy.
 * @param text - Literal source text.
 * @returns Safe inline HTML that cannot terminate a Markdown table cell.
 */
function cellText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/\r?\n/g, '<br>');
}

/** Converts one complete subtree into safe HTML inside a table cell.
 * @param block - Card or cell with all descendants, including collapsed ones.
 * @returns Text followed by recursive HTML lists.
 */
function cellTree(block: EditorBlock): string {
  const check = block.listProps.type === 'checkbox' ? (block.listProps.checked ? '☑ ' : '☐ ') : '';
  return check + cellText(block.content) + (block.children.length ? `<ul>${block.children.map((child) => `<li>${cellTree(child)}</li>`).join('')}</ul>` : '');
}

/** Formats a rectangular Markdown table, padding missing cells.
 * @param rows - Header followed by body rows.
 * @returns Markdown table text, or an empty string for zero columns.
 */
function table(rows: string[][]): string {
  const width = Math.max(0, ...rows.map((row) => row.length));
  if (!width) return '';
  const lines = rows.map((row) => `| ${Array.from({ length: width }, (_, index) => row[index] ?? '').join(' | ')} |`);
  lines.splice(1, 0, `| ${Array(width).fill('---').join(' | ')} |`);
  return lines.join('\n');
}

/** Projects one block and descendants without consulting rendered visibility.
 * @param block - Canonical block subtree.
 * @param depth - Zero for document roots; nested levels get list markers.
 * @returns Complete Markdown section.
 */
function blockMarkdown(block: EditorBlock, depth: number): string {
  let content = block.content;
  let consumedChildren = false;
  if (block.type === 'kanban') {
    const columns = block.children;
    content = table([
      columns.map((column) => cellText(column.content)),
      ...Array.from({ length: Math.max(0, ...columns.map((column) => column.children.length)) }, (_, row) => columns.map((column) => column.children[row] ? cellTree(column.children[row]) : '')),
    ]);
    consumedChildren = true;
  } else if (block.type === 'table') {
    content = table(block.children.map((row) => row.children.map(cellTree)));
    consumedChildren = true;
  } else if (block.type === 'separator') {
    content = '---';
  } else if (!content && !['paragraph', 'columns-column'].includes(block.type)) {
    content = block.type === 'bento' ? '**Bento**' : block.type === 'columns' ? '**Columns**' : `**${block.type}**`;
  }
  const type = block.listProps.type;
  const marker = type === 'checkbox' ? `- [${block.listProps.checked ? 'x' : ' '}] ` : (typeof type === 'string' && type.includes('numbered')) ? '1. ' : depth ? '- ' : '';
  const indent = '    '.repeat(Math.max(0, depth - 1));
  // Multiline content (including fenced code and tables) stays inside the item.
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let result = lines.map((line, index) => `${indent}${index ? ' '.repeat(marker.length) : marker}${line}`).join('\n');
  if (!consumedChildren && block.children.length) result += '\n\n' + block.children.map((child) => blockMarkdown(child, depth + 1)).join('\n\n');
  return result;
}

/** Exports all stored block content and textual canvas elements.
 * @param document - App document containing a validated snapshot.
 * @returns Portable Markdown; visual geometry remains available in JSON only.
 */
export function exportMarkdown(document: DocumentFile): string {
  const parts = document.snapshot.blocks.map((block) => blockMarkdown(block, 0));
  const visuals = document.snapshot.elements.filter((element) => element.type !== 'block');
  if (visuals.length) {
    parts.push('## Canvas');
    for (const element of visuals) {
      const text = element.props.text;
      parts.push(typeof text === 'string' && text ? text : `- ${element.type} (${element.id})`);
    }
  }
  return parts.join('\n\n').trimEnd() + '\n';
}
