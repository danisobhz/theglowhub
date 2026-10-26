import { escapeHTML as esc, money, icon, api, toast, openDialog, closeDialog, setupDialogs } from './shared.js';

const $ = s => document.querySelector(s);
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
setupDialogs();
const productDialog = $('#product-dialog'), bagDialog = $('#bag-dialog');
let products = [], settings = {}, category = 'All', selectedId = null, quantity = 1, bag = [];
try { const saved = JSON.parse(localStorage.getItem('aurel-bag') || '[]'); if (Array.isArray(saved)) bag = saved.filter(x => x && typeof x.id === 'string' && Number.isInteger(x.quantity) && x.quantity > 0); } catch { /* A fresh bag remains usable when browser storage is unavailable. */ }
const price = value => money(value, settings.currency);
const picture = (p, cls = '') => p.image ? `<img class="${cls}" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : `<div class="image-placeholder ${cls}">${icon('image', 40)}<span>Image coming soon</span></div>`;
function saveBag() { try { localStorage.setItem('aurel-bag', JSON.stringify(bag)); } catch { /* Keep the bag in memory for this visit. */ } const count = bag.reduce((n, x) => n + x.quantity, 0); $('#bag-count').textContent = count; $('#open-bag').setAttribute('aria-label', `Open shopping bag, ${count} ${count === 1 ? 'item' : 'items'}`); }
function reconcileBag() {
  const old = JSON.stringify(bag);
  const unique = new Map();
  for (const line of bag) { const p = products.find(p => p.id === line.id); if (p?.stock > 0) unique.set(line.id, { id: line.id, quantity: Math.min((unique.get(line.id)?.quantity || 0) + line.quantity, p.stock) }); }
  bag = [...unique.values()]; saveBag();
  if (old !== JSON.stringify(bag)) toast('Your bag was updated to match current availability.');
}
function applyBrand() {
  document.title = `${settings.name} — ${settings.tagline}`;
  document.querySelectorAll('[data-brand]').forEach(el => el.textContent = settings.name);
  $('#hero-title').textContent = settings.tagline;
  $('#intro').textContent = settings.description;
  $('#announcement').textContent = settings.announcement;
  $('#announcement').hidden = !settings.announcement;
  $('#about-copy').textContent = settings.about;
  $('#year').textContent = new Date().getFullYear();
}
function renderCategories() {
  const cats = ['All', ...new Set(products.map(p => p.category))];
  if (!cats.includes(category)) category = 'All';
  $('#categories').innerHTML = cats.map(c => `<button class="category-tab ${c === category ? 'active' : ''}" data-category="${esc(c)}" aria-pressed="${c === category}">${esc(c === 'All' ? 'All pieces' : c)}</button>`).join('');
}
function renderProducts() {
  const query = $('#product-search').value.toLowerCase().trim();
  let list = products.filter(p => (category === 'All' || p.category === category) && `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(query));
  const sort = $('#sort').value;
  list.sort(sort === 'price-low' ? (a,b) => a.price-b.price : sort === 'price-high' ? (a,b) => b.price-a.price : sort === 'name' ? (a,b) => a.name.localeCompare(b.name) : sort === 'newest' ? (a,b) => b.createdAt.localeCompare(a.createdAt) : (a,b) => Number(b.featured)-Number(a.featured));
  $('#product-count').textContent = `${list.length} ${list.length === 1 ? 'piece' : 'pieces'}`;
  $('#product-grid').innerHTML = list.length ? list.map(p => `<article class="product-card"><button class="product-photo" data-open="${esc(p.id)}" aria-label="View ${esc(p.name)}">${picture(p)}${!p.stock ? '<span class="product-badge">Sold out</span>' : p.featured ? '<span class="product-badge">A house favourite</span>' : ''}</button><div class="product-card-info"><div><span class="product-category">${esc(p.category)}</span><h3><button class="product-name" data-open="${esc(p.id)}">${esc(p.name)}</button></h3></div><span class="product-price">${price(p.price)}</span></div><button class="quick-add" data-add="${esc(p.id)}" ${!p.stock ? 'disabled' : ''}>${p.stock ? 'Add to bag' : 'Sold out'}${p.stock ? icon('plus',16) : ''}</button></article>`).join('') : `<div class="empty-state"><h3>${query || category !== 'All' ? 'No pieces found' : 'Something good is on its way.'}</h3><p>${query || category !== 'All' ? 'Try a different search or explore the full collection.' : 'Come back soon to explore the collection.'}</p>${query || category !== 'All' ? '<button id="reset-filters" class="button button-outline">Show all pieces</button>' : ''}</div>`;
}
function renderDetail() {
  const p = products.find(p => p.id === selectedId);
  if (!p) { if (productDialog.open) closeDialog(productDialog); return; }
  quantity = Math.min(Math.max(quantity, 1), Math.max(p.stock, 1));
  $('#product-detail').innerHTML = `<div class="detail-image">${picture(p)}</div><div class="detail-copy"><span class="product-category">${esc(p.category)}</span><h2>${esc(p.name)}</h2><p class="detail-price">${price(p.price)}</p><p class="detail-description">${esc(p.description)}</p><p class="availability ${!p.stock ? 'unavailable' : ''}">${p.stock ? p.stock <= 5 ? `Only ${p.stock} available` : 'Available' : 'Currently sold out'}</p><div class="detail-purchase"><div class="quantity-control"><button data-detail-quantity="-1" aria-label="Decrease quantity" ${quantity <= 1 ? 'disabled' : ''}>${icon('minus',16)}</button><span aria-live="polite">${quantity}</span><button data-detail-quantity="1" aria-label="Increase quantity" ${quantity >= p.stock ? 'disabled' : ''}>${icon('plus',16)}</button></div><button class="button button-dark" data-detail-add="${esc(p.id)}" ${!p.stock ? 'disabled' : ''}>${p.stock ? 'Add to bag' : 'Sold out'}</button></div>${p.details ? `<div class="product-details"><h3>Details & care</h3><p>${esc(p.details)}</p></div>` : ''}</div>`;
}
function addToBag(id, amount = 1) {
  const p = products.find(p => p.id === id); if (!p?.stock) return toast('This piece is currently sold out.', true);
  const current = bag.find(x => x.id === id); const total = (current?.quantity || 0) + amount;
  if (total > p.stock) return toast(`Only ${p.stock} available. ${current?.quantity || 0} already in your bag.`, true);
  if (current) current.quantity = total; else bag.push({ id, quantity: amount });
  saveBag(); toast(`${p.name} added to your bag.`);
}
function renderBag() {
  $('#bag-title-count').textContent = `(${bag.reduce((n,x) => n+x.quantity,0)})`;
  $('#bag-content').innerHTML = bag.length ? bag.map(line => {
    const p = products.find(x => x.id === line.id);
    return `<article class="bag-line">${picture(p)}<div><span class="product-category">${esc(p.category)}</span><h3>${esc(p.name)}</h3><p>${price(p.price)}</p><div class="bag-line-bottom"><div class="quantity-control"><button data-bag-id="${esc(p.id)}" data-change="-1" aria-label="Decrease ${esc(p.name)} quantity" ${line.quantity <= 1 ? 'disabled' : ''}>${icon('minus',14)}</button><span>${line.quantity}</span><button data-bag-id="${esc(p.id)}" data-change="1" aria-label="Increase ${esc(p.name)} quantity" ${line.quantity >= p.stock ? 'disabled' : ''}>${icon('plus',14)}</button></div><button class="text-button muted" data-remove="${esc(p.id)}">Remove</button></div></div></article>`;
  }).join('') : `<div class="empty-state">${icon('bag',44)}<h3>A little room for something lovely.</h3><p>Your bag is currently empty.</p><button class="button button-dark" id="continue-shopping">Explore the collection</button></div>`;
  $('#bag-summary').hidden = !bag.length;
  $('#bag-summary').innerHTML = `<div class="subtotal"><span>Subtotal</span><strong>${price(bag.reduce((n,line) => n + products.find(p => p.id === line.id).price*line.quantity,0))}</strong></div><p class="muted bag-note">Shipping and taxes are not calculated yet.</p><button class="button button-dark" disabled>Checkout coming soon</button><p class="checkout-note">You can explore and build your bag. Orders and payments are not available yet.</p>`;
}
async function refresh(initial = false) {
  try { const data = await api('/api/store'); products = data.products; settings = data.settings; applyBrand(); renderCategories(); renderProducts(); reconcileBag(); if (bagDialog.open) renderBag(); if (productDialog.open) renderDetail(); }
  catch (e) { if (initial) $('#product-grid').innerHTML = `<div class="empty-state"><h3>The collection could not load.</h3><p>${esc(e.message)}</p><button id="retry-load" class="button button-outline">Try again</button></div>`; else toast('Could not refresh the shop. Check your connection and try again.', true); }
}
$('#categories').addEventListener('click', e => { const b=e.target.closest('[data-category]'); if(b) { category=b.dataset.category; renderCategories(); renderProducts(); } });
$('#sort').addEventListener('change', renderProducts);
$('#product-search').addEventListener('input', renderProducts);
$('#search-toggle').addEventListener('click', () => { $('#shop-search').hidden=false; $('#collection').scrollIntoView({ behavior:'smooth' }); $('#product-search').focus({preventScroll:true}); });
$('#clear-search').addEventListener('click', () => { $('#product-search').value=''; renderProducts(); $('#product-search').focus(); });
$('#product-grid').addEventListener('click', e => {
  const open=e.target.closest('[data-open]'), add=e.target.closest('[data-add]');
  if(open) { selectedId=open.dataset.open; quantity=1; renderDetail(); openDialog(productDialog); }
  if(add) addToBag(add.dataset.add);
  if(e.target.id === 'reset-filters') { category='All'; $('#product-search').value=''; renderCategories(); renderProducts(); }
  if(e.target.id === 'retry-load') refresh(true);
});
$('#product-detail').addEventListener('click', e => { const q=e.target.closest('[data-detail-quantity]'), add=e.target.closest('[data-detail-add]'); if(q) { quantity+=Number(q.dataset.detailQuantity); renderDetail(); } if(add) addToBag(add.dataset.detailAdd,quantity); });
$('#close-product').addEventListener('click', () => closeDialog(productDialog));
$('#open-bag').addEventListener('click', async () => { await refresh(); renderBag(); openDialog(bagDialog); });
$('#close-bag').addEventListener('click', () => closeDialog(bagDialog));
$('#bag-content').addEventListener('click', e => {
  const change=e.target.closest('[data-change]'), remove=e.target.closest('[data-remove]');
  if(change) { const line=bag.find(x=>x.id===change.dataset.bagId); const p=products.find(x=>x.id===line.id); line.quantity=Math.min(p.stock,Math.max(1,line.quantity+Number(change.dataset.change))); }
  if(remove) bag=bag.filter(x=>x.id!==remove.dataset.remove);
  if(e.target.id === 'continue-shopping') { closeDialog(bagDialog); $('#collection').scrollIntoView({behavior:'smooth'}); }
  if(change || remove) { saveBag(); renderBag(); }
});
window.addEventListener('focus', () => refresh());
window.addEventListener('storage', e => { if(e.key === 'aurel-bag') { try { const next=JSON.parse(e.newValue || '[]'); if(Array.isArray(next)) bag=next.filter(x=>x && typeof x.id==='string' && Number.isInteger(x.quantity) && x.quantity>0); } catch {} reconcileBag(); if(bagDialog.open) renderBag(); } });
await refresh(true);
