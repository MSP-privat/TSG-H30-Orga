// /scripts/db.js
// Zentrale DB-Abstraktion: Supabase CRUD + camelCase <-> snake_case Mapping
// Erwartet: window.SUPABASE_URL, window.SUPABASE_ANON_KEY (aus /env.js)
// Falls window.sb nicht existiert, wird der Client automatisch erstellt.

/////////////////////////////
// Utility
/////////////////////////////
export function uuid(){
  if (crypto?.randomUUID) return crypto.randomUUID();
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
    const r = Math.random()*16|0, v = c==='x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}

function toBool(v){
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1' || v === 1) return true;
  if (v === 'false' || v === '0' || v === 0 || v == null) return false;
  return Boolean(v);
}

function toInt(v, fallback=null){
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toNum(v, fallback=null){
  const n = typeof v === 'number' ? v : parseFloat(String(v||'').replace(',','.'));
  return Number.isFinite(n) ? n : fallback;
}

function toISODate(v){
  if (!v) return null;
  try{
    // akzeptiert 'YYYY-MM-DD' oder Date/ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return v;
    const d = new Date(v);
    if (isNaN(d)) return null;
    return d.toISOString().slice(0,10);
  }catch{ return null; }
}

/////////////////////////////
// Supabase Client
/////////////////////////////
function ensureSB(){
  if (window.sb) return window.sb;

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){
    console.error('[DB] Supabase-Umgebung fehlt. Setze window.SUPABASE_URL / window.SUPABASE_ANON_KEY in env.js');
    throw new Error('Supabase environment missing');
  }
  if (!window.supabase || !window.supabase.createClient){
    console.error('[DB] supabase-js SDK nicht geladen. Stelle sicher, dass <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" defer> vor den App-Skripten steht.');
    throw new Error('supabase SDK missing');
  }

  window.sb = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
  return window.sb;
}

/////////////////////////////
// Mapping camelCase -> snake_case je Tabelle
/////////////////////////////
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

function invertMap(map){
  const inv = {};
  for (const k of Object.keys(map)) inv[map[k]] = k;
  return inv;
}
const FIELD_MAP_INV = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([t, m]) => [t, invertMap(m)])
);

/////////////////////////////
// Sanitizing je Tabelle (beim Schreiben)
/////////////////////////////
function sanitizeForTable(table, obj){
  const o = {...obj};
  switch(table){
    case 'players':
      o.ranking = toInt(o.ranking, 9999);
      o.locked = toBool(o.locked);
      o.lockDate = toISODate(o.lockDate);
      o.manualBanActive = toBool(o.manualBanActive);
      // UUID-Felder leer -> null
      o.lockTeamId = o.lockTeamId || null;
      o.manualBanTeamId = o.manualBanTeamId || null;
      // lk als String belassen (Format z.B. "10,50")
      return o;

    case 'teams':
      o.lockable = toBool(o.lockable);
      o.enforceLock = toBool(o.enforceLock);
      o.lockColor = o.lockColor || '#ffd400';
      return o;

    case 'games':
      o.date = toISODate(o.date) || toISODate(new Date());
      o.time = (o.time || '14:00').slice(0,5);
      o.teamId = o.teamId || null;
      o.location = o.location || '';
      return o;

    case 'assignments':
      o.finalized = toBool(o.finalized);
      o.date = toISODate(o.date);
      o.teamId = o.teamId || null;
      o.playerId = o.playerId || null;
      o.gameId = o.gameId || null;
      // Status sichern
      if (!o.status) o.status = 'Zugesagt';
      return o;

    case 'penalties':
      o.amount = toNum(o.amount, 0) ?? 0;
      return o;

    case 'seasons':
      o.year = toInt(o.year, new Date().getFullYear());
      o.active = toBool(o.active ?? true);
      return o;

    case 'meta':
      // value kann Text, Zahl, JSON sein – nichts erzwingen
      return o;

    default:
      return o;
  }
}

/////////////////////////////
// Mapping-Funktionen
/////////////////////////////
function toDbRecord(table, obj){
  const map = FIELD_MAP[table];
  if (!map) return obj;
  const clean = sanitizeForTable(table, obj);
  const out = {};
  for (const [ck, sk] of Object.entries(map)){
    if (clean[ck] !== undefined) out[sk] = clean[ck];
  }
  return out;
}

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

