import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('Cloud shop: authentication, durable storage and safe catalog editing', { timeout: 120000 }, async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'glow-cloud-'));
  const password = randomBytes(24).toString('base64url');
  const digest = value => createHash('sha256').update(value).digest('hex');
  const options = hash => convertV4MiniflareOptions({
    modules: true, scriptPath: path.resolve('cloud/worker.mjs'), compatibilityDate: '2026-10-23',
    compatibilityFlags: ['nodejs_compat'], cf: false, port: 0,
    bindings: { ADMIN_PASSWORD_HASH: hash },
    d1Databases: ['DB'], r2Buckets: ['IMAGES'],
    d1Persist: path.join(directory, 'd1'), r2Persist: path.join(directory, 'r2'),
    serviceBindings: { ASSETS: async request => {
      const route = new URL(request.url).pathname;
      if (!['/index.html', '/admin.html', '/login.html', '/assets/vase.png'].includes(route)) return new Response('Not found', { status: 404 });
      return new Response(request.method === 'HEAD' ? null : await readFile(path.join('public', route)), { headers: { 'Content-Type': route.endsWith('.png') ? 'image/png' : 'text/html' } });
    } }
  });
  let mf = new Miniflare(options(digest(password)));
  let cookie = '', product, uploaded;
  const request = (route, method = 'GET', data, headers = {}) => mf.dispatchFetch(`https://shop.example${route}`, {
    method, redirect: 'manual', headers: { Origin: 'https://shop.example', 'Content-Type': 'application/json', 'X-Shop-Request': 'local-admin', Cookie: cookie, ...headers },
    body: data === undefined ? undefined : JSON.stringify(data)
  });
  try {
    let db = await mf.getD1Database('DB');
    // Execute full SQL statements individually; D1 exec's line-oriented API isn't a migration runner.
    for (const file of (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort()) {
      const sql = (await readFile(path.join('migrations', file), 'utf8')).replace(/^--.*$/gm, '');
      const statements = sql.split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean);
      await db.batch(statements.map(sql => db.prepare(sql)));
    }
    await t.test('public catalog works; admin routes and writes require login', async () => {
      assert.equal((await (await request('/api/store')).json()).products.length, 4);
      for (const route of ['/admin', '/admin/', '/admin.html']) {
        const response = await request(route); assert.equal(response.status, 302); assert.equal(response.headers.get('location'), '/login');
      }
      assert.equal((await request('/api/admin')).status, 401);
      assert.equal((await request('/api/products', 'POST', {})).status, 401);
      assert.equal((await request('/api/admin/export')).status, 401);
      assert.equal((await request('/api/admin', 'GET', undefined, { Cookie: '__Host-shop_session=' + 'f'.repeat(64) })).status, 401);
      assert.equal((await request('/login')).status, 200);
      assert.equal((await request('/api/auth/session')).status, 200);
    });
    await t.test('login is origin checked, rate limited, and uses secure cookies', async () => {
      assert.equal((await request('/api/auth/login', 'POST', { password }, { Origin: 'https://evil.example' })).status, 403);
      for (let i = 0; i < 5; i++) assert.equal((await request('/api/auth/login', 'POST', { password: 'wrong' }, { 'CF-Connecting-IP': '192.0.2.2' })).status, 401);
      assert.equal((await request('/api/auth/login', 'POST', { password }, { 'CF-Connecting-IP': '192.0.2.2' })).status, 429);
      const response = await request('/api/auth/login', 'POST', { password }); assert.equal(response.status, 200);
      const setCookie = response.headers.get('set-cookie');
      for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', '__Host-shop_session=']) assert.ok(setCookie.includes(flag));
      cookie = setCookie.split(';')[0];
      assert.equal((await request('/admin')).status, 200);
      assert.equal((await (await request('/api/auth/session')).json()).authenticated, true);
      const row = await db.prepare('SELECT token_hash FROM sessions').first();
      assert.notEqual(row.token_hash, cookie.split('=')[1]);
    });
    await t.test('authenticated writes reject invalid data, missing origin and image spoofing', async () => {
      const sample = { name: 'Test', price: 5, stock: 2, category: 'Objects', status: 'active', image: '', description: '', details: '' };
      assert.equal((await request('/api/products', 'POST', sample, { Origin: '' })).status, 403);
      for (const patch of [{ price: -1 }, { price: 1.001 }, { stock: .5 }, { name: '' }, { image: 'https://external.example/a.png' }, { image: '/assets/missing.png' }]) {
        assert.equal((await request('/api/products', 'POST', { ...sample, ...patch })).status, 400);
      }
      assert.equal((await request('/api/uploads', 'POST', { data: 'data:image/png;base64,PHNjcmlwdD4=' })).status, 400);
      const huge = await request('/api/products', 'POST', { ...sample, description: 'x'.repeat(18000) }); assert.equal(huge.status, 413);
    });
    await t.test('uploads survive and visible products can be edited, hidden, and conflict checked', async () => {
      const data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=';
      const response = await request('/api/uploads', 'POST', { data }); assert.equal(response.status, 201); uploaded = (await response.json()).image;
      assert.equal((await request(uploaded)).headers.get('content-type'), 'image/png');
      const created = await request('/api/products', 'POST', { name: 'Cloud piece', price: 25, stock: 4, category: 'Objects', status: 'active', image: uploaded, description: 'Test', details: '' });
      assert.equal(created.status, 201); product = await created.json();
      assert.ok((await (await request('/api/store')).json()).products.some(p => p.id === product.id));
      const edited = await request(`/api/products/${product.id}`, 'PUT', { ...product, price: 30, status: 'draft' }); assert.equal(edited.status, 200);
      assert.equal((await request(`/api/products/${product.id}`, 'PUT', { ...product, price: 40 })).status, 409);
      assert.equal((await request(`/api/products/${product.id}`, 'DELETE', { version: product.version })).status, 409);
      product = await edited.json();
      assert.ok(!(await (await request('/api/store')).json()).products.some(p => p.id === product.id));
      assert.equal((await (await request('/api/admin')).json()).products.find(p => p.id === product.id).price, 30);
    });
    await t.test('settings persist and exports contain catalog data only', async () => {
      const settings = (await (await request('/api/admin')).json()).settings;
      assert.equal((await request('/api/settings', 'PUT', { ...settings, name: 'Cloud test shop' })).status, 200);
      assert.equal((await request('/api/settings', 'PUT', settings)).status, 409);
      const exported = await (await request('/api/admin/export')).json();
      assert.equal(exported.settings.name, 'Cloud test shop');
      assert.ok(exported.products.some(p => p.id === product.id));
      assert.deepEqual(Object.keys(exported).sort(), ['exportedAt', 'format', 'products', 'settings']);
    });
    await t.test('catalog, images and sessions survive a runtime restart', async () => {
      await mf.dispose(); mf = new Miniflare(options(digest(password))); db = await mf.getD1Database('DB');
      assert.equal((await (await request('/api/admin')).json()).settings.name, 'Cloud test shop');
      assert.equal((await request(uploaded)).status, 200);
      assert.equal((await request(`/api/products/${product.id}`, 'DELETE', { version: product.version })).status, 200);
      assert.equal((await request(uploaded)).status, 200);
    });
    await t.test('logout, expiry and credential rotation invalidate sessions', async () => {
      assert.equal((await request('/api/auth/logout', 'POST', {})).status, 200);
      assert.equal((await request('/api/admin')).status, 401);
      let response = await request('/api/auth/login', 'POST', { password }); cookie = response.headers.get('set-cookie').split(';')[0];
      await db.prepare('UPDATE sessions SET expires_at = 0').run();
      assert.equal((await request('/api/admin')).status, 401);
      response = await request('/api/auth/login', 'POST', { password }); cookie = response.headers.get('set-cookie').split(';')[0];
      await mf.setOptions(options(digest('rotated-test-only-secret')));
      assert.equal((await request('/api/admin')).status, 401);
    });
    await t.test('missing admin configuration fails closed while the public catalog remains available', async () => {
      await mf.setOptions(options(''));
      assert.equal((await request('/api/admin')).status, 503);
      assert.equal((await request('/api/auth/login', 'POST', { password })).status, 503);
      assert.equal((await request('/api/store')).status, 200);
    });
  } finally {
    await mf.dispose();
    if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('glow-cloud-')) await rm(directory, { recursive: true, force: true });
  }
});
