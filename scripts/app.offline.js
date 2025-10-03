import {h, clear, fmtDate} from './ui.js';
import {DB, uuid} from './db.remote.js';
import {
  listPlayersSorted, listTeams, listGames, listAssignments,
  canAssignPlayerOnDate, applyFestspielenColors, upsertPlayer, upsertTeam, upsertGame,
  upsertAssignment, listSeasons, getCurrentSeasonId, setCurrentSeasonId,
  deleteAssignment, deletePlayerCascade, deleteTeamCascade, deleteGameCascade,
  getUnavailablePlayerIdsForDate, recomputeLocksAndEnforce
, deleteSeasonCascade, listPenalties, upsertPenalty, deletePenalty, getTeamFundAmount, setTeamFundAmount } from './logic.js';
import {exportJSON, importJSON} from './offline_sync.js';

const app = document.getElementById('app');
// init is triggered by boot-auth.js after sign-in
// window.addEventListener('DOMContentLoaded', init);

async function init(){ await __startAppOnce(); }

/* =============================
   Saison-Auswahl (Header)
============================= */
async function ensureSeasonHeader(){
  const header = document.querySelector('.app-header');
  let old = document.querySelector('.season-bar'); if(old) old.remove();
  const seasons = await listSeasons();
  let current = await getCurrentSeasonId();
  if(!current && seasons.length){ current = seasons[0].id; await setCurrentSeasonId(current); }
  const sel = h('select',{id:'seasonSel'}, ...seasons.map(s=>h('option',{value:s.id, selected:s.id===current}, `${s.name} (${s.year})`)));
  const btnDel = h('button',{class:'btn btn-danger', 'data-min-role':'admin', onclick: async ()=>{  if(!sel.value) return; if(!confirm('Saison inkl. aller Inhalte wirklich löschen?')) return;  await deleteSeasonCascade(sel.value); await ensureSeasonHeader(); renderDashboard(); }}, 'Saison löschen');
  const btnNew = h('button',{class:'btn btn-secondary', onclick: newSeason},'Neue Saison');
  const bar = h('div',{class:'season-bar'}, h('span',{},'Saison:'), sel, btnNew, btnDel);
  sel.addEventListener('change', async (e)=>{ await setCurrentSeasonId(e.target.value); renderDashboard(); });
  header.appendChild(bar);
}

async function newSeason(){
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `
    <form method="dialog" class="card" style="min-width:320px">
      <h3>Neue Saison anlegen</h3>
      <label>Name</label><input id="name" placeholder="z. B. Sommersaison"/>
      <label>Jahr</label><input id="year" type="number" value="${new Date().getFullYear()}"/>
      <menu>
        <button value="cancel" class="btn btn-secondary">Abbrechen</button>
        <button value="ok" class="btn">Speichern</button>
      </menu>
    </form>`;
  document.body.appendChild(dlg);
  dlg.showModal();
  dlg.addEventListener('close', async ()=>{
    if(dlg.returnValue==='ok'){
      const id = uuid();
      const s = {id, name: dlg.querySelector('#name').value || 'Saison', year: parseInt(dlg.querySelector('#year').value)||new Date().getFullYear(), active:true};
      await DB.put('seasons', s);
      await setCurrentSeasonId(id);
      await ensureSeasonHeader();
      renderDashboard();
    }
    dlg.remove();
  });
}

/* =============================
   Dashboard + Tabs
============================= */
function renderDashboard(){
  clear(app);
  const hdr = h('div',{class:'card'});
  const tabs = ['Kalender','Spiele','Spieler','Teams','Strafenkatalog'].map(n=>h('button',{class:'tab',onclick:()=>show(n)},n));
  tabs[0].classList.add('active');
  const bar = h('div',{class:'tabbar'}, tabs);
  const container = h('div',{});
  app.append(hdr, bar, container);
  show('Kalender');

  async function show(name){
    tabs.forEach(t=>t.classList.remove('active'));
    const idx = tabs.findIndex(t=>t.textContent===name);
    if (idx>=0) tabs[idx].classList.add('active');
    clear(container);
    if (name==='Spieler') viewPlayers(container);
    if (name==='Teams') viewTeams(container);
    if (name==='Spiele') viewGames(container);
    if (name==='Kalender') viewCalendar(container);
    if (name==='Strafenkatalog') viewPenalties(container);
  }
}

