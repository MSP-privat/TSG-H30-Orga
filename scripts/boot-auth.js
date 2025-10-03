document.addEventListener('DOMContentLoaded',async()=>{
  const authRoot=document.getElementById('auth-screen')||document.querySelector('[data-auth-screen],.auth-screen');
  const appRoot=document.getElementById('app-root')||document.querySelector('#app,.app-root');
  const msg=document.getElementById('auth-msg');
  const show=e=>{ if(e){ e.style.display=''; e.classList.remove('hidden','d-none'); } };
  const hide=e=>{ if(e){ e.style.display='none'; e.classList.add('hidden'); } };
  const info=(t,c)=>{ if(msg){ msg.textContent=t||''; msg.style.color=c||'#333'; } };
  const showApp=()=>{ hide(authRoot); show(appRoot); };
  const showLogin=()=>{ show(authRoot); hide(appRoot); };
  function setRole(r){ r=r||'guest'; document.documentElement.setAttribute('data-current-role',r); window.__CURRENT_ROLE__=r; if(window.roleGuard) window.roleGuard.applyRoleGuards(r); }
  async function refreshRole(){ try{ const p=await (window.sbAuth?.sbGetProfile?.()||Promise.resolve(null)); const r=(p&&p.role)||'guest'; setRole(r); return r; }catch{ setRole('guest'); return 'guest'; } }
  const normErr=e=>{ const m=String(e?.message||e||'').toLowerCase(); if(m.includes('email')&&m.includes('confirm')) return 'Registrierung erfolgreich, aber E-Mail noch nicht bestätigt.'; if(m.includes('invalid login credentials')) return 'Login fehlgeschlagen: E-Mail/Kennwort prüfen oder registrieren.'; return e?.message||'Unerwarteter Fehler.'; };
  document.addEventListener('submit',async ev=>{ const f=ev.target; if(!(f instanceof HTMLFormElement)) return; const inAuth=authRoot?f.closest('#auth-screen,[data-auth-screen],.auth-screen'):null; if(!inAuth) return; ev.preventDefault(); ev.stopPropagation();
    try{ info('', '#333'); const id=(f.id||'').toLowerCase(); const isSu=id.includes('signup')||f.hasAttribute('data-signup')||f.querySelector('#su-email,[name="su-email"]')||/registrier/i.test((f.querySelector('button,[type="submit"]')||{}).textContent||'');
      const email=(isSu?(f.querySelector('#su-email,[name="su-email"],input[type="email"][name="email"],input[type="email"]')):(f.querySelector('#email,[name="email"],input[type="email"]')));
      const pass=(isSu?(f.querySelector('#su-password,[name="su-password"],input[type="password"][name="password"],input[type="password"]')):(f.querySelector('#password,[name="password"],input[type="password"]')));
      const em=email?String(email.value||'').trim():''; const pw=pass?String(pass.value||''):'';
      if(!em||!pw){ info(isSu?'Bitte E-Mail & Kennwort für die Registrierung.':'Bitte E-Mail & Kennwort eingeben.','#b00'); return; }
      if(!window.sbAuth){ info('Auth nicht initialisiert.','#b00'); return; }
      if(isSu){ try{ await window.sbAuth.sbSignUp(em,pw); info('Registrierung erfolgreich. Bitte E-Mail bestätigen und dann einloggen.','#0a0'); }catch(e){ info(normErr(e),'#b00'); } return; }
      try{ await window.sbAuth.sbSignIn(em,pw); }catch(e){ info(normErr(e),'#b00'); return; }
      showApp(); if(typeof window.__appBoot==='function'){ try{ window.__appBoot(); }catch(e){ console.warn('__appBoot failed',e); } } await refreshRole();
    }catch(e){ info('Unerwarteter Fehler.','#b00'); console.error('[Auth] submit handler failed:',e); }
  }, true);
  document.addEventListener('click', async e=>{ const t=e.target; if(!(t instanceof Element)) return; if(t.id==='logout-btn'||(t.closest&&t.closest('#logout-btn'))){ try{ await window.sbAuth?.sbSignOut?.(); }catch{} setRole('guest'); showLogin(); window.__APP_BOOTED__=false; } }, true);
  try{ const s=await (window.sbAuth?.sbGetSession?.()||Promise.resolve(null)); if(s&&s.user){ showApp(); if(typeof window.__appBoot==='function'){ try{ window.__appBoot(); }catch(e){ console.warn('__appBoot failed',e);} } await refreshRole(); } else { setRole('guest'); showLogin(); } }catch{ setRole('guest'); showLogin(); }
  if(window.sb&&window.sb.auth){ window.sb.auth.onAuthStateChange(async (evt,sess)=>{ if(evt==='INITIAL_SESSION') return; const has=!!(sess&&sess.user); if(evt==='SIGNED_IN'||evt==='TOKEN_REFRESHED'){ showApp(); if(typeof window.__appBoot==='function'){ try{ window.__appBoot(); }catch(e){ console.warn('__appBoot failed',e);} } await refreshRole(); } else if(evt==='SIGNED_OUT'||evt==='USER_DELETED'){ setRole('guest'); showLogin(); window.__APP_BOOTED__=false; } }); }
});