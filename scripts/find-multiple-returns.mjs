import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, relative } from 'node:path';
import ts from 'typescript';

const defaultPaths = [
  'packages/rivto-editor-core/src',
  'packages/react-rivto-editor/src',
];
const ignoredDirectories = new Set(['coverage', 'dist', 'node_modules']);
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);

async function collectSourceFiles(path) {
  const pathStat = await stat(path);
  if (pathStat.isFile()) {
    return sourceExtensions.has(extname(path)) && !path.endsWith('.d.ts')
      ? [path]
      : [];
  }

  const entries = await readdir(path, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter(entry => !entry.isDirectory() || !ignoredDirectories.has(entry.name))
      .map(entry => collectSourceFiles(`${path}/${entry.name}`))
  );
  return files.flat();
}

function functionName(node) {
  let name = '<anonymous>';
  if (node.name) name = node.name.getText();
  else if (ts.isVariableDeclaration(node.parent)) name = node.parent.name.getText();
  else if (ts.isPropertyAssignment(node.parent)) name = node.parent.name.getText();
  return name;
}

function countReturns(functionNode) {
  let count = 0;

  function visit(node) {
    if (node !== functionNode && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) count += 1;
    ts.forEachChild(node, visit);
  }

  visit(functionNode.body);
  return count;
}

function findMultipleReturns(path, sourceText) {
  const scriptKind = path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const matches = [];

  function visit(node) {
    if (ts.isFunctionLike(node) && node.body) {
      const returns = countReturns(node);
      if (returns > 1) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        matches.push({ line: line + 1, name: functionName(node), returns });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return matches;
}

const requestedPaths = process.argv.slice(2).filter(argument => argument !== '--');

if (requestedPaths[0] === '--self-test') {
  const matches = findMultipleReturns(
    'example.ts',
    'function example(value) {\n  [value].map(item => item);\n  if (value) return 1;\n  return 2;\n}',
  );
  assert.deepEqual(matches, [{ line: 1, name: 'example', returns: 2 }]);
  console.log('Self-test passed');
} else {
  const files = (await Promise.all(
    (requestedPaths.length ? requestedPaths : defaultPaths).map(collectSourceFiles),
  )).flat().sort();

  for (const path of files) {
    const sourceText = await readFile(path, 'utf8');
    for (const match of findMultipleReturns(path, sourceText)) {
      console.log(`${relative(process.cwd(), path)}:${match.line} ${match.name} (${match.returns} returns)`);
    }
  }
}
