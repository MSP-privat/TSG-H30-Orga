// scripts/db.remote.js
// Supabase-Adapter mit sauberem Mapping zwischen camelCase (UI) und snake_case (DB)

export function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
    const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8);
    return v.toString(16);
  });
}

function tableFor(store){
  const map = {
    seasons:'seasons',
    players:'players',
    teams:'teams',
    games:'games',
    assignments:'assignments',
    penalties:'penalties',
    meta:'meta',
  };
  const t = map[store];
  if(!t) throw new Error(`Unknown store: ${store}`);
  return t;
}

// ---- Mapper: UI -> DB (camelCase -> snake_case)
function toDb(store, o){
  if(!o) return o;
  switch(store){
    case 'seasons':
      return {
        id: o.id ?? undefined,
        name: o.name,
        year: o.year,
        active: o.active ?? true,
        created_at: o.created_at ?? undefined
      };
    case 'teams':
      return {
        id: o.id ?? undefined,
        season_id: o.season_id ?? o.seasonId,
        name: o.name,
        lockable: o.lockable ?? true,
        enforce_lock: o.enforce_lock ?? o.enforceLock ?? true,
        lock_color: o.lock_color ?? o.lockColor ?? null,
        created_at: o.created_at ?? undefined
      };
    case 'players':
      return {
        id: o.id ?? undefined,
        season_id: o.season_id ?? o.seasonId,
        first_name: o.first_name ?? o.firstName ?? null,
        last_name: o.last_name ?? o.lastName ?? null,
        lk: o.lk ?? null,
        color: o.color ?? null,
        created_at: o.created_at ?? undefined,
        updated_at: o.updated_at ?? undefined
      };
    case 'games':
      return {
        id: o.id ?? undefined,
        season_id: o.season_id ?? o.seasonId,
        team_id: o.team_id ?? o.teamId,
        date: o.date,          // UI nutzt String (YYYY-MM-DD) -> passt
        time: o.time,          // String ok
        location: o.location ?? null,
        created_at: o.created_at ?? undefined
      };
    case 'assignments':
      return {
        id: o.id ?? undefined,
        season_id: o.season_id ?? o.seasonId,
        team_id: o.team_id ?? o.teamId,
        game_id: o.game_id ?? o.gameId,
        player_id: o.player_id ?? o.playerId,
        date: o.date,
        status: o.status,      // 'Eingeplant' | 'Ersatz' | 'Gespielt' | 'Gesperrt'
        finalized: o.finalized ?? false,
        created_at: o.created_at ?? undefined,
        updated_at: o.updated_at ?? undefined
      };
    case 'penalties':
      return {
        id: o.id ?? undefined,
        season_id: o.season_id ?? o.seasonId,
        text: o.text,
        amount: o.amount ?? 0,
        created_at: o.created_at ?? undefined
      };
    case 'meta':
      return { key: o.key, value: o.value ?? {} };
    default:
      return o;
  }
}

// ---- Mapper: DB -> UI (snake_case -> camelCase)
function fromDb(store, r){
  if(!r) return r;
  switch(store){
    case 'seasons':
      return {
        id: r.id, name: r.name, year: r.year, active: r.active,
        created_at: r.created_at
      };
    case 'teams':
      return {
        id: r.id, seasonId: r.season_id, name: r.name,
        lockable: r.lockable,
        enforceLock: r.enforce_lock,
        lockColor: r.lock_color,
        created_at: r.created_at
      };
    case 'players':
      return {
        id: r.id, seasonId: r.season_id,
        firstName: r.first_name, lastName: r.last_name,
        lk: r.lk, color: r.color,
        created_at: r.created_at, updated_at: r.updated_at
      };
    case 'games':
      return {
        id: r.id, seasonId: r.season_id, teamId: r.team_id,
        date: r.date, time: r.time, location: r.location,
        created_at: r.created_at
      };
    case 'assignments':
      return {
        id: r.id, seasonId: r.season_id, teamId: r.team_id,
        gameId: r.game_id, playerId: r.player_id,
        date: r.date, status: r.status, finalized: r.finalized,
        created_at: r.created_at, updated_at: r.updated_at
      };
    case 'penalties':
      return {
        id: r.id, seasonId: r.season_id, text: r.text,
        amount: r.amount, created_at: r.created_at
      };
    case 'meta':
      return { key: r.key, value: r.value };
    default:
      return r;
  }
}

async function mustSb(){
  const sb = window.sb || (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY
    ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null);
  if (!sb) throw new Error('[DB] Supabase client not available (not logged in?)');
  return sb;
}

export const DB = {
  name: 'supabase',
  version: 1,
  async open(){ return true; },

  async getAll(store){
    const sb = await mustSb();
    const tbl = tableFor(store);
    const { data, error } = await sb.from(tbl).select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(r => fromDb(store, r));
  },

  async get(store, key){
    const sb = await mustSb();
    const tbl = tableFor(store);
    if (store === 'meta'){
      const { data, error } = await sb.from('meta').select('key,value').eq('key', key).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data ? fromDb('meta', data) : null;
    } else {
      const { data, error } = await sb.from(tbl).select('*').eq('id', key).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data ? fromDb(store, data) : null;
    }
  },

  async put(store, obj){
    const sb = await mustSb();
    const tbl = tableFor(store);
    const row = toDb(store, { ...obj });
    if (store !== 'meta' && !row.id) row.id = uuid();

    if (store === 'meta'){
      const { data, error } = await sb.from('meta').upsert(row, { onConflict: 'key' }).select().maybeSingle();
      if (error) throw error;
      return fromDb('meta', data);
    } else {
      const { data, error } = await sb.from(tbl).upsert(row, { onConflict: 'id' }).select().maybeSingle();
      if (error) throw error;
      return fromDb(store, data);
    }
  },

  async delete(store, id){
    const sb = await mustSb();
    const tbl = tableFor(store);
    const col = store === 'meta' ? 'key' : 'id';
    const { error } = await sb.from(tbl).delete().eq(col, id);
    if (error) throw error;
    return true;
  }
};
