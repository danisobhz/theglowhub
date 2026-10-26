export const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (value, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: value % 1 ? 2 : 0 }).format(value);
export const icon = (name, size = 20) => {
  const paths = {
    search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
    bag: '<path d="M5 7.5h14l1 13H4l1-13Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    grid: '<rect x="3.5" y="3.5" width="6" height="6" rx=".5"/><rect x="14.5" y="3.5" width="6" height="6" rx=".5"/><rect x="3.5" y="14.5" width="6" height="6" rx=".5"/><rect x="14.5" y="14.5" width="6" height="6" rx=".5"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="17" r="3" fill="currentColor"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="1"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>',
    external: '<path d="M14 3h7v7m0-7L10 14M10 4H4v16h16v-6"/>',
    leaf: '<path d="M5 19C-1 7 13 2 21 3c1 12-8 19-16 16ZM5 19 16 8"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.image}</svg>`;
};
export async function api(path, method = 'GET', data) {
  let response;
  try { response = await fetch(path, { method, headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Shop-Request': 'local-admin' }, body: data === undefined ? undefined : JSON.stringify(data) }); }
  catch { throw new Error('We could not reach your shop. Check your connection and try again.'); }
  let result;
  try { result = await response.json(); } catch { throw new Error('The shop is not responding. Check your connection and try again.'); }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new CustomEvent('shop:sign-in-required'));
    throw Object.assign(new Error(result.error || 'Something went wrong. Please try again.'), {status: response.status});
  }
  return result;
}
let toastTimer;
export function toast(message, error = false) {
  const el = document.querySelector('#toast'); clearTimeout(toastTimer);
  const activeDialogs = document.querySelectorAll('dialog[open]');
  (activeDialogs.length ? activeDialogs[activeDialogs.length - 1] : document.body).append(el);
  el.textContent = message; el.className = `toast visible${error ? ' error' : ''}`;
  toastTimer = setTimeout(() => el.classList.remove('visible'), error ? 6500 : 3500);
}
export function openDialog(dialog) { dialog.showModal(); document.body.classList.add('dialog-open'); }
export function closeDialog(dialog) { dialog.close(); if (!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-open'); }
export function setupDialogs() {
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('close', () => { if (!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-open'); });
    dialog.addEventListener('click', e => { if (e.target === dialog && dialog.dataset.dismiss !== 'false') { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(dialog); } });
  });
}
