import { api } from './shared.js';
const form=document.querySelector('#login-form'),password=document.querySelector('#password'),error=document.querySelector('#login-error'),submit=document.querySelector('#login-submit');
document.querySelector('#toggle-password').addEventListener('click',e=>{const show=password.type==='password';password.type=show?'text':'password';e.currentTarget.textContent=show?'Hide':'Show';e.currentTarget.setAttribute('aria-label',show?'Hide password':'Show password');});
form.addEventListener('submit',async e=>{
  e.preventDefault();if(submit.disabled)return;submit.disabled=true;submit.textContent='Signing in…';error.hidden=true;
  try {await api('/api/auth/login','POST',{password:password.value});password.value='';location.replace('/admin');}
  catch(e){error.textContent=e.message;error.hidden=false;}
  finally{submit.disabled=false;submit.textContent='Sign in';}
});
try {const data=await api('/api/store');document.querySelector('#login-brand').textContent=data.settings.name;}catch{/* Sign-in stays available when the public catalog cannot load. */}
try {const session=await api('/api/auth/session');if(session.authenticated)location.replace('/admin');}catch{/* Setup and connectivity errors are explained if the user submits. */}
