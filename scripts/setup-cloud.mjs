import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { root } from './cli.mjs';
import path from 'node:path';

if (!process.stdin.isTTY) throw new Error('Run npm run setup:cloud in your terminal.');
const terminal = createInterface({ input: process.stdin, output: process.stdout });
try {
  console.log('First create your Cloudflare resources using the commands in docs/hosting.md.');
  const databaseId = (await terminal.question('D1 database ID: ')).trim();
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(databaseId) || /^0{8}-/.test(databaseId)) throw new Error('Enter the database UUID returned by Cloudflare.');
  const config = JSON.parse(await readFile(path.join(root, 'wrangler.jsonc'), 'utf8'));
  config.d1_databases[0].database_id = databaseId;
  await writeFile(path.join(root, 'cloudflare.local.json'), JSON.stringify(config, null, 2) + '\n');
  console.log('Saved your deployment configuration. Next run npm run deploy, then npm run admin:password -- --remote.');
} finally { terminal.close(); }
