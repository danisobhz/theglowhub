import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createShopServer } from '../server.mjs';

test('Local shop: product lifecycle, uploads, visibility, persistence, and request boundaries', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aurel-test-'));
  const dataDir = path.join(directory, 'data'), uploadDir = path.join(directory, 'uploads');
  let server = await createShopServer({ dataDir, uploadDir });
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const close = server => new Promise((resolve,reject) => server.close(e => e ? reject(e) : resolve()));
  await listen(server);
  let url = `http://127.0.0.1:${server.address().port}`;
  const request = async (route, method = 'GET', data, extraHeaders = {}) => {
    const response = await fetch(url + route, { method, headers: { 'Content-Type': 'application/json', 'X-Shop-Request': 'local-admin', ...extraHeaders }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, data: await response.json() };
  };
  let product, uploaded;
  try {
    await t.test('seeds a local catalog and serves both pages', async () => {
      const store = await request('/api/store'); assert.equal(store.status, 200); assert.equal(store.data.products.length, 4);
      assert.equal((await fetch(url)).status,200); assert.equal((await fetch(url+'/admin')).status,200);
      assert.deepEqual((await request('/api/auth/session')).data,{authenticated:true,mode:'local'});
      const backup=(await request('/api/admin/export')).data;
      assert.equal(backup.format,'aurel-catalog-v1'); assert.equal(backup.products.length,4);
    });
    await t.test('rejects invalid pricing, stock, and external image references', async () => {
      const draft={name:'Test piece',price:10,stock:3,category:'Test',description:'',details:'',image:'',status:'active'};
      for(const patch of [{price:-1},{price:1.001},{stock:0.5},{stock:-1},{name:''},{image:'https://example.com/image.jpg'}]) {
        assert.equal((await request('/api/products','POST',{...draft,...patch})).status,400);
      }
    });
    await t.test('uploads a valid local image and rejects disguised files', async () => {
      const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=';
      const response=await request('/api/uploads','POST',{data:png}); assert.equal(response.status,201);uploaded=response.data.image;
      assert.match(uploaded,/^\/uploads\/.+\.png$/);assert.equal((await fetch(url+uploaded)).status,200);
      assert.equal((await request('/api/uploads','POST',{data:'data:image/png;base64,PHNjcmlwdD4='})).status,400);
      assert.equal((await request('/api/uploads','POST',{data:'data:image/svg+xml;base64,PHN2Zz4='})).status,400);
    });
    await t.test('adds, edits and hides products while retaining admin access', async () => {
      const response=await request('/api/products','POST',{name:'Test piece',price:25.5,stock:3,category:'Test',description:'A test object',details:'Test details',image:uploaded,status:'active',featured:true});
      assert.equal(response.status,201);product=response.data;
      assert.equal((await request('/api/store')).data.products.find(p=>p.id===product.id).price,25.5);
      const updated=await request(`/api/products/${product.id}`,'PUT',{...product,name:'Renamed piece',price:30,stock:0,status:'draft'});
      assert.equal(updated.status,200);product=updated.data;
      assert.ok(!(await request('/api/store')).data.products.some(p=>p.id===product.id));
      assert.equal((await request('/api/admin')).data.products.find(p=>p.id===product.id).name,'Renamed piece');
    });
    await t.test('saves settings and rejects cross-origin changes and unexpected hosts', async () => {
      const settings=(await request('/api/admin')).data.settings;
      assert.equal((await request('/api/settings','PUT',{...settings,name:'Test atelier',currency:'EUR'})).status,200);
      assert.equal((await request('/api/settings','PUT',settings,{Origin:'https://unrelated.example'})).status,403);
      const blocked=await fetch(url+'/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(blocked.status,403);
      const hostStatus=await new Promise((resolve,reject)=>{http.get(url+'/api/admin',{headers:{Host:'unrelated.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
      assert.equal(hostStatus,403);
    });
    await t.test('keeps saved changes and uploads across server restarts', async () => {
      await close(server);server=await createShopServer({dataDir,uploadDir});await listen(server);url=`http://127.0.0.1:${server.address().port}`;
      const db=(await request('/api/admin')).data;assert.equal(db.settings.name,'Test atelier');assert.equal(db.settings.currency,'EUR');
      assert.equal(db.products.find(p=>p.id===product.id).stock,0);assert.equal((await fetch(url+uploaded)).status,200);
      assert.equal(JSON.parse(await readFile(path.join(dataDir,'store.json'),'utf8')).settings.name,'Test atelier');
    });
    await t.test('serializes concurrent edits without losing other products', async () => {
      const creates=await Promise.all(['One','Two','Three'].map(name=>request('/api/products','POST',{...product,id:undefined,name})));
      assert.ok(creates.every(r=>r.status===201));
      const db=(await request('/api/admin')).data;assert.ok(['One','Two','Three'].every(name=>db.products.some(p=>p.name===name)));
    });
    await t.test('deletes a product and returns a useful error for missing products', async () => {
      assert.equal((await request(`/api/products/${product.id}`,'DELETE',{})).status,200);
      assert.ok(!(await request('/api/admin')).data.products.some(p=>p.id===product.id));
      assert.equal((await request(`/api/products/${product.id}`,'DELETE',{})).status,404);
      assert.equal((await fetch(url+'/..%2f..%2fserver.mjs')).status,404);
    });
  } finally {
    await close(server);
    const target=path.resolve(directory), allowed=path.resolve(os.tmpdir())+path.sep;
    if(target.startsWith(allowed) && path.basename(target).startsWith('aurel-test-')) await rm(target,{recursive:true,force:true});
  }
});
