// /scripts/db.js
// Zentrale DB-Abstraktion mit camelCase <-> snake_case Mapping für Supabase
// Erwartet: window.sb (Supabase-Client), wird in auth.js erzeugt.

function ensureSB(){
  if (!window.sb) throw new Error('[DB] Supabase client (window.sb) nicht gefunden.');
  return window.sb;
}

// UUID Helper (für Client-seitig erzeugte IDs)
export function uuid(){
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
    const r = Math.random()*16|0, v = c==='x'? r : (r&0x3|0x8);
    return v.toString(16);
  });
}

// Feld-Mapping je Tabelle: camelCase -> snake_case
const FIELD_MAP = {
  players: {
    id: 'id',
    seasonId: 'season_id',
    firstName: 'first_name',
    lastName: 'last_name',
    lk: 'lk',
    color: 'color',
    ranking: 'ranking',
    lockTeamId: 'lock_team_id',
    locked: 'locked',
    lockDate: 'lock_date',
    manualBanTeamId: 'manual_ban_team_id',
    manualBanActive: 'manual_ban_active'
  },
  teams: {
    id: 'id',
    seasonId: 'season_id',
    name: 'name',
    lockable: 'lockable',
    enforceLock: 'enforce_lock',
    lockColor: 'lock_color'
  },
  games: {
    id: 'id',
    seasonId: 'season_id',
    date: 'date',
    time: 'time',
    teamId: 'team_id',
    location: 'location',
    notes: 'notes'
  },
  assignments: {
    id: 'id',
    seasonId: 'season_id',
    gameId: 'game_id',
    teamId: 'team_id',
    playerId: 'player_id',
    status: 'status',
    date: 'date',
    finalized: 'finalized'
  },
  penalties: {
    id: 'id',
    seasonId: 'season_id',
    text: 'text',
    amount: 'amount'
  },
  seasons: {
    id: 'id',
    name: 'name',
    year: 'year',
    active: 'active'
  },
  meta: {
    key: 'key',
    value: 'value'
  }
};

// snake_case -> camelCase (Rückweg)
function invertMap(map){
  const inv = {};
  for (const k of Object.keys(map)) inv[map[k]] = k;
  return inv;
}
const FIELD_MAP_INV = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([t, m]) => [t, invertMap(m)])
);

// Record für Supabase vorbereiten (nur gemappte Felder)
function toDbRecord(table, obj){
  const map = FIELD_MAP[table];
  if (!map) return obj;
  const out = {};
  for (const [ck, sk] of Object.entries(map)){
    if (obj[ck] !== undefined) out[sk] = obj[ck];
  }
  return out;
}

// Record aus Supabase zurück auf camelCase mappen
function fromDbRecord(table, row){
  const map = FIELD_MAP_INV[table];
  if (!map) return row;
  const out = {};
  for (const [sk, val] of Object.entries(row)){
    const ck = map[sk] || sk;
    out[ck] = val;
  }
  return out;
}

async function selectAll(table){
  const sb = ensureSB();
  const { data, error } = await sb.from(table).select('*');
  if (error) throw error;
  return (data||[]).map(r => fromDbRecord(table, r));
}

async function selectOne(table, key){
  const sb = ensureSB();
  if (table === 'meta'){
    const { data, error } = await sb.from('meta').select('*').eq('key', key).maybeSingle();
    if (error) throw error;
    return data ? fromDbRecord('meta', data) : null;
  }
  // default: by id
  const { data, error } = await sb.from(table).select('*').eq('id', key).maybeSingle();
  if (error) throw error;
  return data ? fromDbRecord(table, data) : null;
}

async function upsert(table, obj){
  const sb = ensureSB();
  const payload = toDbRecord(table, obj);
  // Schlüssel bestimmen
  const keyCol = table === 'meta' ? 'key' : 'id';
  if (!payload[keyCol]){
    // falls kein Key vorhanden, clientseitig erzeugen (außer meta)
    if (table !== 'meta') payload[keyCol] = uuid();
  }
  const { data, error } = await sb.from(table).upsert(payload).select().maybeSingle();
  if (error) throw error;
  return data ? fromDbRecord(table, data) : fromDbRecord(table, payload);
}

async function remove(table, key){
  const sb = ensureSB();
  const col = table === 'meta' ? 'key' : 'id';
  const { error } = await sb.from(table).delete().eq(col, key);
  if (error) throw error;
  return true;
}

export const DB = {
  async getAll(table){ return await selectAll(table); },
  async get(table, key){ return await selectOne(table, key); },
  async put(table, obj){ return await upsert(table, obj); },
  async delete(table, key){ return await remove(table, key); }
};
