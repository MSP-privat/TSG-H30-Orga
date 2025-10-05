import {DB, uuid} from './db.js';

// === Saison-Helper ===
export async function getCurrentSeasonId(){
  const it = await DB.get('meta','season');
  return it?.value || null;
}
export async function setCurrentSeasonId(id){
  await DB.put('meta', {key:'season', value:id});
}

export async function getEinsatzCountsErsatz(){
  const it = await DB.get('meta','einsatzCountsErsatz');
  return it?.value !== undefined ? !!it.value : true;
}
export async function setEinsatzCountsErsatz(val){
  await DB.put('meta',{key:'einsatzCountsErsatz', value: !!val});
}

export async function seedOnce(){
  const seeded = await DB.get('meta','seed');
  if (seeded) return;
  const seasonId = uuid();
  await DB.put('seasons', {id:seasonId, name:'Saison Demo', year:new Date().getFullYear(), active:true});
  await setCurrentSeasonId(seasonId);
  const teams=[
    {id:uuid(), seasonId, name:'Herren I', lockable:true, enforceLock:true, locked:false, lockColor:'#ffd400'},
    {id:uuid(), seasonId, name:'Herren II', lockable:true, enforceLock:true, locked:false, lockColor:'#1e5c94'},
    {id:uuid(), seasonId, name:'Herren III', lockable:true, enforceLock:true, locked:false, lockColor:'#22c55e'},
  ];
  for(const t of teams) await DB.put('teams',t);
  for(let i=1;i<=8;i++){
    await DB.put('players',{
      id:uuid(), seasonId, firstName:'Spieler'+i, lastName:'Demo',
      lk:(8+i/10).toFixed(2).replace('.',','), color:null,
      ranking: 9999,
      manualBanTeamId: null,
      manualBanActive: false
    });
  }
  const today = new Date();
  await DB.put('games',{id:uuid(), seasonId, date: today.toISOString().substring(0,10), time:'14:00', teamId: teams[0].id, location:'Heim'});
  await DB.put('games',{id:uuid(), seasonId, date: new Date(today.getTime()+86400000).toISOString().substring(0,10), time:'10:00', teamId: teams[1].id, location:'Auswärts'});
  await DB.put('meta',{key:'seed', value:true});
}

// === Listen nach Saison gefiltert ===
export async function listSeasons(){ return await DB.getAll('seasons'); }

function numRanking(p){
  const n = parseInt(String(p?.ranking ?? ''), 10);
  return Number.isFinite(n) ? n : 9999;
}
export async function listPlayersSorted(){
  const seasonId = await getCurrentSeasonId();
  const ps = (await DB.getAll('players')).filter(p=>p.seasonId===seasonId);
  ps.sort((a,b)=>{
    const ra = numRanking(a), rb = numRanking(b);
    if (ra !== rb) return ra - rb;                        // 1) Nummer (Ranking)
    const ln = (a.lastName||'').localeCompare(b.lastName||'','de'); // 2) Nachname
    if (ln !== 0) return ln;
    return (a.firstName||'').localeCompare(b.firstName||'','de');   // 3) Vorname
  });
  return ps;
}
export async function listTeams(){
  const seasonId = await getCurrentSeasonId();
  return (await DB.getAll('teams')).filter(t=>t.seasonId===seasonId);
}
export async function listGames(){
  const seasonId = await getCurrentSeasonId();
  return (await DB.getAll('games')).filter(g=>g.seasonId===seasonId);
}
export async function listAssignments(){
  const seasonId = await getCurrentSeasonId();
  return (await DB.getAll('assignments')).filter(a=>a.seasonId===seasonId);
}

// === Upserts (seasonId wird gesetzt) ===
export async function upsertPlayer(p){
  if(!p.id) p.id=uuid();
  if(!p.seasonId) p.seasonId = await getCurrentSeasonId();
  p.ranking = Number.isFinite(parseInt(String(p.ranking),10)) ? parseInt(String(p.ranking),10) : 9999;
  // manuelle Sperre normalisieren
  p.manualBanTeamId = p.manualBanTeamId || null;
  p.manualBanActive = !!p.manualBanActive;
  return await DB.put('players',p);
}
export async function upsertTeam(t){
  if(!t.id) t.id=uuid();
  if(!t.seasonId) t.seasonId = await getCurrentSeasonId();
  return await DB.put('teams',t);
}
export async function upsertGame(g){
  if(!g.id) g.id=uuid();
  if(!g.seasonId) g.seasonId = await getCurrentSeasonId();
  return await DB.put('games',g);
}
export async function upsertAssignment(a){
  if(!a.id) a.id=uuid();
  if(!a.seasonId) a.seasonId = await getCurrentSeasonId();
  return await DB.put('assignments',a);
}
export async function deleteAssignment(id){ return await DB.delete('assignments',id); }

