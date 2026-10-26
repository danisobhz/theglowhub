import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const ignored = new Set(['node_modules', '.git', '.wrangler', 'dist', 'data', 'backups', 'previews']);
async function check(dir) {
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, file.name);
    if (file.isDirectory() && !ignored.has(file.name)) await check(target);
    else if (file.isFile() && /\.(mjs|js)$/.test(file.name)) {
      const result = spawnSync(process.execPath, ['--check', target], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
await check('.');
console.log('JavaScript syntax checks passed.');