/* =============================
   Export / Import
============================= */
async function doExport(){
  const data = await exportJSON();
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='tsg-tennis-offline-seasons-export.json'; a.click();
  URL.revokeObjectURL(url);
}
async function doImport(){
  const inp = document.createElement('input'); inp.type='file'; inp.accept='application/json';
  inp.onchange = async ()=>{
    const file = inp.files[0]; if(!file) return;
    const text = await file.text();
    try{ const data = JSON.parse(text); await importJSON(data); location.reload(); }catch(e){ alert('Ungültige Datei'); }
  };
  inp.click();
}

/* =============================
   Spieler (CRUD)
============================= */
async function viewPlayers(container){
  clear(container);
  const header = h('div',{class:'grid grid-2'},
    h('div',{}, h('h2',{},'Spieler')),
    h('div',{style:'text-align:right'},
      h('button',{class:'btn',onclick:()=>editPlayer()},'Spieler hinzufügen')
    )
  );
  container.appendChild(header);

  const players = await listPlayersSorted('asc');
  const table = h('table',{class:'table'});
  table.appendChild(
    h('tr',{}, 
      h('th',{},'Name'), 
      h('th',{},'LK'), 
      h('th',{},'Farbe'), 
      h('th',{},'Aktion')
    )
  );

  for (const p of players){
    table.appendChild(
      h('tr',{},
        h('td',{}, `${p.firstName} ${p.lastName}`),
        h('td',{}, p.lk),
        h('td',{}, p.color ? h('span',{class:'color-box',style:`background:${p.color}`}) : ''),
        h('td',{},
          h('button',{class:'btn btn-secondary',onclick:()=>editPlayer(p)},'Bearbeiten'),
          ' ',
          h('div',{ 'data-role':'admin' }, 
            h('button',{ class:'btn btn-danger',onclick:()=>deletePlayer(p.id)},'Löschen')
          )
        )
      )
    );
  }
  container.appendChild(table);

  async function deletePlayer(id){
    if(!confirm('Spieler wirklich löschen? Zugeordnete Einsätze werden ebenfalls entfernt.')) return;
    await deletePlayerCascade(id);
    viewPlayers(container);
  }

  async function editPlayer(p={ id:uuid(), firstName:'', lastName:'', lk:'10,00', color:null }){
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="card" style="min-width:320px">
        <h3>${p.firstName||p.lastName ? 'Spieler bearbeiten' : 'Spieler anlegen'}</h3>
        <label>Vorname</label><input id="fn" value="${p.firstName||''}"/>
        <label>Nachname</label><input id="ln" value="${p.lastName||''}"/>
        <label>LK (z. B. 10,50)</label><input id="lk" value="${p.lk||'10,00'}"/>
        <menu>
          <button value="cancel" class="btn btn-secondary">Abbrechen</button>
          <button value="ok" class="btn">Speichern</button>
        </menu>
      </form>`;
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.addEventListener('close', async ()=>{
      if (dlg.returnValue==='ok'){
        p.firstName = dlg.querySelector('#fn').value;
        p.lastName = dlg.querySelector('#ln').value;
        p.lk = dlg.querySelector('#lk').value;
        await upsertPlayer(p);
        viewPlayers(container);
      }
      dlg.remove();
    });
  }
}

/* =============================
   Teams (CRUD, Festspielen + Farbe)
============================= */
async function viewTeams(container){
  clear(container);
  const teams = await listTeams();
  const header = h('div',{class:'grid grid-2'},
    h('div',{}, h('h2',{},'Teams')),
    h('div',{style:'text-align:right'}, h('button',{class:'btn',onclick:()=>editTeam()},'Team hinzufügen'))
  );
  container.appendChild(header);
  const table = h('table',{class:'table'});
  table.appendChild(h('tr',{}, h('th',{},'Name'), h('th',{},'Festspielen aktiv'), h('th',{},'Sperre erzwingen'), h('th',{},'Farbe'), h('th',{},'Aktion')));
  for (const t of teams){
    table.appendChild(h('tr',{},
      h('td',{}, t.name),
      h('td',{}, h('div',{ 'data-role':'coach' }, h('input',{ type:'checkbox',checked:!!t.locked, onchange: async (e)=>{ t.locked=!!e.target.checked; await upsertTeam(t); viewTeams(container);} }))),
      h('td',{}, t.enforceLock ? '🛡️ Ja' : '—'),
      h('td',{}, t.locked ? h('span',{class:'color-box', style:`background:${t.lockColor||'#ffd400'}`}) : ''),
      h('td',{},
        h('button',{class:'btn btn-secondary',onclick:()=>editTeam(t)},'Bearbeiten'),
        ' ',
        h('div',{ 'data-role':'admin' }, 
          h('button',{ class:'btn btn-danger',onclick:()=>deleteTeam(t.id)},'Löschen')
        )
      )
    ));
  }
  container.appendChild(table);

  async function deleteTeam(id){
    if(!confirm('Team wirklich löschen? Zugeordnete Spiele & Einsätze werden ebenfalls entfernt.')) return;
    await deleteTeamCascade(id);
    viewTeams(container);
  }

  async function editTeam(t={ id:uuid(), name:'Neue Mannschaft', lockable:true, locked:false, enforceLock:true, lockColor:'#ffd400' }){
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="card" style="min-width:320px">
        <h3>${t.name ? 'Team bearbeiten' : 'Team anlegen'}</h3>
        <label>Name</label><input id="name" value="${t.name||''}"/>
        <label>Festspielen möglich?</label>
        <select id="lockable"><option value="true" ${t.lockable?'selected':''}>Ja</option><option value="false" ${!t.lockable?'selected':''}>Nein</option></select>
        <label>Festspielen aktiv?</label>
        <input type="checkbox" id="locked" ${t.locked?'checked':''}/>
        <label>Spielsperre erzwingen?</label>
        <input type="checkbox" id="enforce" ${t.enforceLock?'checked':''}/>
        <label>Teamfarbe</label>
        <input type="color" id="color" value="${t.lockColor||'#ffd400'}" ${!t.locked?'disabled':''}/>
        <menu>
          <button value="cancel" class="btn btn-secondary">Abbrechen</button>
          <button value="ok" class="btn">Speichern</button>
        </menu>
      </form>`;
    document.body.appendChild(dlg);
    const updateColorState = ()=>{ dlg.querySelector('#color').disabled = !dlg.querySelector('#locked').checked; };
    dlg.showModal();
    updateColorState();
    dlg.querySelector('#locked').addEventListener('change', updateColorState);
    dlg.addEventListener('close', async()=>{
      if (dlg.returnValue==='ok'){
        t.name = dlg.querySelector('#name').value;
        t.lockable = dlg.querySelector('#lockable').value==='true';
        t.locked = dlg.querySelector('#locked').checked;
        t.enforceLock = dlg.querySelector('#enforce').checked;
        t.lockColor = dlg.querySelector('#color').value;
        await upsertTeam(t);
        viewTeams(container);
      }
      dlg.remove();
    });
  }
}

