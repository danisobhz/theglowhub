import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

// These files are ignored by Git and outside the deployed dist/ directory.
// Never log the password or include the access file in a deployment bundle.
await mkdir('.netlify', {recursive:true});
const password = randomBytes(24).toString('base64url');
await writeFile('.netlify/admin-access.txt', `The Glow Hub — admin access\n\nOpen /admin on your shop's website.\nPassword: ${password}\n\nSave this in your password manager and keep this file private.\n`, {flag:'wx', mode:0o600});
await writeFile('.netlify/admin-secret.env', `ADMIN_PASSWORD_HASH=${createHash('sha256').update(password).digest('hex')}\n`, {flag:'wx',mode:0o600});
console.log('Created private admin access instructions in .netlify/admin-access.txt. No password was printed.');
