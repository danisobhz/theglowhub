import { getDatabase } from '@netlify/database';
import shop from '../../cloud/worker.mjs';
import { createDatabase } from '../lib/database.mjs';

export default async function cleanup(_request, context) {
  if (context.deploy.context !== 'production') return new Response(null, { status: 204 });
  const pool = getDatabase().pool;
  try { await shop.scheduled(null, { DB: createDatabase(pool) }); }
  finally { await pool.end(); }
  return new Response(null, { status: 204 });
}

export const config = { schedule: '17 3 * * *' };