// === Cascades ===
export async function deletePlayerCascade(playerId){
  const as = await listAssignments();
  for(const a of as.filter(x=>x.playerId===playerId)) await DB.delete('assignments', a.id);
  await DB.delete('players', playerId);
}
export async function deleteTeamCascade(teamId){
  const games = await listGames();
  for(const g of games.filter(x=>x.teamId===teamId)){
    await deleteGameCascade(g.id);
  }
  await DB.delete('teams', teamId);
}
export async function deleteGameCascade(gameId){
  const as = await listAssignments();
  for(const a of as.filter(x=>x.gameId===gameId)) await DB.delete('assignments', a.id);
  await DB.delete('games', gameId);
}

// === Regeln / Helper ===
export async function canAssignPlayerOnDate(playerId, date, excludeId=null){
  const ass = await listAssignments();
  const target = new Date(date); target.setHours(0,0,0,0);
  return !ass.some(x => x.playerId===playerId && (!excludeId || x.id!==excludeId) && (new Date(x.date).setHours(0,0,0,0)===target.getTime()));
}
export async function getUnavailablePlayerIdsForDate(date){
  const ass = await listAssignments();
  const target = new Date(date).setHours(0,0,0,0);
  return new Set(ass.filter(a=>new Date(a.date).setHours(0,0,0,0)===target).map(a=>a.playerId));
}
export async function applyFestspielenColors(){
  const teams = await listTeams();
  const lockedIds = teams.filter(t=>t.locked).map(t=>t.id);
  const as = await listAssignments();
  const cnt = {};
  for(const a of as){
    if(a.status==='Gespielt' && lockedIds.includes(a.teamId)){
      cnt[a.playerId] = cnt[a.playerId] || {};
      cnt[a.playerId][a.teamId] = (cnt[a.playerId][a.teamId]||0) + 1;
    }
  }
  for(const pid of Object.keys(cnt)){
    for(const tid of Object.keys(cnt[pid])){
      if(cnt[pid][tid] >= 2){
        const team = teams.find(t=>t.id===tid);
        const p = (await DB.getAll('players')).find(pl=>pl.id===pid);
        if(team && p && p.color !== team.lockColor){
          p.color = team.lockColor;
          await DB.put('players', p);
        }
      }
    }
  }
}

// --- Festspielen & Spielsperre ---
export async function recomputeLocksAndEnforce(){
  const teams = await listTeams();
  const games = await listGames();
  const ass = await listAssignments();
  const players = await DB.getAll('players');
  const einsatzCountsErsatz = await getEinsatzCountsErsatz();

  // Zählweise: Zugesagt zählt NICHT; Eingeplant/Ersatz/Gespielt zählen
  const COUNT_STATUSES = einsatzCountsErsatz ? ['Eingeplant','Ersatz','Gespielt'] : ['Eingeplant','Gespielt'];

  // chronologisch sortieren
  const sorted = [...ass].sort((a,b)=> new Date(a.date || '1970-01-01') - new Date(b.date || '1970-01-01'));

  // 1) Lock-Anker bestimmen (zweiter Einsatz in lockable Team)
  const count = {};
  const secondDate = {};
  const lockTeamFor = {};

  for (const a of sorted){
    if (!COUNT_STATUSES.includes(a.status)) continue;
    const g = games.find(gg => gg.id === a.gameId);
    if (!g) continue;
    const t = teams.find(tt => tt.id === g.teamId);
    if (!t || !t.lockable) continue;
    count[a.playerId] = count[a.playerId] || {};
    const c = (count[a.playerId][t.id] || 0) + 1;
    count[a.playerId][t.id] = c;
    if (c === 2 && !secondDate[a.playerId]){
      secondDate[a.playerId] = a.date || g.date;
      lockTeamFor[a.playerId] = t.id;
    }
  }

  // 2) Lock-Infos auf Spieler mappen
  for (const p of players){
    const lockTeamId = lockTeamFor[p.id] || null;
    p.lockTeamId = lockTeamId;
    p.locked = !!lockTeamId;
    p.lockDate = lockTeamId ? (secondDate[p.id] || null) : null;
    if (lockTeamId){
      const t = teams.find(tt => tt.id === lockTeamId);
      if (t && t.lockable && t.lockColor){ p.color = t.lockColor; }
    }
    await DB.put('players', p);
  }

  // 3) Durch alle Einsätze gehen und Sperren setzen
  for (const a of ass){
    const g = games.find(gg => gg.id === a.gameId);
    if (!g) continue;
    const t = teams.find(tt => tt.id === g.teamId);
    const p = players.find(pp => pp.id === a.playerId);
    if (!t || !p) continue;

    // 3a) Manuelle Sperre hat Vorrang
    if (p.manualBanActive && p.manualBanTeamId && p.manualBanTeamId === g.teamId){
      if (a.status !== 'Gesperrt'){
        a.status = 'Gesperrt';
        await DB.put('assignments', a);
      }
      continue; // nicht weiter prüfen
    }

    // 3b) Automatische Sperre (Festspielen in anderem Team + enforceLock)
    if (!p.locked || !p.lockTeamId || p.lockTeamId === t.id) continue;
    if (!t.enforceLock) continue;
    const d = new Date(a.date || g.date);
    const lockD = p.lockDate ? new Date(p.lockDate) : null;
    if (lockD && d >= lockD){
      if (['Zugesagt','Eingeplant','Ersatz','Gespielt'].includes(a.status)){
        a.status = 'Gesperrt';
        await DB.put('assignments', a);
      }
    }
  }
}

