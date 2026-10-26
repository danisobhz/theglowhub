import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(root, 'dist');
if (path.dirname(output) !== path.resolve(root) || path.basename(output) !== 'dist') throw new Error('Unexpected build path.');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of await readdir(path.join(root, 'public'))) {
  if (entry === 'uploads' || entry.startsWith('.')) continue;
  await cp(path.join(root, 'public', entry), path.join(output, entry), { recursive: true });
}
console.log('Prepared storefront assets in dist/. Local uploads and catalog data are excluded.');
