import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function createAssets(root = process.cwd()) {
  return {
    async fetch(request) {
      const route = new URL(request.url).pathname;
      if (['/admin.html', '/login.html'].includes(route)) {
        return new Response(request.method === 'HEAD' ? null : await readFile(path.join(root, 'public', route.slice(1))), {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
      if (request.method === 'HEAD') {
        const assets = JSON.parse(await readFile(path.join(root, '.netlify/shop-assets.json'), 'utf8'));
        if (assets.includes(route)) return new Response(null);
      }
      return new Response('Not found', { status: 404 });
    }
  };
}
