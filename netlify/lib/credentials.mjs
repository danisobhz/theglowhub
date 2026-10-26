import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { fail } from '../../cloud/validation.mjs';

const derive = promisify(scrypt);
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
export async function encodePassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, options);
  return `scrypt-v1:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (/^[a-f0-9]{64}$/.test(encoded)) {
    // Only the original randomly generated setup credential uses SHA-256.
    return timingSafeEqual(createHash('sha256').update(password).digest(), Buffer.from(encoded, 'hex'));
  }
  const match = /^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(encoded);
  if (!match) return false;
  const key = await derive(password, match[1], 64, options);
  return timingSafeEqual(key, Buffer.from(match[2], 'hex'));
}
export function createCredentials(pool, bootstrapHash) {
  return {
    async get() {
      let row = (await pool.query('SELECT version, password_hash FROM owner_credentials WHERE id = 1')).rows[0];
      if (!row) {
        if (!/^[a-f0-9]{64}$/.test(bootstrapHash || '')) throw fail('Admin access has not been set up yet.', 503);
        await pool.query('INSERT INTO owner_credentials(id, version, password_hash) VALUES(1, $1, $1) ON CONFLICT(id) DO NOTHING', [bootstrapHash]);
        row = (await pool.query('SELECT version, password_hash FROM owner_credentials WHERE id = 1')).rows[0];
      }
      return { version: row.version, verify: password => verifyPassword(password, row.password_hash) };
    },
    async change(expectedVersion, password) {
      const encoded = await encodePassword(password);
      const version = randomBytes(32).toString('hex');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query('UPDATE owner_credentials SET version = $1, password_hash = $2 WHERE id = 1 AND version = $3 RETURNING id', [version, encoded, expectedVersion]);
        if (!result.rowCount) throw fail('Your password changed in another tab. Sign in again with the latest password.', 409);
        await client.query('DELETE FROM sessions');
        await client.query('DELETE FROM login_attempts');
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
  };
}
