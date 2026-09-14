/**
 * Produces an offline, unpacked application for the current OS and architecture
 * using the installed Electron runtime. The bundled renderer needs no packages
 * or server at runtime. Signing and platform installers remain release tasks.
 */
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const executable = require('electron');
const runtime = process.platform === 'darwin' ? resolve(dirname(executable), '../../..') : dirname(executable);
const destination = join(root, 'release', `Rivto-${process.platform}-${process.arch}`);
await access(join(root, 'dist/renderer/index.html'));
// Fail on an existing destination instead of deleting a previous release.
await mkdir(join(root, 'release'), { recursive: true });
await mkdir(destination, { recursive: false });
await cp(runtime, destination, { recursive: true });
const resources = process.platform === 'darwin' ? join(destination, 'Electron.app/Contents/Resources') : join(destination, 'resources');
const application = join(resources, 'app');
await mkdir(application, { recursive: true });
await cp(join(root, 'dist'), join(application, 'dist'), { recursive: true });
const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await writeFile(join(application, 'package.json'), JSON.stringify({ name: 'rivto-desktop', productName: 'Rivto', version: metadata.version, main: 'dist/main.js' }, null, 2));
console.log(`Unpacked application: ${destination}`);
