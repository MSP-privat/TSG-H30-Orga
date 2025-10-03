(function() {
  const SB_PROJECT_URL = window.SUPABASE_URL || (window.ENV && window.ENV.SUPABASE_URL) || '';
  const SB_ANON_KEY = window.SUPABASE_ANON_KEY || (window.ENV && window.ENV.SUPABASE_ANON_KEY) || '';
  if (!window.supabase) { console.error("[Auth] Supabase SDK not loaded"); window.sb=null; return; }
  if (!SB_PROJECT_URL || !SB_ANON_KEY) { console.error('[Auth] Missing Supabase credentials. Configure env.js'); window.sb=null; return; }
  window.sb = window.supabase.createClient(SB_PROJECT_URL, SB_ANON_KEY);

  async function sbGetSession() {
    try { const { data: { session }, error } = await window.sb.auth.getSession(); if (error) console.warn('[Auth] getSession error', error); return session || null; }
    catch (e) { console.error('[Auth] getSession exception', e); return null; }
  }

  async function sbSignIn(email, password) { const { data, error } = await window.sb.auth.signInWithPassword({ email, password }); if (error) throw error; return data.user; }
  async function sbSignUp(email, password) { const { data, error } = await window.sb.auth.signUp({ email, password }); if (error) throw error; return data.user; }
  async function sbSignOut() { try { await window.sb.auth.signOut(); } catch {} return true; }

  function normalizeRole(role) { if(!role) return 'guest'; const r=String(role).trim().toLowerCase(); if(r==='spieler') return 'player'; if(r==='gast') return 'guest'; if(['player','coach','admin','guest'].includes(r)) return r; return 'player'; }

  async function getRoleViaRPC() {
    try { const { data, error } = await window.sb.rpc('get_my_role'); if (error) throw error;
      const val = (typeof data === 'string') ? data : (Array.isArray(data) ? data[0] : (data && (data.role || data.role_type || data.value)));
      if (val) { window.__ROLE_SOURCE__ = 'rpc:get_my_role'; return normalizeRole(val); }
      return null; }
    catch(e) { window.__ROLE_SOURCE__ = 'rpc:error:' + (e && (e.code || e.message) || 'unknown'); return null; }
  }

  async function getRoleViaProfiles(uid, fallbackEmail) {
    try { const { data, error } = await window.sb.from('profiles').select('id,role_type').eq('id', uid).maybeSingle(); if (error) throw error;
      const roleValue = data && data.role_type; window.__ROLE_SOURCE__ = 'profiles';
      return { id: uid, email: fallbackEmail, role: normalizeRole(roleValue || 'player') }; }
    catch(e) { window.__ROLE_SOURCE__ = 'fallback:' + (e && (e.code || e.message) || 'unknown'); return { id: uid, email: fallbackEmail, role: 'player' }; }
  }

  async function sbGetProfile() {
    const session = await sbGetSession(); if (!session || !session.user) return null;
    const uid = session.user.id; const email = session.user.email;
    const rpcRole = await getRoleViaRPC(); if (rpcRole) return { id: uid, email, role: rpcRole };
    return await getRoleViaProfiles(uid, email);
  }

  window.sbAuth = { sbGetSession, sbSignIn, sbSignUp, sbSignOut, sbGetProfile };
})();