import { getDatabase } from '@netlify/database';
import { getStore } from '@netlify/blobs';
import shop from '../../cloud/worker.mjs';
import { createDatabase } from '../lib/database.mjs';
import { createImages } from '../lib/images.mjs';
import { createAssets } from '../lib/assets.mjs';

export default async function handler(request, context) {
  // Only the production deployment shares the real shop's image store.
  const environment = context.deploy.context;
  const storeName = environment === 'production' ? 'shop-images' : `shop-images-${context.deploy.id || 'local'}`;
  let pool;
  try {
    pool = getDatabase().pool;
    return await shop.fetch(request, {
      DB: createDatabase(pool),
      IMAGES: createImages(getStore({ name: storeName, consistency: 'strong' })),
      ASSETS: createAssets(),
      ADMIN_PASSWORD_HASH: Netlify.env.get('ADMIN_PASSWORD_HASH'),
      CLIENT_IP: context.ip || 'unknown',
      // Base64 and JSON must fit within Netlify Functions' request-size limit.
      UPLOAD_MAX_BYTES: 3 * 1024 * 1024
    });
  } catch (error) {
    console.error('Shop infrastructure unavailable:', error.name);
    return Response.json({ error: 'The shop is being prepared. Please try again shortly.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' }
    });
  } finally { if (pool) await pool.end(); }
}

export const config = {
  path: ['/api/*', '/uploads/*', '/admin', '/admin/', '/admin.html', '/login', '/login.html'],
  preferStatic: false
};
