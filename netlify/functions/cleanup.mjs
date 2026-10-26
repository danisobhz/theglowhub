import { getDatabase } from '@netlify/database';
import shop from '../../cloud/worker.mjs';
import { createDatabase } from '../lib/database.mjs';

export default async function cleanup(_request, context) {
  if (context.deploy.context !== 'production') return new Response(null, { status: 204 });
  await shop.scheduled(null, { DB: createDatabase(getDatabase().pool) });
  return new Response(null, { status: 204 });
}

export const config = { schedule: '17 3 * * *' };