/////////////////////////////
// Fehler-Handler mit freundlichen Hinweisen
/////////////////////////////
function explainAndThrow(where, table, error){
  // PostgREST Schema-Cache alt?
  if (error?.code === 'PGRST204' || /schema cache/i.test(error?.message||'')){
    console.error(`[DB.${where}] ${table}: ${error.message}`);
    console.warn('→ Tipp: In Supabase SQL ausführen:  NOTIFY pgrst, \'reload schema\';');
  } else if (error?.code === '42501') {
    console.error(`[DB.${where}] Permission denied (RLS/Policies) auf ${table}:`, error);
    console.warn('→ Prüfe RLS-Policies. Für Schreiben: get_my_role() in (\'admin\', \'coach\').');
  } else {
    console.error(`[DB.${where}] ${table}:`, error);
  }
  throw error;
}

/////////////////////////////
// Core-CRUD
/////////////////////////////
async function selectAll(table, options={}){
  const sb = ensureSB();
  const sel = options.select || '*';
  let q = sb.from(table).select(sel);

  // optionale Filter (eq: {col:val}, order: {col, asc})
  if (options.eq){
    for (const [col, val] of Object.entries(options.eq)) q = q.eq(col, val);
  }
  if (options.order?.col){
    q = q.order(options.order.col, { ascending: options.order.asc !== false });
  }
  if (Number.isFinite(options.limit)) q = q.limit(options.limit);

  const { data, error } = await q;
  if (error) return explainAndThrow('selectAll', table, error);
  return (data||[]).map(r => fromDbRecord(table, r));
}

async function selectOne(table, key){
  const sb = ensureSB();
  if (table === 'meta'){
    const { data, error } = await sb.from('meta').select('*').eq('key', key).maybeSingle();
    if (error) return explainAndThrow('selectOne', table, error);
    return data ? fromDbRecord('meta', data) : null;
  }
  const { data, error } = await sb.from(table).select('*').eq('id', key).maybeSingle();
  if (error) return explainAndThrow('selectOne', table, error);
  return data ? fromDbRecord(table, data) : null;
}

async function upsert(table, obj){
  const sb = ensureSB();
  const payload = toDbRecord(table, obj);
  const keyCol = table === 'meta' ? 'key' : 'id';
  if (!payload[keyCol] && table !== 'meta') payload[keyCol] = uuid();

  let q = sb.from(table).upsert(payload).select().maybeSingle();
  const { data, error } = await q;
  if (error) return explainAndThrow('upsert', table, error);
  return data ? fromDbRecord(table, data) : fromDbRecord(table, payload);
}

async function upsertMany(table, array){
  if (!Array.isArray(array) || !array.length) return [];
  const sb = ensureSB();
  const rows = array.map(obj => {
    const p = toDbRecord(table, obj);
    const keyCol = table === 'meta' ? 'key' : 'id';
    if (!p[keyCol] && table !== 'meta') p[keyCol] = uuid();
    return p;
  });
  const { data, error } = await sb.from(table).upsert(rows).select();
  if (error) return explainAndThrow('upsertMany', table, error);
  return (data||[]).map(r => fromDbRecord(table, r));
}

async function remove(table, key){
  const sb = ensureSB();
  const col = table === 'meta' ? 'key' : 'id';
  const { error } = await sb.from(table).delete().eq(col, key);
  if (error) return explainAndThrow('delete', table, error);
  return true;
}

/////////////////////////////
// Öffentliche API
/////////////////////////////
export const DB = {
  // Basis-CRUD
  async getAll(table, options={}){ return await selectAll(table, options); },
  async get(table, key){ return await selectOne(table, key); },
  async put(table, obj){ return await upsert(table, obj); },
  async putMany(table, arr){ return await upsertMany(table, arr); },
  async delete(table, key){ return await remove(table, key); },

  // Flexible Query (kleiner Helfer, optional)
  async query(table, builderFn){
    const sb = ensureSB();
    let q = sb.from(table).select('*');
    if (typeof builderFn === 'function') q = builderFn(q) || q;
    const { data, error } = await q;
    if (error) return explainAndThrow('query', table, error);
    return (data||[]).map(r => fromDbRecord(table, r));
  }
};
