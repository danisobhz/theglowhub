import { timingSafeEqual } from 'node:crypto';
import { fail, readJson } from './validation.mjs';

const encoder = new TextEncoder();
export const SESSION_SECONDS = 8 * 60 * 60;
export const COOKIE = '__Host-shop_session';
const local = request => ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname);
export const cookieName = request => local(request) ? 'shop_session_local' : COOKIE;
export async function hash(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(b => b.toString(16).padStart(2,'0')).join(''); }
export function randomToken() { return [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2,'0')).join(''); }
export function requireConfiguration(env) {
  if (!/^[a-f0-9]{64}$/.test(env.ADMIN_PASSWORD_HASH || '')) throw fail('The shop owner has not finished setting up admin access.', 503);
}
export function tokenFrom(request) {
  const name = cookieName(request);
  return (request.headers.get('cookie') || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${name}=`))?.slice(name.length+1) || '';
}
export function sessionCookie(request, token, maxAge = SESSION_SECONDS) {
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${local(request) ? '' : '; Secure'}`;
}
export async function getSession(request, env) {
  requireConfiguration(env);
  const token = tokenFrom(request); if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await hash(token);
  return env.DB.prepare('SELECT token_hash, expires_at FROM sessions WHERE token_hash = ? AND credential_version = ? AND expires_at > ?').bind(tokenHash, env.ADMIN_PASSWORD_HASH, Date.now()).first();
}
export async function requireSession(request, env) {
  const session = await getSession(request, env);
  if (!session) throw fail('Your session has expired. Sign in again, then retry saving your changes.', 401);
  return session;
}
export function requireSameOrigin(request) {
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site' || request.headers.get('x-shop-request') !== 'local-admin' || !request.headers.get('content-type')?.startsWith('application/json')) throw fail('Please make changes through your shop admin.', 403);
}
export async function login(request, env) {
  requireConfiguration(env); requireSameOrigin(request);
  const { password } = await readJson(request, 2048);
  if (typeof password !== 'string' || password.length > 256) throw fail('Enter your admin password.', 401);
  const now = Date.now(); const expires = now + 15 * 60 * 1000;
  const address = request.headers.get('cf-connecting-ip') || 'local';
  const key = await hash(`${env.ADMIN_PASSWORD_HASH}:${address}`);
  const attempt = await env.DB.prepare(`INSERT INTO login_attempts(key, attempts, expires_at) VALUES(?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END,
    expires_at = CASE WHEN expires_at <= ? THEN ? ELSE expires_at END RETURNING attempts`).bind(key, expires, now, now, expires).first();
  if (attempt.attempts > 5) throw fail('Too many sign-in attempts. Please wait 15 minutes and try again.', 429);
  const digest = await hash(password);
  if (!timingSafeEqual(encoder.encode(digest), encoder.encode(env.ADMIN_PASSWORD_HASH))) throw fail('That password is not correct. Please try again.', 401);
  const token = randomToken(); const tokenHash = await hash(token);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ? OR credential_version <> ?').bind(now, env.ADMIN_PASSWORD_HASH),
    env.DB.prepare('INSERT INTO sessions(token_hash, credential_version, expires_at) VALUES(?, ?, ?)').bind(tokenHash, env.ADMIN_PASSWORD_HASH, now + SESSION_SECONDS * 1000)
  ]);
  return { token };
}
