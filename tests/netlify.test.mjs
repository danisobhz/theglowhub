import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import shop from '../cloud/worker.mjs';
import { createDatabase, postgresQuery } from '../netlify/lib/database.mjs';
import { createImages } from '../netlify/lib/images.mjs';
import { createAssets } from '../netlify/lib/assets.mjs';
import { createCredentials, encodePassword, verifyPassword } from '../netlify/lib/credentials.mjs';

test('human passwords use salted scrypt and reject incorrect passwords', async () => {
  const encoded = await encodePassword('A long personal passphrase');
  assert.match(encoded, /^scrypt-v1:/);
  assert.equal(await verifyPassword('A long personal passphrase', encoded), true);
  assert.equal(await verifyPassword('Wrong personal passphrase', encoded), false);
  assert.equal(await verifyPassword('anything', 'invalid'), false);
});

test('Postgres parameter conversion preserves quoted SQL and separates all values', () => {
  assert.deepEqual(postgresQuery("SELECT '?' AS text WHERE id = ? AND value = ?", ['id', "a'; DROP TABLE products; --"]), {
    text: "SELECT '?' AS text WHERE id = $1 AND value = $2", values: ['id', "a'; DROP TABLE products; --"]
  });
  assert.throws(() => postgresQuery('SELECT ?', []));
});

