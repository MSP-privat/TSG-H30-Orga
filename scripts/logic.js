import { DB, uuid } from './db.js';

// ---------- Season meta ----------
export async function getCurrentSeasonId() {
  const it = await DB.get('meta', 'season');
  return it?.value || null;
}
export async function setCurrentSeasonId(id) {
  await DB.put('meta', { key: 'season', value: id });
}

export async function getEinsatzCountsErsatz() {
  const it = await DB.get('meta', 'einsatzCountsErsatz');
  return it?.value !== undefined ? !!it.value : true;
}
export async function setEinsatzCountsErsatz(val) {
  await DB.put('meta', { key: 'einsatzCountsErsatz', value: !!val });
}

// ---------- Lists ----------
export async function listSeasons() { return await DB.getAll('seasons'); }

export async function listPlayersSorted(order = 'asc') {
  const seasonId = await getCurrentSeasonId();
  const ps = (await DB.getAll('players')).filter(p => p.seasonId === seasonId);
  ps.sort((a, b) => {
    const na = parseFloat(String(a.lk).replace(',', '.')) || 0;
    const nb = parseFloat(String(b.lk).replace(',', '.')) || 0;
    if (na !== nb) return order === 'asc' ? na - nb : nb - na;
    return (a.lastName || '').localeCompare(b.lastName || '', 'de');
  });
  return ps;
}
export async function listTeams() {
  const seasonId = await getCurrentSeasonId();
  return (await DB.getAll('teams')).filter(t => t.seasonId === seasonId);
}
export async function listGames() {
  const seasonId = await getCurrentSeasonId();
  return (await DB.getAll('games')).filter(g => g.seasonId === seasonId);
}
export async function listAssignments() {
  const seasonId = await getCurrentSeasonId();
  return (await DB.getAll('assignments')).filter(a => a.seasonId === seasonId);
}

// ---------- Upserts ----------
export async function upsertPlayer(p) {
  if (!p.id) p.id = uuid();
  if (!p.seasonId) p.seasonId = await getCurrentSeasonId();
  return await DB.put('players', p);
}
export async function upsertTeam(t) {
  if (!t.id) t.id = uuid();
  if (!t.seasonId) t.seasonId = await getCurrentSeasonId();
  return await DB.put('teams', t);
}
export async function upsertGame(g) {
  if (!g.id) g.id = uuid();
  if (!g.seasonId) g.seasonId = await getCurrentSeasonId();
  return await DB.put('games', g);
}
export async function upsertAssignment(a) {
  if (!a.id) a.id = uuid();
  if (!a.seasonId) a.seasonId = await getCurrentSeasonId();
  return await DB.put('assignments', a);
}
export async function deleteAssignment(id) { return await DB.delete('assignments', id); }

// ---------- Cascades ----------
export async function deletePlayerCascade(playerId) {
  const as = await listAssignments();
  for (const a of as.filter(x => x.playerId === playerId)) await DB.delete('assignments', a.id);
  await DB.delete('players', playerId);
}
export async function deleteTeamCascade(teamId) {
  const games = await listGames();
  for (const g of games.filter(x => x.teamId === teamId)) {
    await deleteGameCascade(g.id);
  }
  await DB.delete('teams', teamId);
}
export async function deleteGameCascade(gameId) {
  const as = await listAssignments();
  for (const a of as.filter(x => x.gameId === gameId)) await DB.delete('assignments', a.id);
  await DB.delete('games', gameId);
}

// ---------- Regeln ----------
export async function canAssignPlayerOnDate(playerId, date, excludeId = null) {
  const ass = await listAssignments();
  const target = new Date(date); target.setHours(0, 0, 0, 0);
  return !ass.some(x => x.playerId === playerId && (!excludeId || x.id !== excludeId) && (new Date(x.date).setHours(0, 0, 0, 0) === target.getTime()));
}
export async function getUnavailablePlayerIdsForDate(date) {
  const ass = await listAssignments();
  const target = new Date(date).setHours(0, 0, 0, 0);
  return new Set(ass.filter(a => new Date(a.date).setHours(0, 0, 0, 0) === target).map(a => a.playerId));
}

// ---------- Farben ab 2 Einsätzen (gleiches Zählset wie Locks) ----------
export async function applyFestspielenColors() {
  const teams = await listTeams();
  const ass = await listAssignments();

  const einsatzCountsErsatz = await getEinsatzCountsErsatz();
  const COUNT_STATUSES = einsatzCountsErsatz
    ? ['Eingeplant', 'Ersatz', 'Gespielt']   // Eingeplant zählt ab jetzt
    : ['Eingeplant', 'Gespielt'];

  const cnt = {}; // cnt[playerId][teamId]
  for (const a of ass) {
    const t = teams.find(tt => tt.id === a.teamId);
    if (!t || !t.lockable) continue;
    if (!COUNT_STATUSES.includes(a.status)) continue;
    cnt[a.playerId] = cnt[a.playerId] || {};
    cnt[a.playerId][t.id] = (cnt[a.playerId][t.id] || 0) + 1;
  }

  const players = await DB.getAll('players');
  for (const pid of Object.keys(cnt)) {
    for (const tid of Object.keys(cnt[pid])) {
      if (cnt[pid][tid] >= 2) {
        const team = teams.find(t => t.id === tid);
        const p = players.find(pl => pl.id === pid);
        if (team && p && team.lockColor && p.color !== team.lockColor) {
          p.color = team.lockColor;
          await DB.put('players', p);
        }
      }
    }
  }
}

