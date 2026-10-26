import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
export function run(args, { input, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: [input === undefined ? 'inherit' : 'pipe', capture ? 'pipe' : 'inherit', 'inherit'] });
    let output = '';
    if (capture) child.stdout.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(`Command failed with exit code ${code}.`)));
    if (input !== undefined) child.stdin.end(input);
  });
}
export const wrangler = (args, options) => run(['node_modules/wrangler/bin/wrangler.js', ...args], options);
