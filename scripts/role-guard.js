(function(){
  const PRIORITY=['guest','player','coach','admin']; const ALIAS={spieler:'player',gast:'guest'};
  const norm=r=>!r?'guest':(ALIAS[String(r).toLowerCase()]||String(r).toLowerCase());
  const hasAtLeast=(u,n)=>PRIORITY.indexOf(norm(u))>=PRIORITY.indexOf(norm(n));
  function setBadge(role){const el=document.getElementById('role-badge'); if(!el) return; const r=norm(role); el.textContent=r==='admin'?'Admin':r==='coach'?'Coach':r==='player'?'Spieler':'Gast';}
  function isSeasonControl(el){ if(!el) return false; const id=(el.id||'').toLowerCase(), name=(el.name||'').toLowerCase();
    if(id.includes('season')||id.includes('saison')||name.includes('season')||name.includes('saison')) return true;
    const lab=el.closest('label')||(el.id?document.querySelector(`label[for="${el.id}"]`):null);
    return !!(lab && /saison|season/i.test(lab.textContent||'')); }
  function toggleByDataRole(role){ const r=norm(role); document.querySelectorAll('[data-role],[data-min-role]').forEach(n=>{ const req=n.getAttribute('data-min-role')||n.getAttribute('data-role'); const ok=hasAtLeast(r,req); n.style.display=ok?'':'none'; }); }
  function disableEditingForPlayers(role){
    const isP=norm(role)==='player';
    const editRe=/(Bearbeiten|Neu|Erstellen|Anlegen|Speichern|Sichern|Löschen|Entfernen|Status ändern|Spiel löschen|Team löschen|Spieler hinzufügen|Add Player|Hinzufügen)/i;
    document.querySelectorAll('button,input[type="button"],input[type="submit"]').forEach(b=>{
      if(b.closest('[data-role="coach"],[data-min-role="coach"],[data-role="admin"],[data-min-role="admin"]')) return;
      const label=(b.innerText||b.value||'').trim();
      if(isP && editRe.test(label)){ b.disabled=true; b.dataset.disabledByRole='1'; }
      else if(!isP && b.dataset.disabledByRole==='1'){ b.disabled=false; delete b.dataset.disabledByRole; }
    });
    document.querySelectorAll('input,textarea,select').forEach(inp=>{
      if(inp.type==='email'||inp.type==='password') return;
      if(inp.closest('#auth-screen,[data-auth-screen],.auth-screen')) return;
      if(inp.closest('[data-role="coach"],[data-min-role="coach"],[data-role="admin"],[data-min-role="admin"]')) return;
      if(isSeasonControl(inp)) return;
      if(isP){ inp.disabled=true; inp.dataset.disabledByRole='1'; }
      else if(inp.dataset.disabledByRole==='1'){ inp.disabled=false; delete inp.dataset.disabledByRole; }
    });
  }
  function apply(x){ const role=typeof x==='string'?x:(x&&x.role)||'guest'; setBadge(role); toggleByDataRole(role); disableEditingForPlayers(role); }
  let scheduled=false; const obs=new MutationObserver(()=>{ if(scheduled) return; scheduled=true; requestAnimationFrame(()=>{ scheduled=false; const cur=document.documentElement.getAttribute('data-current-role')||window.__CURRENT_ROLE__||'guest'; apply(cur); }); });
  obs.observe(document.documentElement,{childList:true,subtree:true});
  window.roleGuard={ applyRoleGuards:apply, hasAtLeast };
})();