import { access } from 'node:fs/promises';
import { root, run, wrangler } from './cli.mjs';
import path from 'node:path';
await access(path.join(root, '.dev.vars')).catch(() => { throw new Error('First run npm run admin:password -- --local in your terminal.'); });
await run(['scripts/build.mjs']);
await wrangler(['d1', 'migrations', 'apply', 'theglowhub-catalog', '--local']);
await wrangler(['dev', '--local', '--ip', '127.0.0.1', ...process.argv.slice(2)]);
