import { fail, readJson, validateProduct, validateSettings, validateVersion, parseImage } from './validation.mjs';
import { getSession, requireSession, requireSameOrigin, login, changePassword, hash, tokenFrom, sessionCookie } from './auth.mjs';

const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
};
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { ...SECURITY, 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...headers } });
const productRow = row => ({ ...JSON.parse(row.document), id:row.id, status:row.status, version:row.version, createdAt:row.created_at });
async function catalog(env, admin = false) {
  const [settings, products] = await env.DB.batch([
    env.DB.prepare('SELECT document, version FROM settings WHERE id = 1'),
    env.DB.prepare(`SELECT * FROM products ${admin ? '' : "WHERE status = 'active'"} ORDER BY created_at, id`)
  ]);
  if (!settings.results[0]) throw fail('The shop is being prepared. Please check back shortly.', 503);
  return { settings: { ...JSON.parse(settings.results[0].document), version: settings.results[0].version }, products: products.results.map(productRow) };
}
async function imageExists(image, request, env) {
  if (!image) return;
  const found = image.startsWith('/uploads/') ? await env.IMAGES.head(image.slice(9)) : (await env.ASSETS.fetch(new Request(new URL(image, request.url), {method:'HEAD'}))).ok;
  if (!found) throw fail('This image could not be found. Please upload it again.');
}
async function asset(request, env, pathname) {
  const url = new URL(request.url); if (pathname) url.pathname = pathname;
  const response = await env.ASSETS.fetch(new Request(url, { method:request.method, headers: request.headers }));
  const headers = new Headers(response.headers);
  for (const [key,value] of Object.entries(SECURITY)) headers.set(key,value);
  if (pathname?.includes('admin') || pathname?.includes('login')) headers.set('Cache-Control','no-store');
  return new Response(response.body,{status:response.status,headers});
}
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url); const route = url.pathname;
      if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) return Response.redirect(`https://${url.host}${url.pathname}${url.search}`,308);
      if (route === '/api/health' && request.method === 'GET') { await env.DB.prepare('SELECT 1').first(); return json({status:'ok'}); }
      if (route === '/api/auth/login' && request.method === 'POST') { const {token} = await login(request,env); return json({authenticated:true},200,{'Set-Cookie':sessionCookie(request,token)}); }
      if (route === '/api/auth/session' && request.method === 'GET') return json({authenticated:!!await getSession(request,env),mode:'cloud',canChangePassword:!!env.CREDENTIALS,uploadMaxBytes:env.UPLOAD_MAX_BYTES || 5*1024*1024});
      if (route === '/api/auth/password' && request.method === 'POST') {
        await changePassword(request,env);
        return json({changed:true},200,{'Set-Cookie':sessionCookie(request,'',0)});
      }
      if (route === '/api/auth/logout' && request.method === 'POST') {
        requireSameOrigin(request); const token = tokenFrom(request);
        if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hash(token)).run();
        return json({authenticated:false},200,{'Set-Cookie':sessionCookie(request,'',0)});
      }
      if (route === '/api/store' && request.method === 'GET') return json(await catalog(env));
      if (route.startsWith('/uploads/') && ['GET','HEAD'].includes(request.method)) {
        const key=route.slice(9); if(!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(key))throw fail('Image not found.',404);
        const object=await env.IMAGES.get(key);if(!object)throw fail('Image not found.',404);
        return new Response(request.method === 'HEAD' ? null : object.body,{headers:{...SECURITY,'Content-Type':object.httpMetadata?.contentType || 'application/octet-stream','Cache-Control':'public, max-age=86400','ETag':object.httpEtag}});
      }
      if (['/login','/login.html'].includes(route) && ['GET','HEAD'].includes(request.method)) return asset(request,env,'/login.html');
      if (['/admin','/admin/','/admin.html'].includes(route) && ['GET','HEAD'].includes(request.method)) {
        if (!await getSession(request,env)) return new Response(null,{status:302,headers:{...SECURITY,Location:'/login','Cache-Control':'no-store'}});
        return asset(request,env,'/admin.html');
      }
      if (route.startsWith('/api/')) {
        await requireSession(request,env);
        if (!['GET','HEAD'].includes(request.method)) requireSameOrigin(request);
        if (route === '/api/admin' && request.method === 'GET') return json(await catalog(env,true));
        if (route === '/api/admin/export' && request.method === 'GET') return json({format:'aurel-catalog-v1',exportedAt:new Date().toISOString(),...await catalog(env,true)},200,{'Content-Disposition':`attachment; filename="shop-catalog-${new Date().toISOString().slice(0,10)}.json"`});
        if (route === '/api/settings' && request.method === 'PUT') {
          const input = await readJson(request); const settings=validateSettings(input); const version=validateVersion(input.version);
          const row=await env.DB.prepare('UPDATE settings SET document = ?, version = version + 1 WHERE id = 1 AND version = ? RETURNING version').bind(JSON.stringify(settings),version).first();
          if(!row)throw fail('Shop settings changed in another tab. Reload before saving to avoid overwriting them.',409);
          return json({...settings,version:row.version});
        }
        if (route === '/api/products' && request.method === 'POST') {
          const product=validateProduct(await readJson(request));await imageExists(product.image,request,env);
          const id=crypto.randomUUID(),createdAt=new Date().toISOString();
          await env.DB.prepare('INSERT INTO products(id, document, status, created_at) VALUES(?, ?, ?, ?)').bind(id,JSON.stringify(product),product.status,createdAt).run();
          return json({...product,id,createdAt,version:1},201);
        }
        const match=route.match(/^\/api\/products\/([a-zA-Z0-9-]+)$/);
        if(match && ['PUT','DELETE'].includes(request.method)) {
          const input=await readJson(request); const version=validateVersion(input.version);
          if(request.method==='DELETE') {
            const result=await env.DB.prepare('DELETE FROM products WHERE id = ? AND version = ? RETURNING id').bind(match[1],version).first();
            if(!result)throw fail('This product changed or was deleted in another tab. Reload before trying again.',409);
            return json({deleted:true});
          }
          const product=validateProduct(input);await imageExists(product.image,request,env);
          const row=await env.DB.prepare('UPDATE products SET document = ?, status = ?, version = version + 1 WHERE id = ? AND version = ? RETURNING *').bind(JSON.stringify(product),product.status,match[1],version).first();
          if(!row)throw fail('This product changed or was deleted in another tab. Reload before saving to avoid overwriting it.',409);
          return json(productRow(row));
        }
        if(route==='/api/uploads' && request.method==='POST') {
          const limit=env.UPLOAD_MAX_BYTES || 5*1024*1024;
          const input=await readJson(request,Math.ceil(limit*4/3)+1024);const image=parseImage(input.data);
          if(image.bytes.length>limit)throw fail(`Choose an image under ${limit/1024/1024} MB.`,413);
          const key=`${crypto.randomUUID()}.${image.extension}`;
          await env.IMAGES.put(key,image.bytes,{httpMetadata:{contentType:image.type}});return json({image:`/uploads/${key}`},201);
        }
        throw fail('This action is not available.',404);
      }
      if(!['GET','HEAD'].includes(request.method))throw fail('Method not allowed.',405);
      return asset(request,env,route==='/'?'/index.html':undefined);
    } catch(error) {
      // Never log passwords, cookies, request bodies or secret values.
      if(!error.status) console.error('Shop request failed:',error.name);
      return json({error:error.status?error.message:'The shop could not complete this request. Please try again.'},error.status||500,error.status===429?{'Retry-After':'900'}:{});
    }
  },
  async scheduled(_event,env) {
    const now=Date.now();await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),env.DB.prepare('DELETE FROM login_attempts WHERE expires_at <= ?').bind(now)]);
  }
};