// Index für UI (key=playerId -> {teamId,date})
export function getPlayerLockIndex(playersArr=[]){
  const idx = {};
  for (const p of (playersArr||[])){
    if (p && p.locked && p.lockTeamId){
      idx[p.id] = { teamId: p.lockTeamId, date: p.lockDate || null };
    }
  }
  return idx;
}

// === Seasons: delete cascade ===
export async function deleteSeasonCascade(seasonId){
  if(!seasonId) return false;
  const curr = await getCurrentSeasonId();
  const players = (await DB.getAll('players')).filter(p=>p.seasonId===seasonId);
  const teams = (await DB.getAll('teams')).filter(t=>t.seasonId===seasonId);
  const games = (await DB.getAll('games')).filter(g=>g.seasonId===seasonId);
  const assigns = (await DB.getAll('assignments')).filter(a=>a.seasonId===seasonId);
  for(const g of games){ try{ await deleteGameCascade(g.id); }catch{} }
  for(const a of assigns){ try{ await DB.delete('assignments', a.id); }catch{} }
  for(const p of players){ try{ await deletePlayerCascade(p.id); }catch{} }
  for(const t of teams){ try{ await deleteTeamCascade(t.id); }catch{} }
  try{
    const pens = await DB.getAll('penalties');
    for(const pe of pens.filter(x=>x.seasonId===seasonId)){ try{ await DB.delete('penalties', pe.id); }catch{} }
  }catch{}
  try{ await DB.delete('seasons', seasonId); }catch{}
  if(curr===seasonId){
    const remaining = await DB.getAll('seasons');
    await setCurrentSeasonId(remaining[0]?.id || null);
  }
  return true;
}

// === Strafenkatalog ===
export async function listPenalties(){
  const sid = await getCurrentSeasonId();
  try{ const all = await DB.getAll('penalties'); return all.filter(x=>x.seasonId===sid); }catch{ return []; }
}
export async function upsertPenalty(p){
  const sid = await getCurrentSeasonId();
  const it = {
    id: p.id || uuid(),
    seasonId: sid,
    text: (p.text||'').trim(),
    amount: typeof p.amount==='number' ? p.amount : parseFloat(String(p.amount||'0').replace(',','.'))||0
  };
  await DB.put('penalties', it);
  return it;
}
export async function deletePenalty(id){
  try{ return await DB.delete('penalties', id); }catch{ return false; }
}

// === Mannschaftskasse ===
export async function getTeamFundAmount(){
  const sid = await getCurrentSeasonId();
  if(!sid) return 0;
  const rec = await DB.get('meta', 'kasse:'+sid);
  const v = rec && rec.value != null ? rec.value : 0;
  const n = parseFloat(String(v).replace(',','.'));
  return isNaN(n) ? 0 : n;
}
export async function setTeamFundAmount(amount){
  const sid = await getCurrentSeasonId();
  const n = typeof amount==='number' ? amount : parseFloat(String(amount||'0').replace(',','.'))||0;
  await DB.put('meta', {key: 'kasse:'+sid, value: n});
  return n;
}