// ---------- Sperrlogik (clientseitig) ----------
let __LOCK_INDEX = {}; // { [playerId]: { teamId, date } }
export function getPlayerLockIndex() { return __LOCK_INDEX; }

export async function recomputeLocksAndEnforce() {
  const teams = await listTeams();
  const games = await listGames();
  const ass = await listAssignments();
  const players = await DB.getAll('players');

  const einsatzCountsErsatz = await getEinsatzCountsErsatz();
  const COUNT_STATUSES = einsatzCountsErsatz
    ? ['Eingeplant', 'Ersatz', 'Gespielt']   // Eingeplant zählt ab jetzt
    : ['Eingeplant', 'Gespielt'];

  const sorted = [...ass].sort((a, b) => new Date(a.date || '1970-01-01') - new Date(b.date || '1970-01-01'));

  const count = {};
  const secondDate = {};
  const lockTeamFor = {};

  for (const a of sorted) {
    if (!COUNT_STATUSES.includes(a.status)) continue;
    const t = teams.find(tt => tt.id === a.teamId);
    if (!t || !t.lockable) continue;
    count[a.playerId] = count[a.playerId] || {};
    const c = (count[a.playerId][t.id] || 0) + 1;
    count[a.playerId][t.id] = c;
    if (c === 2 && !secondDate[a.playerId]) {
      secondDate[a.playerId] = a.date;
      lockTeamFor[a.playerId] = t.id;
    }
  }

  __LOCK_INDEX = {};
  for (const pid of Object.keys(lockTeamFor)) {
    __LOCK_INDEX[pid] = { teamId: lockTeamFor[pid], date: secondDate[pid] };
  }
  if (typeof window !== 'undefined') window.__lockIndex = __LOCK_INDEX;

  // Optional: Farbe übernehmen
  for (const p of players) {
    const info = __LOCK_INDEX[p.id];
    if (info) {
      const t = teams.find(tt => tt.id === info.teamId);
      if (t?.lockColor && p.color !== t.lockColor) {
        p.color = t.lockColor;
        await DB.put('players', p);
      }
    }
  }

  // Sperre nur für Eingeplant/Ersatz/Gespielt (NEIN für Zugesagt)
  for (const a of ass) {
    const info = __LOCK_INDEX[a.playerId];
    if (!info) continue;
    if (a.teamId === info.teamId) continue;
    const t = teams.find(tt => tt.id === a.teamId);
    if (!t || !t.enforceLock) continue;

    const d = new Date(a.date);
    const lockD = new Date(info.date);
    const enforceable = ['Eingeplant', 'Ersatz', 'Gespielt', 'Zugesagt'].includes(a.status); 
    if (enforceable && d >= lockD) {
      if (a.status !== 'Gesperrt') {
        a.status = 'Gesperrt';
        await DB.put('assignments', a);
      }
    }
  }

  return __LOCK_INDEX;
}

// ---------- Seasons: delete cascade ----------
export async function deleteSeasonCascade(seasonId) {
  if (!seasonId) return false;
  const curr = await getCurrentSeasonId();
  const players = (await DB.getAll('players')).filter(p => p.seasonId === seasonId);
  const teams = (await DB.getAll('teams')).filter(t => t.seasonId === seasonId);
  const games = (await DB.getAll('games')).filter(g => g.seasonId === seasonId);
  const assigns = (await DB.getAll('assignments')).filter(a => a.seasonId === seasonId);

  for (const g of games) { try { await deleteGameCascade(g.id); } catch {} }
  for (const a of assigns) { try { await DB.delete('assignments', a.id); } catch {} }
  for (const p of players) { try { await deletePlayerCascade(p.id); } catch {} }
  for (const t of teams) { try { await deleteTeamCascade(t.id); } catch {} }

  try {
    const pens = await DB.getAll('penalties');
    for (const pe of pens.filter(x => x.seasonId === seasonId)) { try { await DB.delete('penalties', pe.id); } catch {} }
  } catch {}

  try { await DB.delete('seasons', seasonId); } catch {}
  if (curr === seasonId) {
    const remaining = await DB.getAll('seasons');
    await setCurrentSeasonId(remaining[0]?.id || null);
  }
  return true;
}

// ---------- Penalties ----------
export async function listPenalties() {
  const sid = await getCurrentSeasonId();
  try {
    const all = await DB.getAll('penalties');
    return all.filter(x => x.seasonId === sid);
  } catch { return []; }
}
export async function upsertPenalty(p) {
  const sid = await getCurrentSeasonId();
  const it = {
    id: p.id || uuid(),
    seasonId: sid,
    text: (p.text || '').trim(),
    amount: typeof p.amount === 'number' ? p.amount : parseFloat(String(p.amount || '0').replace(',', '.')) || 0
  };
  await DB.put('penalties', it);
  return it;
}
export async function deletePenalty(id) {
  try { return await DB.delete('penalties', id); } catch { return false; }
}

// ---------- Team Fund ----------
export async function getTeamFundAmount() {
  const sid = await getCurrentSeasonId();
  if (!sid) return 0;
  const rec = await DB.get('meta', 'kasse:' + sid);
  const v = rec && rec.value != null ? rec.value : 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
export async function setTeamFundAmount(amount) {
  const sid = await getCurrentSeasonId();
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount || '0').replace(',', '.')) || 0;
  await DB.put('meta', { key: 'kasse:' + sid, value: n });
  return n;
}
