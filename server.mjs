import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { seed } from './seed.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const string = (value, label, max, required = true) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw fail(`${label} must be ${required ? 'filled in and ' : ''}no longer than ${max} characters.`);
  return value.trim();
};

async function body(req, max = 7 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw fail('This file is too large. Choose an image under 5 MB.', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw fail('The request could not be read. Please try again.'); }
}

export async function createShopServer({ dataDir = path.join(root, 'data'), publicDir = path.join(root, 'public'), uploadDir = path.join(publicDir, 'uploads') } = {}) {
  await mkdir(dataDir, { recursive: true }); await mkdir(uploadDir, { recursive: true });
  const dbPath = path.join(dataDir, 'store.json');
  let db;
  try { db = JSON.parse(await readFile(dbPath, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw new Error('Could not read data/store.json. Your data has been left untouched.', { cause: e }); db = structuredClone(seed); await writeFile(dbPath, JSON.stringify(db, null, 2)); }
  let queue = Promise.resolve();
  function change(edit) {
    const work = queue.then(async () => {
      const next = structuredClone(db); const result = edit(next);
      const temporary = `${dbPath}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(next, null, 2)); await rename(temporary, dbPath); db = next; return result;
    });
    queue = work.catch(() => {}); return work;
  }
  async function validateProduct(input) {
    const product = {
      name: string(input.name, 'Product name', 100),
      category: string(input.category, 'Category', 50),
      description: string(input.description, 'Description', 3000, false),
      details: string(input.details, 'Details', 1500, false),
      image: string(input.image, 'Image', 200, false),
      status: input.status,
      featured: input.featured === true,
      price: input.price,
      stock: input.stock
    };
    if (!Number.isFinite(product.price) || product.price < 0 || product.price > 999999 || Math.abs(product.price * 100 - Math.round(product.price * 100)) > 0.000001) throw fail('Enter a price from 0 to 999,999 with up to two decimal places.');
    if (!Number.isInteger(product.stock) || product.stock < 0 || product.stock > 999999) throw fail('Stock must be a whole number from 0 to 999,999.');
    if (!['active', 'draft'].includes(product.status)) throw fail('Choose Visible or Hidden for product visibility.');
    if (product.image) {
      if (!/^\/(assets|uploads)\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(product.image)) throw fail('Please use an uploaded product image.');
      try { await stat(product.image.startsWith('/uploads/') ? path.join(uploadDir, path.basename(product.image)) : path.join(publicDir, product.image)); }
      catch { throw fail('That image could not be found. Please upload it again.'); }
    }
    return product;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const host = req.headers.host || '';
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) throw fail('This shop is available on this computer only.', 403);
      const url = new URL(req.url, `http://${host}`);
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (req.headers.origin && req.headers.origin !== `http://${host}`) throw fail('Requests must come from this local shop.', 403);
        if (req.headers['sec-fetch-site'] === 'cross-site') throw fail('Requests must come from this local shop.', 403);
        if (req.headers['x-shop-request'] !== 'local-admin' || !req.headers['content-type']?.startsWith('application/json')) throw fail('Please make changes through the local admin.', 403);
      }
      if (url.pathname === '/api/store' && req.method === 'GET') return json({ settings: db.settings, products: db.products.filter(p => p.status === 'active') });
      if (url.pathname === '/api/auth/session' && req.method === 'GET') return json({ authenticated: true, mode: 'local' });
      if (url.pathname === '/api/admin' && req.method === 'GET') return json(db);
      if (url.pathname === '/api/admin/export' && req.method === 'GET') return json({format:'aurel-catalog-v1',exportedAt:new Date().toISOString(),...db});
      if (url.pathname === '/api/settings' && req.method === 'PUT') {
        const input = await body(req, 16384);
        const settings = { name: string(input.name, 'Shop name', 40), tagline: string(input.tagline, 'Headline', 100), description: string(input.description, 'Introduction', 500), announcement: string(input.announcement, 'Announcement', 150, false), about: string(input.about, 'About text', 1000, false), currency: input.currency };
        if (!['USD', 'EUR', 'GBP', 'LBP', 'AED'].includes(settings.currency)) throw fail('Please choose one of the available currencies.');
        await change(next => { next.settings = settings; }); return json(settings);
      }
      if (url.pathname === '/api/products' && req.method === 'POST') {
        const input = await body(req, 16384); const product = { ...await validateProduct(input), id: randomUUID(), createdAt: new Date().toISOString() };
        await change(next => next.products.push(product)); return json(product, 201);
      }
      const match = url.pathname.match(/^\/api\/products\/([a-zA-Z0-9-]+)$/);
      if (match && ['PUT', 'DELETE'].includes(req.method)) {
        const fields = req.method === 'PUT' ? await validateProduct(await body(req, 16384)) : null;
        const result = await change(next => {
          const i = next.products.findIndex(p => p.id === match[1]); if (i < 0) throw fail('This product no longer exists. Refresh and try again.', 404);
          if (fields) { next.products[i] = { ...next.products[i], ...fields }; return next.products[i]; }
          next.products.splice(i, 1); return { deleted: true };
        }); return json(result);
      }
      if (url.pathname === '/api/uploads' && req.method === 'POST') {
        const input = await body(req);
        const data = typeof input.data === 'string' && input.data.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
        if (!data) throw fail('Choose a JPG, PNG, or WebP image.');
        const buffer = Buffer.from(data[2], 'base64'); if (buffer.length > 5 * 1024 * 1024) throw fail('Choose an image under 5 MB.', 413);
        const valid = data[1] === 'png' ? buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : data[1] === 'jpeg' ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
        if (!valid) throw fail('This file is not a supported image. Choose a different photo.');
        const name = `${randomUUID()}.${data[1] === 'jpeg' ? 'jpg' : data[1]}`; await writeFile(path.join(uploadDir, name), buffer); return json({ image: `/uploads/${name}` }, 201);
      }
      if (url.pathname.startsWith('/api/')) throw fail('This action is not available.', 404);
      if (!['GET', 'HEAD'].includes(req.method)) throw fail('Method not allowed.', 405);
      const route = url.pathname === '/' ? '/index.html' : ['/admin', '/admin/'].includes(url.pathname) ? '/admin.html' : url.pathname === '/login' ? '/login.html' : decodeURIComponent(url.pathname);
      const base = route.startsWith('/uploads/') ? uploadDir : publicDir;
      const file = route.startsWith('/uploads/') ? path.resolve(base, route.slice(9)) : path.resolve(base, `.${route}`);
      if (!file.startsWith(`${path.resolve(base)}${path.sep}`)) throw fail('Not found.', 404);
      let bytes;
      try { bytes = await readFile(file); } catch { throw fail('Not found.', 404); }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': route.startsWith('/uploads/') ? 'public, max-age=86400' : 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (e) { if (!e.status) console.error(e); json({ error: e.status ? e.message : 'Something went wrong while saving. Please try again.' }, e.status || 500); }
  });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  const server = await createShopServer();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. The shop may already be running. Open http://localhost:${port} or set a different PORT.` : error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`\nAurel is running locally.\nShop:  http://localhost:${port}\nAdmin: http://localhost:${port}/admin\n\nKeep this window open. Press Ctrl+C to stop.\n`));
}
