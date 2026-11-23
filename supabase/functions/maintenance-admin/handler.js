export const OWNER_ID = 'dbe3d8e8-3e14-4010-b227-a8dad5e7c1a3';
const OWNER_EMAIL = 'romolo.91@live.it';
export function createHandler(client) {
  return async request => {
    const origin = request.headers.get('Origin') || '';
    const allowed = origin === 'https://romoloedmondo.github.io' || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      ...(allowed ? { 'Access-Control-Allow-Origin': origin } : {}),
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowed) return reply(403, { error: 'Origine non autorizzata.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { error: 'Metodo non consentito.' });
    const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return reply(401, { error: 'Accedi con il tuo account.' });
    try {
      const { data: auth, error: authError } = await client.auth.getUser(token);
      if (authError || !auth?.user) return reply(401, { error: 'Sessione scaduta. Accedi di nuovo.' });
      if (auth.user.id !== OWNER_ID || auth.user.email?.toLowerCase() !== OWNER_EMAIL || !auth.user.email_confirmed_at)
        return reply(403, { error: 'Area riservata al manutentore.' });
      const raw = await request.text();
      if (raw.length > 4096) return reply(413, { error: 'Richiesta troppo grande.' });
      let body;
      try { body = JSON.parse(raw || '{}'); } catch { return reply(400, { error: 'Richiesta non valida.' }); }
      if (!body || typeof body !== 'object') return reply(400, { error: 'Richiesta non valida.' });
      if (['create_user','reset_password','delete_user'].includes(body.action)) {
        if (body.action !== 'delete_user' && (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128)) return reply(400,{error:'La password deve contenere da 12 a 128 caratteri.'});
        let target;
        if (body.action === 'create_user') {
          if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length>254) return reply(400,{error:'Email non valida.'});
          const result=await client.auth.admin.createUser({email:body.email.trim(),password:body.password,email_confirm:true});
          if(result.error) return reply(400,{error:'Creazione non riuscita: verifica email, account già presente e requisiti password.'});
          target=result.data.user;
        } else {
          if(body.userId===OWNER_ID || typeof body.userId!=='string') return reply(400,{error:'Il tuo account è protetto.'});
          const found=await client.auth.admin.getUserById(body.userId);
          if(found.error || !found.data?.user) return reply(400,{error:'Account non trovato.'});
          target=found.data.user;
          if(body.action==='delete_user' && body.confirmEmail!==target.email) return reply(400,{error:'Conferma l’indirizzo email da eliminare.'});
          const result=body.action==='delete_user' ? await client.auth.admin.deleteUser(target.id) : await client.auth.admin.updateUserById(target.id,{password:body.password});
          if(result.error) return reply(400,{error:'Operazione non riuscita. Verifica lo stato dell’account e riprova.'});
        }
        const logged=await client.from('app_activity').insert({actor_id:OWNER_ID,actor_email:OWNER_EMAIL,action:body.action,target_email:target.email});
        return reply(200,{saved:true,warning:logged.error?'Operazione completata, ma registrazione evento non riuscita.':''});
      }
      if (body.action === 'access') return reply(200, { authorized: true });
      if (body.action === 'membership') {
        if (typeof body.userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.userId) || !['it','de'].includes(body.language) || typeof body.enabled !== 'boolean')
          return reply(400, { error: 'Dati di accesso non validi.' });
        if (body.userId === OWNER_ID) return reply(400, { error: 'Il tuo accesso è protetto da modifiche accidentali.' });
        const { data: target, error: targetError } = await client.auth.admin.getUserById(body.userId);
        if (targetError || !target?.user) return reply(400, { error: 'Account non trovato.' });
        const { error } = await client.rpc('maintenance_set_membership', { p_actor: OWNER_ID, p_target: body.userId, p_language: body.language, p_enabled: body.enabled });
        if (error) throw error;
        return reply(200, { saved: true });
      }
      if (body.action === 'overview') {
        const start = performance.now();
        const [snapshot, memberships, audit, activity] = await Promise.all([
          client.rpc('maintenance_snapshot'),
          client.from('prayer_group_members').select('user_id,language').limit(10000),
          client.from('maintenance_audit').select('id,target_id,language,enabled,created_at').order('created_at',{ascending:false}).limit(50),
          client.from('app_activity').select('*').order('created_at',{ascending:false}).limit(200)
        ]);
        for (const result of [snapshot,memberships,audit,activity]) if (result.error) throw result.error;
        const users = []; let usersTruncated = false;
        for (let page=1;page<=25;page++) {
          const { data, error } = await client.auth.admin.listUsers({page,perPage:200});
          if (error) throw error;
          users.push(...data.users.map(u => ({id:u.id,email:u.email || 'Account senza email',createdAt:u.created_at,lastSignIn:u.last_sign_in_at,confirmed:Boolean(u.email_confirmed_at)})));
          if (data.users.length < 200) break;
          if (page===25) usersTruncated=true;
        }
        return reply(200, { ...snapshot.data, users, usersTruncated, memberships:memberships.data, audit:audit.data, activity:activity.data, queryMs:Math.round(performance.now()-start) });
      }
      return reply(400, { error: 'Operazione non supportata.' });
    } catch {
      return reply(503, { error: 'Servizio momentaneamente non disponibile. Riprova o consulta i log Supabase.' });
    }
  };
}