/* =============================
   Spiele (CRUD, Zuordnungen, Festschreiben)
============================= */
async function viewGames(container, filter='all'){
  clear(container);
  const allGames = (await listGames()).sort((a,b)=> new Date(a.date)-new Date(b.date));
  const today = new Date(); today.setHours(0,0,0,0);
  let games = allGames;
  if (filter==='future') games = allGames.filter(g => new Date(g.date) >= today);
  else if (filter==='past') games = allGames.filter(g => new Date(g.date) < today);
  const header = h('div',{class:'grid grid-2'},
    h('div',{}, h('h2',{},'Spiele & Zuordnungen')),
    h('div',{style:'text-align:right'}, h('button',{class:'btn',onclick:()=>editGame()},'Spieltermin hinzufügen'))
  );
  container.appendChild(header);

  const gamesToolbar = h('div',{id:'gamesToolbar'},
    h('button',{class:'btn btn-secondary', onclick:()=>viewGames(container,'all')},'Alle Spiele'),
    ' ',
    h('button',{class:'btn btn-secondary', onclick:()=>viewGames(container,'future')},'Zukünftige'),
    ' ',
    h('button',{class:'btn btn-secondary', onclick:()=>viewGames(container,'past')},'Vergangene')
  );
  container.appendChild(gamesToolbar);
  const teams = await listTeams();
  const players = await listPlayersSorted('asc');
  const allAss = await listAssignments();

  for (const g of games){
    const wrap = h('div',{class:'card'});
    const teamName = teams.find(t=>t.id===g.teamId)?.name||'Unbekannt';
    wrap.append(h('div',{style:'display:flex;justify-content:space-between;align-items:center;gap:12px'},
      h('div',{}, h('h3',{}, `${fmtDate(g.date)} ${g.time||''} – ${teamName}`), h('span',{class:'badge'}, `${g.location||'Heim/Auswärts nicht gesetzt'}`)),
      h('div',{},
        h('button',{class:'btn btn-secondary',onclick:()=>editGame(g)},'Bearbeiten'),
        ' ',
        h('div',{ 'data-role':'admin' }, 
          h('button',{ class:'btn btn-danger',onclick:()=>deleteGame(g.id)},'Spiel löschen')
        )
      )
    ));

    // Nur Spieler anzeigen, die an diesem Datum noch nicht woanders eingeplant sind
    const unavailable = await getUnavailablePlayerIdsForDate(g.date);
    const listBox = h('div',{}); wrap.appendChild(listBox);
    const rerender = async ()=>{
      listBox.innerHTML=''; listBox.appendChild(renderAssignmentsForGame(listBox, these, players, statusFilter, lkOrder));
    }; wrap.addEventListener('refresh', rerender);

    const availablePlayers = players.filter(p=>!unavailable.has(p.id));

    const filterbar = h('div',{class:'grid grid-3', style:'margin:6px 0'},
      h('div',{}, h('label',{},'Filter Status'), h('select',{id:`fstat-${g.id}`, onchange:()=>{ statusFilter=(document.getElementById(`fstat-${g.id}`).value||'ALLE'); wrap.dispatchEvent(new Event("refresh")); }},
          h('option',{value:'ALLE'},'Alle'),
          h('option',{value:'Eingeplant'},'Eingeplant'),
          h('option',{value:'Ersatz'},'Ersatz'),
          h('option',{value:'Gespielt'},'Gespielt'),
          h('option',{value:'Gesperrt'},'Gesperrt')
      )),
      h('div',{}, h('label',{},'LK Sortierung'), h('select',{id:`flk-${g.id}`, onchange:()=>{ lkOrder=(document.getElementById(`flk-${g.id}`).value||'asc'); wrap.dispatchEvent(new Event("refresh")); }},
          h('option',{value:'asc'},'Aufsteigend'), h('option',{value:'desc'},'Absteigend')
      )),
      h('div',{})
    );
    const selector = h('div',{class:'grid grid-3'},
      h('div',{}, h('label',{},'Spieler auswählen'),
        h('select',{id:`selP-${g.id}`},
          ...availablePlayers.map(p=>h('option',{value:p.id}, `${p.firstName} ${p.lastName} (LK ${p.lk})`))
        )
      ),
      h('div',{}, h('label',{},'Status'), h('select',{id:`selS-${g.id}`},
          h('option',{value:'Eingeplant'},'Eingeplant'),
          h('option',{value:'Ersatz'},'Ersatz/Einwechslung'),
          h('option',{value:'Gespielt'},'Gespielt'), h('option',{value:'Gesperrt'},'Gesperrt')
      )),
      h('div',{style:'display:flex;align-items:flex-end'}, h('button',{class:'btn', onclick:()=>addAssign(g)},'Spieler hinzufügen'))
    );
    wrap.appendChild(selector);

    // Liste aller zugeordneten Spieler dieses Spiels
    const these = allAss.filter(a=>a.gameId===g.id);
    const table = h('table',{class:'table'});
    table.append(h('tr',{}, h('th',{},'Spieler'), h('th',{},'LK'), h('th',{},'Status'), h('th',{},'Aktion')));
    for (const a of these.sort((a,b)=>{
      const pa = players.find(p=>p.id===a.playerId), pb = players.find(p=>p.id===b.playerId);
      const lkcmp = (pa && pb) ? (parseFloat(pa.lk.replace(',','.')) - parseFloat(pb.lk.replace(',','.'))) : 0;
      if (lkcmp!==0) return lkcmp;
      return (pa?.lastName||'').localeCompare(pb?.lastName||'','de');
    })){
      const p = players.find(x=>x.id===a.playerId);
      table.appendChild(h('tr',{},
        h('td',{}, `${p?.firstName||''} ${p?.lastName||''}`),
        h('td',{}, p?.lk||''),
        h('td',{}, (()=>{ const currentTeam=(teams.find(t=>t.id===g.teamId)||{}); const p=players.find(x=>x.id===a.playerId); const d=new Date(a.date||g.date); const lockD=p?.lockDate?new Date(p.lockDate):null; const blocked=(p?.locked && p.lockTeamId!==g.teamId && currentTeam.enforceLock && lockD && d>=lockD); const s=blocked?'Gesperrt':a.status; return h('span',{class:`status ${s}`}, s); })()),
        h('td',{}, 
          h('button',{class:'btn btn-secondary',onclick:()=>changeStatus(a)},'Status ändern'),
          ' ',
          h('div',{ 'data-role':'admin' }, 
            h('button',{ class:'btn btn-danger',onclick:()=>removeAssign(a.id)},'Entfernen')
          )
        )
      ));
    }

    // ✅ FESTSCHREIBEN-Fix
    const gameDate = new Date(g.date + "T00:00");
    const today2 = new Date(); today2.setHours(0,0,0,0);
    const isPastOrToday = gameDate <= today2;
    const hasPlayed = these.some(x=>x.status==='Gespielt');

    const finalizeBtn = h('button',{class:'btn', disabled: !(isPastOrToday && hasPlayed), onclick: async()=>{
      for (const a of these.filter(x=>x.status==='Gespielt')){ a.finalized = true; await upsertAssignment(a); await recomputeLocksAndEnforce(); }
      await applyFestspielenColors();
      alert('Spieler festgeschrieben. Änderungen jetzt nur noch als Admin (Online-Version) möglich.');
      viewGames(container);
    }},'Spieler festschreiben');
    wrap.appendChild(h('div',{style:'margin-top:8px'}, finalizeBtn));

    wrap.appendChild(table);
    container.appendChild(wrap);
  }

  async function addAssign(g){
    const sel = document.getElementById(`selP-${g.id}`);
    if(!sel || !sel.value){ alert('Kein Spieler verfügbar oder ausgewählt.'); return; }
    const playerId = sel.value;
    const status = document.getElementById(`selS-${g.id}`).value;
    if (!await canAssignPlayerOnDate(playerId, g.date)){
      alert('Dieser Spieler ist an diesem Tag bereits in einer anderen Mannschaft eingetragen.');
      return;
    }
    await upsertAssignment({ id:uuid(), gameId:g.id, teamId:g.teamId, playerId, status, date:g.date, finalized:false });
    await recomputeLocksAndEnforce();
    await applyFestspielenColors();
    viewGames(container);
  }
  async function changeStatus(a){
    const next = a.status==='Eingeplant' ? 'Ersatz' : a.status==='Ersatz' ? 'Gespielt' : 'Eingeplant';
    a.status = next;
    await upsertAssignment(a); await recomputeLocksAndEnforce();
    viewGames(container);
  }
  async function removeAssign(id){
    await deleteAssignment(id); await recomputeLocksAndEnforce();
    viewGames(container);
  }
  async function deleteGame(id){
    if(!confirm('Spiel wirklich löschen? Zugeordnete Einsätze werden ebenfalls entfernt.')) return;
    await deleteGameCascade(id);
    viewGames(container);
  }
  async function editGame(g){
    if(!g){
      const teams = await listTeams();
      g = { id:uuid(), date: new Date().toISOString().substring(0,10), time:'14:00', teamId: teams[0]?.id, location: '' };
    }
    const teams = await listTeams();
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="card" style="min-width:320px">
        <h3>${g.id?'Spiel bearbeiten':'Spiel anlegen'}</h3>
        <label>Datum</label><input type="date" id="date" value="${(g.date||'').substring(0,10)}"/>
        <label>Uhrzeit</label><input type="time" id="time" value="${g.time||'14:00'}"/>
        <label>Mannschaft</label>
        <select id="team">${teams.map(t=>`<option value="${t.id}" ${g.teamId===t.id?'selected':''}>${t.name}</option>`).join('')}</select>
        <label>Ort</label><input id="loc" value="${g.location||''}"/>
        <menu>
          <button value="cancel" class="btn btn-secondary">Abbrechen</button>
          <button value="ok" class="btn">Speichern</button>
        </menu>
      </form>`;
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.addEventListener('close', async()=>{
      if (dlg.returnValue==='ok'){
        g.date = dlg.querySelector('#date').value;
        g.time = dlg.querySelector('#time').value;
        g.teamId = dlg.querySelector('#team').value;
        g.location = dlg.querySelector('#loc').value;
        await upsertGame(g);
        viewGames(container);
      }
      dlg.remove();
    });
  }
}

/* =============================
   Kalender
============================= */
async function viewCalendar(container){
  clear(container);
  const header = h('div',{class:'grid grid-2'},
    h('div',{}, h('h2',{},'Kalender')),
    h('div',{style:'text-align:right'}, '')
  );
  container.appendChild(header);
  const today = new Date();
  let ym = { y: today.getFullYear(), m: today.getMonth() };

  const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const calTitle = h('div',{class:'cal-title'}, `${months[ym.m]} ${ym.y}`);
const bar = h('div',{style:'display:flex; gap:8px; align-items:center; margin:8px 0;'},
    h('button',{class:'btn btn-secondary', onclick:()=>{ ym.m--; if(ym.m<0){ym.m=11; ym.y--;} render(); }},'◀'),
    calTitle,
    h('button',{class:'btn btn-secondary', onclick:()=>{ ym.m++; if(ym.m>11){ym.m=0; ym.y++;} render(); }},'▶')
  );
  container.appendChild(bar);

  const cal = h('div',{class:'calendar'});
  container.appendChild(cal);
  render();

  async function render(){
    if (calTitle) calTitle.textContent = `${months[ym.m]} ${ym.y}`;
    clear(cal);
    const first = new Date(ym.y, ym.m, 1);
    const startDay = (first.getDay()+6)%7; // Montag = 0
    const daysInMonth = new Date(ym.y, ym.m+1, 0).getDate();
    const games = await DB.getAll('games');
    const teams = await DB.getAll('teams');
    const grid = h('div',{class:'grid'});
    ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(hh=>grid.appendChild(h('div',{style:'font-weight:700;text-align:center'},hh)));
    for (let i=0;i<startDay;i++) grid.appendChild(h('div',{}));
    for (let d=1; d<=daysInMonth; d++){
      const iso = new Date(ym.y, ym.m, d).toISOString().substring(0,10);
      const dayBox = h('div',{class:'day'}, h('div',{class:'d'}, String(d)));
      for (const g of games.filter(x=> (x.date||'').substring(0,10)===iso )){
        const t = teams.find(tt=>tt.id===g.teamId);
        dayBox.appendChild(h('div',{class:'clickable', onclick:()=>openGameDialog(g)}, `• ${g.time||''} ${t?.name||'Team'} (${g.location||''})`));
      }
      grid.appendChild(dayBox);
    }
    cal.appendChild(grid);
  }
}


async function openGameDialog(g){
  const teams = await listTeams();
  const teamName = teams.find(t=>t.id===g.teamId)?.name||'Unbekannt';
  const allPlayers = await listPlayersSorted('asc');
  const allAss = await listAssignments();
  const these = allAss.filter(a=>a.gameId===g.id);
  let statusFilter = 'ALLE'; let lkOrder = 'asc';
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `
    <form method="dialog" class="card" style="min-width:360px;max-width:740px">
      <h3>${teamName} – ${new Date(g.date).toLocaleDateString('de-DE')} ${g.time||''}</h3>
      <p style="margin:.5rem 0;">${g.location||''} – ${g.notes||''}</p>
      <div class="grid grid-3" style="gap:.5rem">
        <div><label>Status-Filter</label>
          <select id="fstatus">
            <option value="ALLE">Alle</option>
            <option>Eingeplant</option>
            <option>Ersatz</option>
            <option>Gespielt</option>
            <option>Gesperrt</option>
          </select>
        </div>
        <div><label>LK Sortierung</label>
          <select id="flk"><option value="asc">Aufsteigend</option><option value="desc">Absteigend</option></select>
        </div>
        <div style="display:flex;align-items:flex-end;justify-content:flex-end"><button class="btn btn-secondary" value="cancel">Schließen</button></div>
      </div>
      <div id="list"></div>
    </form>`;
  document.body.appendChild(dlg);
  const render = ()=>{
    const f = dlg.querySelector('#fstatus').value || 'ALLE';
    const ord = dlg.querySelector('#flk').value || 'asc';
    const cont = dlg.querySelector('#list'); cont.innerHTML='';
    const rows = these
      .map(a=>{ const p=allPlayers.find(pp=>pp.id===a.playerId); return {a,p,lk: parseFloat(String(p?.lk||'0').replace(',','.'))||0}; })
      .filter(x=> x.p && (f==='ALLE' || x.a.status===f))
      .sort((x,y)=> ord==='asc'? x.lk-y.lk : y.lk-x.lk);
    rows.forEach(({a,p})=>{
      const color = p.color ? `background:${p.color}22;border-left:6px solid ${p.color};` : '';
      cont.appendChild(h('div',{class:'card',style:`margin:.4rem 0;${color}`},
        h('div',{}, `${p.firstName} ${p.lastName} – LK ${p.lk}`),
        h('div',{style:'opacity:.7'}, `Status: ${a.status}`)
      ));
    });
  };
  dlg.querySelector('#fstatus').addEventListener('change', render);
  dlg.querySelector('#flk').addEventListener('change', render);
  render();
  dlg.showModal();
  dlg.addEventListener('close', ()=> dlg.remove());
}

// --- Guarded app boot for auth-controlled start ---
if (!window.__APP_BOOTED__) window.__APP_BOOTED__ = false;
async function __startAppOnce(){
  if(window.__APP_BOOTED__) return;
  window.__APP_BOOTED__ = true;
  try{
    await ensureSeasonHeader();
    renderDashboard();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  }catch(e){ console.error('[App] boot error', e); }
}
window.__appBoot = __startAppOnce;

// Optional: if session already exists at load, boot (boot-auth also calls this)
document.addEventListener('DOMContentLoaded', async ()=>{
  try{
    if(window.sb && window.sb.auth){
      const { data: { session } } = await window.sb.auth.getSession();
      if(session) window.__appBoot && window.__appBoot();
    }
  }catch(e){ console.warn('[App] session probe failed', e); }
});


// Disable inputs for players (role-guard will also cover, but ensure graceful)
    const role = (document.documentElement && document.documentElement.dataset && document.documentElement.dataset.currentRole) || window.__CURRENT_ROLE__ || 'guest';
    if (window.roleGuard && !window.roleGuard.hasAtLeast(role,'coach')){
      tbody.querySelectorAll('input,button').forEach(el=>{ if(!el.closest('[data-min-role]')) el.disabled=true; });
    }

  /* =============================
   Strafenkatalog (wie Spielerliste)
============================= */
async function viewPenalties(container){
  clear(container);

  // Header like players
  const header = h('div',{class:'grid grid-2'},
    h('div',{}, h('h2',{},'Strafenkatalog')),
    h('div',{style:'text-align:right'},
      h('button',{'data-min-role':'coach', class:'btn', onclick:()=>editPenalty()},'Neue Strafe')
    )
  );
  container.appendChild(header);

  // Table
  const table = h('table',{class:'table'});
  table.appendChild(h('tr',{}, h('th',{},'Beschreibung'), h('th',{},'Betrag (€)'), h('th',{},'Aktion')));

  // Fixed top row: Mannschaftskasse
  const fundAmount = await getTeamFundAmount();
  const trFund = h('tr',{},
    h('td',{}, h('strong',{},'Mannschaftskasse')),
    h('td',{}, String((fundAmount||0).toFixed ? fundAmount.toFixed(2) : Number(fundAmount||0).toFixed(2))),
    h('td',{},
      h('button', {'data-min-role':'coach', class:'btn btn-secondary', onclick: ()=>editFund()}, 'Bearbeiten')
    )
  );
  table.appendChild(trFund);

  // Penalties rows
  const rows = await listPenalties();
  for(const r of rows){
    table.appendChild(h('tr',{},
      h('td',{}, r.text || ''),
      h('td',{}, (typeof r.amount==='number' ? r.amount : parseFloat(String(r.amount||'0')) || 0).toFixed(2)),
      h('td',{},
        h('button', {'data-min-role':'coach', class:'btn btn-secondary', onclick: ()=>editPenalty(r)}, 'Bearbeiten'),
        ' ',
        h('button', {'data-min-role':'coach', class:'btn btn-danger', onclick: async ()=>{ if(!confirm('Diese Strafe löschen?')) return; await deletePenalty(r.id); viewPenalties(container); }}, 'Löschen')
      )
    ));
  }

  container.appendChild(table);

  async function editPenalty(p={ id:uuid(), text:'', amount:0 }){
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="card" style="min-width:320px">
        <h3>${p && p.id ? 'Strafe bearbeiten' : 'Strafe anlegen'}</h3>
        <label>Beschreibung</label>
        <input id="penText" value="${(p.text||'').replace(/"/g,'&quot;')}" required />
        <label>Betrag (€)</label>
        <input id="penAmt" type="number" step="0.01" value="${(typeof p.amount==='number'?p.amount:parseFloat(String(p.amount||'0'))||0).toFixed(2)}" required />
        <menu>
          <button value="cancel" class="btn btn-secondary" type="reset">Abbrechen</button>
          <button value="ok" class="btn">Speichern</button>
        </menu>
      </form>`;
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.addEventListener('close', async ()=>{
      if(dlg.returnValue!=='ok'){ dlg.remove(); return; }
      const text = dlg.querySelector('#penText').value.trim();
      const amount = parseFloat(dlg.querySelector('#penAmt').value||'0')||0;
      await upsertPenalty({ id:p.id, text, amount });
      dlg.remove();
      viewPenalties(container);
    }, {once:true});
  }

  async function editFund(){
    const current = await getTeamFundAmount();
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="card" style="min-width:320px">
        <h3>Mannschaftskasse bearbeiten</h3>
        <label>Betrag (€)</label>
        <input id="fundAmt" type="number" step="0.01" value="${(current||0).toFixed(2)}" required />
        <menu>
          <button value="cancel" class="btn btn-secondary" type="reset">Abbrechen</button>
          <button value="ok" class="btn">Speichern</button>
        </menu>
      </form>`;
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.addEventListener('close', async ()=>{
      if(dlg.returnValue!=='ok'){ dlg.remove(); return; }
      const amount = parseFloat(dlg.querySelector('#fundAmt').value||'0')||0;
      await setTeamFundAmount(amount);
      dlg.remove();
      viewPenalties(container);
    }, {once:true});
  }
}
