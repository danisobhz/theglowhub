import { escapeHTML as esc, money, icon, api, toast, openDialog, closeDialog, setupDialogs } from './shared.js';
const $ = s => document.querySelector(s);
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
setupDialogs();
let products = [], settings = {}, filter = 'all', currentId = null, image = '', pendingImage = null, objectUrl = null, dirty = false, settingsDirty = false, saving = false, imageLoading = false, loaded = false;
const form = $('#product-form'), editor = $('#editor'), settingsForm = $('#settings-form');
const field = name => form.elements.namedItem(name);
let uploadMaxBytes = 5 * 1024 * 1024;
function render() {
  $('#sidebar-brand').textContent = settings.name;
  document.title = `${settings.name} — Shop manager`;
  $('#sidebar-count').textContent = products.length;
  const active = products.filter(p=>p.status==='active').length, low=products.filter(p=>p.stock>0 && p.stock<=5).length;
  $('#admin-stats').innerHTML = `<span><strong>${products.length}</strong>Total products</span><span><strong>${active}</strong>Visible in shop</span><span><strong>${products.length-active}</strong>Hidden</span><span><strong>${low}</strong>Low in stock <small>(5 or fewer)</small></span>`;
  const query = $('#admin-search').value.trim().toLowerCase();
  const list = products.filter(p=>(filter==='all' || p.status===filter) && `${p.name} ${p.category}`.toLowerCase().includes(query));
  $('#product-rows').innerHTML = list.map(p=>`<tr><td><button class="table-product" data-edit="${esc(p.id)}">${p.image?`<img src="${esc(p.image)}" alt="">`:`<span class="table-placeholder">${icon('image',24)}</span>`}<span><strong>${esc(p.name)}</strong><small>${esc(p.category)}${p.featured?' <span class="favourite-dot" title="House favourite">· House favourite</span>':''}</small></span></button></td><td><span class="status-pill ${p.status==='active'?'visible':'hidden'}">${p.status==='active'?'Visible':'Hidden'}</span></td><td><span class="${p.stock===0?'danger':p.stock<=5?'low-stock':''}">${p.stock===0?'Out of stock':`${p.stock} available`}</span></td><td class="price-cell">${money(p.price,settings.currency)}</td><td><button class="edit-button" data-edit="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">${icon('edit',16)}<span>Edit</span></button></td></tr>`).join('');
  $('#admin-empty').hidden=!!list.length;
  $('#admin-empty').innerHTML=`<h3>${products.length?'No matching products':'Your collection starts here.'}</h3><p>${products.length?'Try another search or visibility filter.':'Add your first product, then preview it in your shop.'}</p>${!products.length?'<button class="button button-dark" id="empty-add">Add product</button>':''}`;
  $('#table-count').textContent=`${list.length} of ${products.length} products`;
  $('#category-options').innerHTML=[...new Set(products.map(p=>p.category))].map(c=>`<option value="${esc(c)}"></option>`).join('');
}
async function load() {
  try { const data = await api('/api/admin'); products=data.products; settings=data.settings; loaded=true; $('#load-error').hidden=true; render(); fillSettings(); }
  catch(e) { $('#load-error').hidden=false; $('#load-error').textContent=`${e.message} Reload this page to try again.`; }
}
function confirmAction(title, description, yes='Discard changes', no='Keep editing') {
  return new Promise(resolve=> {
    const dialog=$('#confirm-dialog'); $('#confirm-title').textContent=title; $('#confirm-description').textContent=description; $('#confirm-yes').textContent=yes; $('#confirm-no').textContent=no;
    const finish=value=> { closeDialog(dialog); $('#confirm-yes').onclick=null; $('#confirm-no').onclick=null; dialog.oncancel=null; resolve(value); };
    $('#confirm-yes').onclick=()=>finish(true); $('#confirm-no').onclick=()=>finish(false); dialog.oncancel=e=>{e.preventDefault();finish(false);}; openDialog(dialog); $('#confirm-no').focus();
  });
}
function clearObjectUrl() { if(objectUrl) URL.revokeObjectURL(objectUrl); objectUrl=null; }
function renderImage() {
  const src=objectUrl || image;
  $('#image-preview').innerHTML=src?`<img src="${esc(src)}" alt="Product image preview">`:`${icon('image',36)}<span>No image yet</span>`;
  $('#upload-label').textContent=src?'Change image':'Upload image'; $('#remove-image').hidden=!src;
}
function openEditor(id=null) {
  if(!loaded) return toast('The collection has not loaded. Reload this page to try again.',true);
  currentId=id; const p=products.find(p=>p.id===id); form.reset(); clearObjectUrl(); pendingImage=null; image=p?.image || ''; dirty=false;
  $('#editor-title').textContent=p?'Edit product':'Add product'; $('#editor-subtitle').textContent=p?p.name:'A new addition to your collection';
  for(const name of ['name','price','stock','category','description','details','status']) field(name).value=p?.[name] ?? ({stock:0,status:'active'}[name] ?? '');
  field('featured').checked=!!p?.featured; $('#price-currency').textContent=settings.currency;
  $('#delete-product').hidden=!p; $('#product-error').hidden=true; $('#image-upload').value=''; renderImage(); openDialog(editor); field('name').focus();
}
async function requestCloseEditor() {
  if(saving || imageLoading) return;
  if(dirty && !await confirmAction('Discard your changes?','Your unsaved edits to this product will be lost.')) return;
  dirty=false; clearObjectUrl(); closeDialog(editor);
}
async function switchPanel(panel) {
  if(saving) return;
  if(panel==='products' && settingsDirty && !await confirmAction('Discard shop changes?','Your unsaved shop settings will be lost.')) return;
  if(panel==='products' && settingsDirty) { fillSettings(); settingsDirty=false; }
  $('#products-panel').hidden=panel!=='products'; $('#settings-panel').hidden=panel!=='settings';
  for(const p of ['products','settings']) { $(`#nav-${p}`).classList.toggle('active',p===panel); if(p===panel) $(`#nav-${p}`).setAttribute('aria-current','page'); else $(`#nav-${p}`).removeAttribute('aria-current'); }
  $('#breadcrumb').innerHTML=`Your shop <span>/</span> ${panel==='products'?'Products':'Shop settings'}`;
}
function fillSettings() { for(const [name,value] of Object.entries(settings)) { const input=settingsForm.elements.namedItem(name); if(input) input.value=value; } }
function showProductError(message) { $('#product-error').textContent=message; $('#product-error').hidden=false; $('#product-error').scrollIntoView({block:'nearest',behavior:'smooth'}); }
$('#add-product').addEventListener('click',()=>openEditor());
$('#admin-empty').addEventListener('click',e=>{if(e.target.id==='empty-add')openEditor();});
$('#product-rows').addEventListener('click',e=>{const button=e.target.closest('[data-edit]');if(button)openEditor(button.dataset.edit);});
$('.admin-filter-tabs').addEventListener('click',e=>{const button=e.target.closest('[data-filter]');if(!button)return;filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});render();});
$('#admin-search').addEventListener('input',render);
$('#close-editor').addEventListener('click',requestCloseEditor); $('#cancel-editor').addEventListener('click',requestCloseEditor);
editor.addEventListener('cancel',e=>{e.preventDefault();requestCloseEditor();});
form.addEventListener('input',()=>dirty=true);
$('#image-upload').addEventListener('change',async e=>{
  const file=e.target.files[0]; if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)) { e.target.value=''; return showProductError('Choose a JPG, PNG, or WebP image.'); }
  if(file.size>uploadMaxBytes) { e.target.value=''; return showProductError(`This image is too large. Choose one under ${uploadMaxBytes/1024/1024} MB.`); }
  const candidate=URL.createObjectURL(file); const testImage=new Image(); testImage.src=candidate;
  imageLoading=true; $('#save-product').disabled=true; $('#save-product').textContent='Preparing image…';
  try { await testImage.decode(); } catch { URL.revokeObjectURL(candidate); e.target.value=''; return showProductError('This image could not be opened. Try another photo.'); }
  finally { imageLoading=false; $('#save-product').disabled=false; $('#save-product').textContent='Save product'; }
  clearObjectUrl(); objectUrl=candidate; pendingImage=file; dirty=true; $('#product-error').hidden=true; renderImage();
});
$('#remove-image').addEventListener('click',()=>{clearObjectUrl();image='';pendingImage=null;$('#image-upload').value='';dirty=true;renderImage();});
function readAsDataURL(file) { return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The image could not be read. Choose it again.'));reader.readAsDataURL(file);}); }
form.addEventListener('submit',async e=>{
  e.preventDefault(); if(saving || imageLoading)return; saving=true; $('#save-product').disabled=true; $('#save-product').textContent='Saving…'; $('#product-error').hidden=true;
  // Freeze inputs while the selected image and product are saved together.
  const controls=[...form.querySelectorAll('input,textarea,select,button')]; const wasDisabled=controls.map(c=>c.disabled); controls.forEach(c=>c.disabled=true);
  try {
    if(pendingImage) { const result=await api('/api/uploads','POST',{data:await readAsDataURL(pendingImage)});image=result.image;pendingImage=null; }
    const payload={name:field('name').value,price:Number(field('price').value),stock:Number(field('stock').value),category:field('category').value,description:field('description').value,details:field('details').value,status:field('status').value,featured:field('featured').checked,image,version:products.find(p=>p.id===currentId)?.version};
    const product=await api(currentId?`/api/products/${currentId}`:'/api/products',currentId?'PUT':'POST',payload);
    if(currentId)products=products.map(p=>p.id===currentId?product:p);else products.push(product);
    dirty=false;clearObjectUrl();closeDialog(editor);render();toast(`${product.name} saved${product.status==='active'?' to your shop': ' as hidden'}.`);
  } catch(error) {showProductError(error.message);}
  finally {saving=false;controls.forEach((c,i)=>c.disabled=wasDisabled[i]);$('#save-product').disabled=false;$('#save-product').textContent='Save product';}
});
$('#delete-product').addEventListener('click',async()=>{
  if(saving)return;const p=products.find(p=>p.id===currentId);
  if(!await confirmAction('Delete this product?',`“${p.name}” will be removed from your collection. You can hide it instead if you might need it later.`,'Delete product','Keep product'))return;
  saving=true;
  try {await api(`/api/products/${currentId}`,'DELETE',{version:p.version});products=products.filter(p=>p.id!==currentId);dirty=false;clearObjectUrl();closeDialog(editor);render();toast('Product deleted.');}
  catch(e){showProductError(e.message);}finally{saving=false;}
});
$('#nav-products').addEventListener('click',()=>switchPanel('products'));$('#nav-settings').addEventListener('click',()=>switchPanel('settings'));
settingsForm.addEventListener('input',()=>{settingsDirty=true;$('#settings-save-status').textContent='You have unsaved changes.';});
settingsForm.addEventListener('submit',async e=>{
  e.preventDefault();if(!loaded)return toast('Load the shop before saving settings.',true); if(saving)return;
  saving=true;$('#save-settings').disabled=true;$('#save-settings').textContent='Saving…';$('#settings-error').hidden=true;
  const payload={...Object.fromEntries(new FormData(settingsForm)),version:settings.version}; const controls=[...settingsForm.querySelectorAll('input,textarea,select')];controls.forEach(c=>c.disabled=true);
  try {settings=await api('/api/settings','PUT',payload);settingsDirty=false;render();toast('Shop settings saved.');$('#settings-save-status').textContent='All changes saved.';}
  catch(e){$('#settings-error').textContent=e.message;$('#settings-error').hidden=false;}
  finally{saving=false;controls.forEach(c=>c.disabled=false);$('#save-settings').disabled=false;$('#save-settings').textContent='Save changes';}
});
window.addEventListener('beforeunload',e=>{if(dirty || settingsDirty || saving){e.preventDefault();e.returnValue='';}});
window.addEventListener('shop:sign-in-required',()=>{if(!$('#reauth-dialog').open)openDialog($('#reauth-dialog'));});
$('#reauth-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=$('#reauth-submit');button.disabled=true;$('#reauth-error').hidden=true;
  try {await api('/api/auth/login','POST',{password:$('#reauth-password').value});$('#reauth-password').value='';closeDialog($('#reauth-dialog'));toast('Signed in. Your edits are still here; you can save them now.');if(!loaded)await load();}
  catch(error){$('#reauth-error').textContent=error.message;$('#reauth-error').hidden=false;}
  finally{button.disabled=false;}
});
$('#sign-out').addEventListener('click',async()=>{
  if(saving||imageLoading)return;
  if((dirty||settingsDirty)&&!await confirmAction('Sign out without saving?','Your unsaved edits will be lost.','Sign out','Keep editing'))return;
  try{await api('/api/auth/logout','POST',{});dirty=false;settingsDirty=false;location.replace('/login');}catch(e){toast(e.message,true);}
});
$('#export-catalog').addEventListener('click',async()=>{
  try{const data=await api('/api/admin/export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`shop-catalog-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Catalog downloaded. Photo files are stored separately.');}catch(e){toast(e.message,true);}
});
try{
  const session=await api('/api/auth/session');
  uploadMaxBytes=session.uploadMaxBytes || uploadMaxBytes;
  $('#upload-size-limit').textContent=`Up to ${uploadMaxBytes/1024/1024} MB`;
  if(!session.authenticated){location.replace('/login');}else{
    const local=session.mode==='local';$('#sign-out').hidden=local;$('#workspace-status').textContent=local?'Local workspace':'Shop manager';$('#workspace-note').textContent=local?'Saved on this computer. Your shop is not online.':'Changes are saved securely to your shop.';await load();
  }
}catch(e){$('#load-error').hidden=false;$('#load-error').textContent=e.message;}
