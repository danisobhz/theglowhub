import './build.mjs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';

await mkdir('.netlify', { recursive: true });
const assets = (await readdir('dist/assets')).map(name => `/assets/${name}`);
await writeFile('.netlify/shop-assets.json', JSON.stringify(assets));
// These pages must only be served through the function's authentication gate.
await rm('dist/admin.html', { force: true });
await rm('dist/login.html', { force: true });
console.log('Prepared Netlify assets and protected admin pages.');
