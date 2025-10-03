// scripts/db.remote.js
// Einfacher Laufzeit-Adapter: nutzt Supabase statt IndexedDB.
// Erwartet: window.sb (Client), den auth.js beim Login setzt.

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

async function mustSb(){
  const sb = window.sb || (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY
    ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null);
  if (!sb) throw new Error('[DB] Supabase client not available');
  return sb;
}

export const DB = {
  name: 'supabase',
  version: 1,
  async open(){ return true; },

  async getAll(store){
    const sb = await mustSb();
    const tbl = tableFor(store);
    const { data, error } = await sb.from(tbl).select('*').order('created_at', { ascending: true }).returns('minimal');
    if (error) throw error;
    return data || [];
  },

  async get(store, key){
    const sb = await mustSb();
    const tbl = tableFor(store);
    if (store === 'meta'){
      const { data, error } = await sb.from('meta').select('key,value').eq('key', key).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data ? { key: data.key, value: data.value } : null;
    } else {
      const { data, error } = await sb.from(tbl).select('*').eq('id', key).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    }
  },

  async put(store, obj){
    const sb = await mustSb();
    const tbl = tableFor(store);
    if (store === 'meta'){
      const row = { key: obj.key, value: obj.value ?? {} };
      const { data, error } = await sb.from('meta').upsert(row, { onConflict: 'key' }).select().maybeSingle();
      if (error) throw error;
      return data;
    } else {
      if (!obj.id) obj.id = uuid();
      const { data, error } = await sb.from(tbl).upsert(obj, { onConflict: 'id' }).select().maybeSingle();
      if (error) throw error;
      return data;
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
