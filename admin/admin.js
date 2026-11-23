(() => {
  'use strict';
  const OWNER_ID = 'dbe3d8e8-3e14-4010-b227-a8dad5e7c1a3';
  const config = window.FOGLIO_PREGHIERA_SUPABASE;
  const $ = selector => document.querySelector(selector);
  const client = window.supabase?.createClient(config.url, config.anonKey);
  const project = new URL(config.url).hostname.split('.')[0];
  const consoleBase = `https://supabase.com/dashboard/project/${project}/`;
  const appBase = new URL('../', location.href).href;
  const version = document.currentScript.dataset.version;
  let snapshot = null, epoch = 0, sessionUser = null, busy = false, pendingChange = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => value ? new Intl.DateTimeFormat('it-IT',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'}).format(new Date(value)) : 'Nessuna attività';
  const bytes = value => {
    const n = Number(value) || 0;
    if (n < 1024) return `${n} B`;
    const exponent = Math.min(Math.floor(Math.log(n)/Math.log(1024)), 3);
    return `${new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(n / 1024 ** exponent)} ${['B','KB','MB','GB'][exponent]}`;
  };
  const row = (title, detail, value) => `<div class="data-row"><div><strong>${escape(title)}</strong><small>${escape(detail)}</small></div><span class="badge">${escape(value)}</span></div>`;
  function notice(message) { $('#notice').textContent = message; $('#notice').hidden = !message; }
  function clearPrivateContent() {
    snapshot = null; pendingChange = null;
    if ($('#confirmMembership').open) $('#confirmMembership').close();
    $('#dashboard').hidden = true;
    for (const id of ['stats','services','groups','space','storage','tableRows','userRows','auditRows','apiDetails','appLinks','operatorLinks','publicKey']) $('#' + id).replaceChildren();
    $('#userSearch').value = '';
    $('#confirmTitle').textContent = ''; $('#confirmDescription').textContent = '';
  }
  function gate(message, login = false, retry = false) {
    clearPrivateContent(); $('#gate').hidden = false;
    $('#gateMessage').textContent = message;
    $('#adminLogin').hidden = !login;
    $('#retryGate').hidden = !retry;
    $('#switchAccount').hidden = !sessionUser;
  }
  async function api(body) {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw Object.assign(new Error('Accedi con il tuo account.'), { status:401 });
    const response = await fetch(`${config.url}/functions/v1/maintenance-admin`, {
      method:'POST', headers:{'Content-Type':'application/json',apikey:config.anonKey,Authorization:`Bearer ${data.session.access_token}`},
      body:JSON.stringify(body), cache:'no-store', signal:AbortSignal.timeout(25000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.error || `Servizio non disponibile (HTTP ${response.status}).`), {status:response.status});
    return result;
  }
  function renderUsers() {
    if (!snapshot) return;
    const query = $('#userSearch').value.trim().toLowerCase();
    const users = snapshot.users.filter(user => user.email.toLowerCase().includes(query));
    $('#userCount').textContent = `${users.length} account${snapshot.usersTruncated ? ' · elenco parziale' : ''}`;
    $('#userRows').innerHTML = users.length ? users.map(user => {
      const owner = user.id === OWNER_ID;
      const toggle = lang => {
        const enabled = snapshot.memberships.some(m => m.user_id === user.id && m.language === lang);
        return `<button class="toggle" type="button" data-user="${escape(user.id)}" data-language="${lang}" data-enabled="${!enabled}" aria-pressed="${enabled}" aria-label="Accesso ${lang === 'it' ? 'italiano' : 'tedesco'} per ${escape(user.email)}" ${owner || busy ? 'disabled' : ''}>${enabled ? '✓ Attivo' : 'Non attivo'}</button>`;
      };
      return `<tr><td><strong>${escape(user.email)}</strong><small>${owner ? 'Tu · amministratore' : user.confirmed ? 'Email confermata' : 'Email da confermare'}</small></td><td data-label="Ultimo accesso">${escape(date(user.lastSignIn))}</td><td data-label="Italiano">${toggle('it')}</td><td data-label="Tedesco">${toggle('de')}</td></tr>`;
    }).join('') : '<tr><td colspan="4" class="empty">Nessun account corrisponde alla ricerca.</td></tr>';
  }
  function render(data) {
    snapshot = data;
    $('#checkedAt').textContent = `Ultimo controllo: ${date(data.checkedAt)} · ora di Berlino`;
    $('#healthTitle').textContent = 'API, autenticazione e database raggiungibili';
    const monthCount = data.months.reduce((total, group) => total + group.count, 0);
    $('#stats').innerHTML = [
      ['Database',bytes(data.databaseBytes),'Spazio totale occupato'],
      ['Fogli salvati',monthCount,'Italiano e tedesco'],
      ['Account',`${data.users.length}${data.usersTruncated ? '+' : ''}`,'Utenti registrati'],
      ['Storage',bytes(data.storage.bytes),`${data.storage.objects} file nei bucket`]
    ].map(([label,value,caption]) => `<article class="stat"><div class="stat-label">${escape(label)}</div><div class="stat-value">${escape(value)}</div><div class="stat-caption">${escape(caption)}</div></article>`).join('');
    $('#services').innerHTML = row('API amministrazione','Richiesta autenticata completata','Operativa') + row('Supabase Auth','Identità del manutentore verificata','Verificato') + row('Database PostgreSQL',`Letture completate in ${data.queryMs} ms`,'Raggiungibile');
    $('#groups').innerHTML = data.months.map(group => `<div class="data-row"><div><strong><span class="group-flag group-${escape(group.language)}" aria-hidden="true"></span>${group.language === 'it' ? 'Gruppo italiano' : 'Deutsche Gruppe'}</strong><small>Ultima modifica: ${escape(date(group.lastUpdated))}</small></div><span class="badge">${escape(group.count)} mesi</span></div>`).join('');
    const max = Math.max(...data.tables.map(table => Number(table.bytes)), 1);
    $('#space').innerHTML = data.tables.map(table => `<div class="bar-label"><span>${escape(table.name)}</span><strong>${bytes(table.bytes)}</strong></div><div class="bar" aria-hidden="true"><span style="width:${Math.max(2,Number(table.bytes)/max*100)}%"></span></div>`).join('');
    $('#storage').innerHTML = row('File nei bucket','Solo Supabase Storage',`${data.storage.objects} file · ${bytes(data.storage.bytes)}`) + row('Bucket configurati','Contenitori per i file',data.buckets.length) + (data.buckets.length ? data.buckets.map(bucket => row(bucket.name,'Visibilità',bucket.public ? 'Pubblico' : 'Privato')).join('') : '<p class="footnote">Nessun bucket configurato. Loghi e file dell’app sono nel repository GitHub.</p>');
    $('#dbVersion').textContent = `PostgreSQL ${data.postgresVersion}`;
    $('#tableRows').innerHTML = data.tables.map(table => `<tr><td><code>${escape(table.name)}</code></td><td>${bytes(table.bytes)}</td><td>${table.rls ? '✓ RLS attivo' : '⚠ RLS disattivato'}</td><td>${escape(table.policies)}</td></tr>`).join('');
    $('#apiDetails').innerHTML = [['Progetto',project],['Base API',config.url],['REST / Database',config.url + '/rest/v1/'],['Autenticazione',config.url + '/auth/v1/'],['API amministrazione',config.url + '/functions/v1/maintenance-admin']].map(([label,value]) => `<span class="endpoint-label">${label}</span><code class="endpoint">${escape(value)}</code>`).join('');
    $('#publicKey').textContent = config.anonKey;
    $('#appLinks').innerHTML = [['it/','Gruppo italiano'],['de/','Gruppo tedesco'],['admin/','Amministrazione']].map(([path,label]) => `<div class="app-link"><div><a href="${escape(appBase + path)}">${label} ↗</a><small>${escape(appBase + path)}</small></div><button type="button" data-copy="${escape(appBase + path)}" aria-label="Copia link ${label}">Copia</button></div>`).join('');
    const links = [
      ['Editor database','Tabelle e contenuti',consoleBase+'editor'],['Utenti e autenticazione','Account e sessioni',consoleBase+'auth/users'],['Log del backend','Diagnostica delle richieste',consoleBase+'logs/explorer'],
      ['Sicurezza','Advisors e configurazione',consoleBase+'advisors/security'],['Repository GitHub','Codice sorgente e versioni','https://github.com/RomoloEdmondo/App-Foglio-Preghiera'],['Pubblicazioni e controlli','Deploy e controllo giornaliero DB','https://github.com/RomoloEdmondo/App-Foglio-Preghiera/actions'],
      ['Stato Supabase','Incidenti della piattaforma','https://status.supabase.com/'],['Stato GitHub','Disponibilità del servizio Pages','https://www.githubstatus.com/'],['Backup database','Disponibilità e ripristino',consoleBase+'database/backups']
    ];
    $('#operatorLinks').innerHTML = links.map(([title,description,url]) => `<a class="link-tile" href="${url}" target="_blank" rel="noopener noreferrer"><strong>${title} ↗</strong><small>${description}</small></a>`).join('');
    $('#auditRows').innerHTML = data.audit.length ? data.audit.map(entry => {
      const email = data.users.find(user => user.id === entry.target_id)?.email || entry.target_id;
      return `<div class="audit-entry"><strong>${entry.enabled ? 'Accesso abilitato' : 'Accesso revocato'} · ${entry.language === 'it' ? 'Italiano' : 'Tedesco'}</strong><div>${escape(email)}</div><small>${escape(date(entry.created_at))} · Romolo</small></div>`;
    }).join('') : '<div class="empty">Nessuna modifica registrata.<br>Le operazioni effettuate qui compariranno in questo registro.</div>';
    renderUsers();
    document.querySelectorAll('[data-console]').forEach(link => link.href = consoleBase + link.dataset.console);
    $('#gate').hidden = true; $('#dashboard').hidden = false;
  }
  async function refresh() {
    const revision = ++epoch;
    busy = true; $('#refresh').disabled = true; $('#refresh').textContent = 'Verifica in corso…';
    renderUsers(); notice('');
    try {
      const data = await api({action:'overview'});
      if (revision !== epoch) return;
      busy = false; render(data);
    } catch (error) {
      if (revision !== epoch) return;
      const unauthorized = error.status === 401 || error.status === 403;
      gate(error.message || 'Connessione non riuscita. Riprova.', error.status === 401, !unauthorized);
    } finally {
      if (revision === epoch) { busy = false; $('#refresh').disabled = false; $('#refresh').textContent = '↻ Aggiorna stato'; }
    }
  }
  async function syncSession(session) {
    const id = session?.user?.id || null;
    if (id === sessionUser && snapshot) return;
    sessionUser = id; ++epoch;
    if (!session) { gate('Accedi con il tuo account amministratore.',true); return; }
    gate('Verifica dei permessi sul server…');
    await refresh();
  }
  async function signOut() {
    ++epoch; gate('Chiusura della sessione…');
    const { error } = await client.auth.signOut();
    if (error) { gate('Uscita non riuscita. Riprova.',false,true); return; }
    sessionUser = null; gate('Sessione chiusa.',true);
  }
  async function copy(value) {
    try { await navigator.clipboard.writeText(value); notice('Copiato negli appunti.'); }
    catch { notice('Copia non disponibile: seleziona e copia manualmente il testo.'); }
  }
  $('#refresh').addEventListener('click',refresh);
  $('#retryGate').addEventListener('click',refresh);
  $('#adminLogout').addEventListener('click',signOut);
  $('#switchAccount').addEventListener('click',signOut);
  $('#userSearch').addEventListener('input',renderUsers);
  $('#copyKey').addEventListener('click',() => copy(config.anonKey));
  $('#appLinks').addEventListener('click',event => { const button=event.target.closest('[data-copy]'); if(button) copy(button.dataset.copy); });
  $('#userRows').addEventListener('click',event => {
    const button = event.target.closest('[data-user]');
    if (!button || busy || !snapshot) return;
    const user = snapshot.users.find(user => user.id === button.dataset.user);
    if (!user || user.id === OWNER_ID) return;
    pendingChange = {action:'membership',userId:user.id,language:button.dataset.language,enabled:button.dataset.enabled === 'true'};
    $('#confirmTitle').textContent = pendingChange.enabled ? 'Abilitare questo gruppo?' : 'Revocare questo accesso?';
    $('#confirmDescription').textContent = `${user.email} ${pendingChange.enabled ? 'potrà accedere al' : 'non potrà più accedere al'} gruppo ${pendingChange.language === 'it' ? 'italiano' : 'tedesco'}. I fogli esistenti rimangono invariati.`;
    $('#confirmMembership').showModal();
  });
  $('#confirmMembership').addEventListener('close',async () => {
    const change = pendingChange; pendingChange = null;
    if ($('#confirmMembership').returnValue !== 'confirm' || !change || busy) return;
    const revision = epoch;
    busy = true; renderUsers(); $('#refresh').disabled = true;
    try {
      await api(change);
      if (revision !== epoch) return;
      await refresh();
      if (snapshot) notice('Accesso aggiornato e modifica registrata.');
    } catch (error) {
      if (revision !== epoch) return;
      if (error.status === 401 || error.status === 403) gate(error.message,error.status===401);
      else notice('Non è stato possibile confermare la modifica. Aggiorna lo stato prima di riprovare.');
    } finally { if (revision === epoch) { busy = false; $('#refresh').disabled = false; renderUsers(); } }
  });
  $('#downloadReport').addEventListener('click',() => {
    if (!snapshot) return;
    const {users,memberships,audit,...diagnostics} = snapshot;
    const blob = new Blob([JSON.stringify({app:'Foglio di preghiera',version,project,...diagnostics},null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href=url; a.download=`manutenzione-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    notice('Report scaricato. Include le metriche, senza chiavi o indirizzi email. Non è un backup dei fogli.');
  });
  $('#adminLogin').addEventListener('submit',async event => {
    event.preventDefault(); const form=event.currentTarget; const button=form.querySelector('button'); button.disabled=true;
    $('#gateMessage').textContent='Accesso in corso…';
    try {
      const {data,error} = await client.auth.signInWithPassword({email:form.elements.email.value.trim(),password:form.elements.password.value});
      if(error) { $('#gateMessage').textContent='Accesso non riuscito. Controlla email e password.'; return; }
      form.elements.password.value=''; await syncSession(data.session);
    } catch { $('#gateMessage').textContent='Connessione non riuscita. Riprova.'; }
    finally { button.disabled=false; }
  });
  const observer=new IntersectionObserver(entries=>{ for(const entry of entries) if(entry.isIntersecting) document.querySelectorAll('nav a').forEach(link=>link.classList.toggle('active',link.hash==='#'+entry.target.id)); },{rootMargin:'-10% 0px -65% 0px'});
  document.querySelectorAll('main>.section').forEach(section=>observer.observe(section));
  window.addEventListener('offline',()=>notice('Connessione assente. I valori mostrati risalgono all’ultimo controllo.'));
  if (!client) { gate('Impossibile caricare il servizio di accesso. Ricarica la pagina.'); return; }
  client.auth.onAuthStateChange((_event,session)=>setTimeout(()=>syncSession(session),0));
  client.auth.getSession().then(({data,error})=>error ? gate('Sessione non disponibile. Accedi nuovamente.',true) : syncSession(data.session)).catch(()=>gate('Connessione non disponibile. Riprova.',false,true));
})();
