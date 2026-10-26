import { Buffer } from 'node:buffer';
export const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export function text(value, label, max, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw fail(`${label} must be ${required ? 'filled in and ' : ''}no longer than ${max} characters.`);
  return value.trim();
}
export async function readJson(request, limit = 16384) {
  if (!request.body) throw fail('No data was received.');
  if (Number(request.headers.get('content-length')) > limit) throw fail('This request is too large.', 413);
  const reader = request.body.getReader(); const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw fail('This request is too large.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try { const data = JSON.parse(new TextDecoder().decode(buffer)); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data; }
  catch { throw fail('The request could not be read. Please try again.'); }
}
export function validateProduct(input) {
  const product = {
    name: text(input.name, 'Product name', 100), category: text(input.category, 'Category', 50),
    description: text(input.description, 'Description', 3000, false), details: text(input.details, 'Details', 1500, false),
    image: text(input.image, 'Image', 200, false), status: input.status, featured: input.featured === true,
    price: input.price, stock: input.stock
  };
  if (!Number.isFinite(product.price) || product.price < 0 || product.price > 999999 || Math.abs(product.price * 100 - Math.round(product.price * 100)) > .000001) throw fail('Enter a price from 0 to 999,999 with up to two decimal places.');
  if (!Number.isInteger(product.stock) || product.stock < 0 || product.stock > 999999) throw fail('Stock must be a whole number from 0 to 999,999.');
  if (!['active', 'draft'].includes(product.status)) throw fail('Choose Visible or Hidden for product visibility.');
  if (product.image && !/^\/(assets|uploads)\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(product.image)) throw fail('Please use an uploaded product image.');
  return product;
}
export function validateSettings(input) {
  const settings = { name: text(input.name, 'Shop name', 40), tagline: text(input.tagline, 'Headline', 100), description: text(input.description, 'Introduction', 500), announcement: text(input.announcement, 'Announcement', 150, false), about: text(input.about, 'About text', 1000, false), currency: input.currency };
  if (!['USD', 'EUR', 'GBP', 'LBP', 'AED'].includes(settings.currency)) throw fail('Please choose one of the available currencies.');
  return settings;
}
export function validateVersion(value) {
  if (!Number.isInteger(value) || value < 1) throw fail('Reload this page before saving your changes.', 409);
  return value;
}
export function parseImage(data) {
  const match = typeof data === 'string' && data.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw fail('Choose a JPG, PNG, or WebP image.');
  let bytes; try { bytes = Buffer.from(match[2], 'base64'); } catch { throw fail('This image could not be read.'); }
  if (bytes.length > 5 * 1024 * 1024) throw fail('Choose an image under 5 MB.', 413);
  const head = new TextDecoder().decode(bytes.subarray(0,12));
  const valid = match[1] === 'png' ? [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v) : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : head.startsWith('RIFF') && head.slice(8) === 'WEBP';
  if (!valid) throw fail('This file is not a supported image.');
  return { bytes, type: `image/${match[1]}`, extension: match[1] === 'jpeg' ? 'jpg' : match[1] };
}