test('Netlify shop uses real Postgres for sessions, catalog and concurrent edits', {
  skip: !process.env.NETLIFY_TEST_DATABASE_URL, timeout: 60000
}, async t => {
  const connectionString = process.env.NETLIFY_TEST_DATABASE_URL;
  const schema = `shop_test_${randomBytes(8).toString('hex')}`;
  const admin = new pg.Pool({ connectionString });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString, options: `-c search_path=${schema}`, max: 10 });
  const db = createDatabase(pool);
  const password = randomBytes(24).toString('base64url');
  const digest = value => createHash('sha256').update(value).digest('hex');
  const savedImages = new Map();
  const blobStore = {
    async set(key, bytes, { metadata }) { savedImages.set(key, { bytes: new Uint8Array(bytes), metadata }); },
    async getMetadata(key) { const item = savedImages.get(key); return item ? { metadata: item.metadata, etag: 'test-etag' } : null; },
    async getWithMetadata(key) { const item = savedImages.get(key); return item ? { data: new Blob([item.bytes]).stream(), metadata: item.metadata, etag: 'test-etag' } : null; }
  };
  let env = { DB: db, IMAGES: createImages(blobStore), ASSETS: createAssets(), ADMIN_PASSWORD_HASH: digest(password), CLIENT_IP: '192.0.2.1', UPLOAD_MAX_BYTES: 3*1024*1024 };
  let cookie = '', product, upload;
  const request = (route, method = 'GET', body, headers = {}, override = {}) => shop.fetch(new Request(`https://test.netlify.app${route}`, {
    method, headers: { Origin: 'https://test.netlify.app', 'Content-Type': 'application/json', 'X-Shop-Request': 'local-admin', Cookie: cookie, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  }), { ...env, ...override });
  try {
    for (const name of (await readdir('netlify/database/migrations')).sort()) await pool.query(await readFile(`netlify/database/migrations/${name}`, 'utf8'));
    await t.test('public catalog and protected admin routes', async () => {
      assert.equal((await (await request('/api/store')).json()).products.length, 4);
      for (const route of ['/admin', '/admin/', '/admin.html']) assert.equal((await request(route)).status, 302);
      assert.equal((await request('/api/admin')).status, 401);
      assert.equal((await request('/api/products', 'POST', {})).status, 401);
      assert.equal((await request('/login')).status, 200);
      assert.equal((await (await request('/api/auth/session')).json()).uploadMaxBytes, 3*1024*1024);
    });
    await t.test('concurrent login throttling uses trusted client IP and secure sessions', async () => {
      const responses = await Promise.all(Array.from({length: 7}, (_, i) => request('/api/auth/login', 'POST', {password: 'wrong'}, {'CF-Connecting-IP': `spoof-${i}`})));
      assert.equal(responses.filter(r => r.status === 401).length, 5);
      assert.equal(responses.filter(r => r.status === 429).length, 2);
      env.CLIENT_IP = '192.0.2.2';
      assert.equal((await request('/api/auth/login', 'POST', {password}, {Origin:'https://evil.example'})).status, 403);
      const response = await request('/api/auth/login', 'POST', {password});
      assert.equal(response.status, 200);
      cookie = response.headers.get('set-cookie').split(';')[0];
      assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
      assert.match(response.headers.get('set-cookie'), /Secure/);
      assert.equal((await request('/admin')).status, 200);
      assert.notEqual((await db.prepare('SELECT token_hash FROM sessions').first()).token_hash, cookie.split('=')[1]);
    });
    await t.test('uploads, product validation and image persistence', async () => {
      assert.equal((await request('/api/uploads', 'POST', {data:'data:image/png;base64,PHNjcmlwdD4='})).status, 400);
      const data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=';
      const response = await request('/api/uploads', 'POST', {data});
      assert.equal(response.status, 201); upload = (await response.json()).image;
      assert.equal((await request(upload)).headers.get('content-type'), 'image/png');
      assert.equal((await request(upload,'HEAD')).status, 200);
      const input = {name:"Test O'Keeffe piece",price:22,stock:3,status:'active',category:'Objects',description:'Test',details:'',image:upload};
      for (const patch of [{price:-2}, {stock:.5}, {image:'/assets/missing.png'}]) assert.equal((await request('/api/products','POST',{...input,...patch})).status,400);
      const created = await request('/api/products','POST',input);
      assert.equal(created.status,201);product=await created.json();
      assert.equal((await request('/api/products','POST',input,{Origin:''})).status,403);
    });
    await t.test('simultaneous saves cannot silently overwrite each other', async () => {
      const responses = await Promise.all([30,40].map(price => request(`/api/products/${product.id}`,'PUT',{...product,price,status:'draft'})));
      assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
      product=await responses.find(r=>r.status===200).json();
      assert.equal(product.version,2);
      assert.ok(!(await (await request('/api/store')).json()).products.some(p=>p.id===product.id));
      assert.equal((await request(`/api/products/${product.id}`,'DELETE',{version:1})).status,409);
    });
    await t.test('settings, atomic rollback, exports and restart persistence', async () => {
      const settings=(await (await request('/api/admin')).json()).settings;
      assert.equal((await request('/api/settings','PUT',{...settings,name:'Netlify test'})).status,200);
      assert.equal((await request('/api/settings','PUT',settings)).status,409);
      await assert.rejects(db.batch([db.prepare('DELETE FROM products'), db.prepare('INSERT INTO settings (id,document) VALUES (1, ?)').bind('{}')]));
      env = {...env, DB:createDatabase(pool), IMAGES:createImages(blobStore)};
      const data=await (await request('/api/admin/export')).json();
      assert.equal(data.settings.name,'Netlify test');
      assert.equal(data.products.length,5);
      assert.deepEqual(Object.keys(data).sort(),['exportedAt','format','products','settings']);
      assert.equal((await request(upload)).status,200);
      assert.equal((await request(`/api/products/${product.id}`,'DELETE',{version:product.version})).status,200);
    });
    await t.test('logout, credential rotation, expiry and cleanup', async () => {
      assert.equal((await request('/api/auth/logout','POST',{})).status,200);
      assert.equal((await request('/api/admin')).status,401);
      cookie=(await request('/api/auth/login','POST',{password})).headers.get('set-cookie').split(';')[0];
      assert.equal((await request('/api/admin','GET',undefined,{}, {ADMIN_PASSWORD_HASH:digest('rotated')})).status,401);
      await pool.query('UPDATE sessions SET expires_at = 0');
      assert.equal((await request('/api/admin')).status,401);
      await shop.scheduled(null, env);
      assert.equal((await pool.query('SELECT * FROM sessions')).rowCount,0);
      assert.equal((await request('/api/admin','GET',undefined,{}, {ADMIN_PASSWORD_HASH:''})).status,503);
      assert.equal((await request('/api/store','GET',undefined,{}, {ADMIN_PASSWORD_HASH:''})).status,200);
    });
    await t.test('owner can choose a password, invalidate old sessions and retire legacy deployments', async () => {
      env.CREDENTIALS = createCredentials(pool, env.ADMIN_PASSWORD_HASH);
      assert.equal((await (await request('/api/auth/session')).json()).canChangePassword, true);
      cookie = '';
      const newPassword = 'My own memorable phrase 123';
      const payload = {currentPassword:password,newPassword};
      assert.equal((await request('/api/auth/password','POST',payload)).status,401);
      cookie = (await request('/api/auth/login','POST',{password})).headers.get('set-cookie').split(';')[0];
      const oldCookie = cookie;
      assert.equal((await request('/api/auth/password','POST',payload,{Origin:'https://evil.example'})).status,403);
      assert.equal((await request('/api/auth/password','POST',{...payload,newPassword:'short'})).status,400);
      assert.equal((await request('/api/auth/password','POST',{...payload,currentPassword:'incorrect'})).status,400);
      assert.equal((await request('/api/admin')).status,200);
      const changed = await request('/api/auth/password','POST',payload);
      assert.equal(changed.status,200);
      assert.match(changed.headers.get('set-cookie'), /Max-Age=0/);
      assert.equal((await request('/api/admin')).status,401);
      assert.equal((await request('/api/auth/login','POST',{password})).status,401);
      const stored = (await pool.query('SELECT * FROM owner_credentials')).rows[0];
      assert.match(stored.password_hash, /^scrypt-v1:/);
      assert.notEqual(stored.password_hash, newPassword);
      // A fresh invocation must retain the chosen password even without bootstrap configuration.
      env.CREDENTIALS = createCredentials(pool, '');
      cookie = (await request('/api/auth/login','POST',{password:newPassword})).headers.get('set-cookie').split(';')[0];
      assert.equal((await request('/api/admin')).status,200);
      assert.equal((await request('/api/admin','GET',undefined,{Cookie:oldCookie})).status,401);
      // Simulate an old immutable function. Its transaction cannot recreate a bootstrap session,
      // and its attempt to delete current sessions rolls back too.
      assert.equal((await request('/api/auth/login','POST',{password},{},{CREDENTIALS:undefined})).status,500);
      assert.equal((await request('/api/admin')).status,200);
      const second = {currentPassword:newPassword,newPassword:'Another personal phrase 456'};
      const statuses = (await Promise.all([request('/api/auth/password','POST',second),request('/api/auth/password','POST',second)])).map(r=>r.status).sort();
      assert.equal(statuses[0],200);
      assert.ok([401,409].includes(statuses[1]));
      assert.equal((await request('/api/auth/login','POST',{password:newPassword})).status,401);
      assert.equal((await request('/api/auth/login','POST',{password:second.newPassword})).status,200);
      // Current-password guesses share the persistent login throttle.
      cookie = (await request('/api/auth/login','POST',{password:second.newPassword})).headers.get('set-cookie').split(';')[0];
      for(let i=0;i<5;i++) assert.equal((await request('/api/auth/password','POST',{currentPassword:'wrong',newPassword:'A different phrase 789'})).status,400);
      assert.equal((await request('/api/auth/password','POST',{currentPassword:second.newPassword,newPassword:'A different phrase 789'})).status,429);
    });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
