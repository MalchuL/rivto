import assert from 'node:assert/strict';
import test from 'node:test';
import { readMindmapNodes, layoutMindmap, NODE_WIDTH, NODE_HEIGHT } from '../src/extensions/mindmap/model.ts';

test('mindmap layout handles deep and wide trees without recursion or branch limits', () => {
  for (const shape of ['deep', 'wide']) {
    const nodes = [{ id: 'root', parentId: null, label: 'Root' }];
    for (let i = 1; i <= 20000; i++) nodes.push({ id: String(i), parentId: shape === 'wide' || i === 1 ? 'root' : String(i - 1), label: 'Branch' });
    const layout = layoutMindmap(readMindmapNodes(nodes));
    assert.equal(layout.nodes.length, nodes.length);
    assert.ok(Number.isFinite(layout.width) && Number.isFinite(layout.height));
    for (const node of layout.nodes) {
      assert.ok(node.x >= 0 && node.x + NODE_WIDTH <= layout.width);
      assert.ok(node.y >= 0 && node.y + NODE_HEIGHT <= layout.height);
    }
    if (shape === 'wide') assert.equal(new Set(layout.nodes.slice(1).map(node => node.y)).size, 20000);
  }
});

test('mindmap rejects invalid imported trees and preserves sibling insertion order', () => {
  const root = { id: 'root', parentId: null, label: 'Root' };
  for (const nodes of [[], [root, root], [root, { id: 'a', parentId: 'missing', label: '' }], [root, { id: 'a', parentId: 'b', label: '' }, { id: 'b', parentId: 'a', label: '' }]]) {
    assert.throws(() => readMindmapNodes(nodes));
  }
  const nodes = [root, { id: 'b', parentId: 'root', label: 'B' }, { id: 'a', parentId: 'root', label: 'A' }];
  assert.deepEqual(layoutMindmap(readMindmapNodes(nodes)).nodes.map(node => node.id), ['root', 'b', 'a']);
});
