import { randomBytes, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root, wrangler } from './cli.mjs';

// Only generated, high-entropy passwords are supported. Never hash a human-chosen password here.
if (!process.stdout.isTTY || !process.stdin.isTTY) throw new Error('Run this command yourself in a terminal so only you see the generated password.');
const remote = process.argv.includes('--remote');
const local = process.argv.includes('--local');
if (remote === local) throw new Error('Choose --local for the emulator or --remote for the hosted shop.');
const password = randomBytes(24).toString('base64url');
const digest = createHash('sha256').update(password).digest('hex');
if (remote) await wrangler(['secret', 'put', 'ADMIN_PASSWORD_HASH', '--config', 'cloudflare.local.json'], { input: digest + '\n' });
else await writeFile(path.join(root, '.dev.vars'), `ADMIN_PASSWORD_HASH=${digest}\n`, { mode: 0o600 });
console.log(`\nYour ${remote ? 'hosted' : 'local emulator'} admin password:\n\n${password}\n\nSave this in your password manager. It will not be shown again. Previous passwords and sessions no longer work.\n`);
