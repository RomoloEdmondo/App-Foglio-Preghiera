# Foglio di preghiera / Gebetsplan

Un’unica app statica HTML, CSS e JavaScript con due ingressi e contenuti indipendenti:

- [Scelta del gruppo](https://romoloedmondo.github.io/App-Foglio-Preghiera/)
- [Italiano](https://romoloedmondo.github.io/App-Foglio-Preghiera/it/) → `prayer_months`
- [Deutsch](https://romoloedmondo.github.io/App-Foglio-Preghiera/de/) → `prayer_months_de`

Entrambe usano il progetto Supabase configurato in `supabase-config.js`. Le chiavi pubbliche di connessione non sono password degli utenti. Le policy RLS verificano l’appartenenza al gruppo su ogni operazione. Il gruppo tedesco inizia senza contenuti italiani copiati o tradotti.

## Funzioni

Accesso con email e password, calendario mensile, salvataggio automatico, testo in grassetto, importazione dei soggetti dal mese precedente saltando le domeniche, PDF A4 orizzontale di due pagine e immagine PNG dell’intero mese, più Word (.docx) con testo e tabella modificabili. Il tedesco mostra solo Tag e Gebetsanliegen, anche nelle esportazioni; l’italiano conserva la colonna Lettura. Interfaccia, calendario, messaggi ed esportazioni seguono la lingua dell’ingresso scelto. Il logo della chiesa è condiviso.

Il pulsante Immagine apre un’anteprima con **Condividi / Salva**, **Scarica PNG** e **Apri immagine**. La condivisione appare quando il browser supporta l’invio di file e viene avviata direttamente dal tocco dell’utente, dopo aver preparato il PNG. Su iPhone si può usare il menu di condivisione oppure tenere premuta l’immagine. L’anteprima resta disponibile se si annulla la condivisione. La dimensione del canvas è limitata a 12 megapixel per contenere l’uso di memoria sui dispositivi mobili.

Le copie locali sono separate per lingua e account. Le modifiche non sincronizzate restano sul dispositivo e possono essere salvate nuovamente dopo il ripristino della connessione. La vecchia copia locale dell’app italiana viene letta solo da account abilitati all’italiano. Aprire o visualizzare un mese non scrive dati: un errore di caricamento non crea né sovrascrive un foglio vuoto.

## Modificare e pubblicare

Il codice delle funzioni è in `app.js`, la grafica in `styles.css`, il modello HTML comune in `templates/app.html` e le traduzioni in `locales/it.json` e `locales/de.json`.

1. Modificare i file sorgenti.
2. Eseguire `npm run build` (Node.js 20 o successivo per l’ambiente completo).
3. Includere nel commit anche i file generati nelle cartelle `it/` e `de/`.
4. Pubblicare il commit sul ramo `master`.

GitHub Pages è configurato per pubblicare dalla radice del ramo `master`: serve entrambe le cartelle nella stessa pubblicazione. Non occorrono due repository o due build online. I file generati sono già inclusi nel repository; Pages non deve eseguire Node.js.

Per l’anteprima locale usare un server HTTP dalla radice, per esempio `python -m http.server 8000`, poi aprire `http://localhost:8000/`. Non aprire i file con `file://`.

## Database e account

`supabase-schema.sql` crea le due tabelle dei mesi e `prayer_group_members`, abilita RLS e imposta i permessi. Si esegue come amministratore nel SQL Editor di Supabase; preserva i fogli esistenti. Solo alla prima creazione della tabella dei gruppi assegna gli account già presenti all’italiano. Le esecuzioni successive non riassegnano permessi rimossi.

Per aggiungere una persona:

1. Creare il suo account in Supabase → Authentication → Users, se non esiste.
2. Nel SQL Editor assegnare il gruppo appropriato, sostituendo l’email di esempio:

```sql
insert into public.prayer_group_members (user_id, language)
select id, 'de' from auth.users
where lower(email) = lower('persona@example.com')
on conflict do nothing;
```

Usare `'it'` per l’italiano. Due righe per lo stesso account abilitano entrambe le versioni. La tabella dei gruppi è modificabile soltanto da un amministratore; gli utenti possono leggere solo le proprie appartenenze. Un account nuovo senza gruppi assegnati vede il messaggio di accesso non abilitato.

Per rimuovere un’abilitazione:

```sql
delete from public.prayer_group_members
where language = 'de'
  and user_id in (select id from auth.users where lower(email) = lower('persona@example.com'));
```

## Controllo giornaliero Supabase

Il workflow `.github/workflows/supabase-healthcheck.yml` esegue ogni giorno alle 07:23 UTC (08:23 in Italia in inverno, 09:23 in estate) tre richieste al database, anche senza visitatori sul sito. Si può avviare anche da GitHub → Actions → Supabase daily healthcheck → Run workflow. Gli errori fanno fallire il controllo e sono visibili in Actions; le notifiche dipendono dalle preferenze GitHub dell’account.

La funzione `app_healthcheck()`, installata con `supabase-healthcheck.sql`, restituisce soltanto `true`: non legge né modifica fogli, utenti o appartenenze ai gruppi. Il controllo usa la chiave pubblica già presente nel sito e non richiede password o chiavi amministrative. Per provarlo: `node scripts/check-supabase.mjs`.

Le richieste quotidiane riducono il rischio di sospensione per inattività, ma il piano gratuito non offre garanzie: [Supabase garantisce l’esclusione dalla sospensione per inattività sui piani a pagamento](https://supabase.com/docs/guides/platform/free-project-pausing). GitHub può ritardare le esecuzioni e disabilita i workflow pianificati nei repository pubblici dopo 60 giorni senza attività sul repository: in quel caso riabilitare il workflow in Actions. Il controllo non riattiva un progetto già sospeso; serve Resume dal pannello Supabase.

## Verifiche

Con Node.js 20 o successivo: `npm ci`, `npx playwright install chromium`, `npm test`. Per usare Chrome già installato impostare `TEST_BROWSER_CHANNEL=chrome` prima di eseguire i test.

I test browser intercettano tutte le richieste al backend e non scrivono nel database reale. Verificano i due ingressi, login/logout, traduzioni, salvataggi indipendenti, recupero delle modifiche non sincronizzate, importazione, domeniche, esportazioni e accesso negato. Le anteprime e i PDF di prova sono in `test-results/`, esclusa da Git.

`tests/group-permissions.sql` verifica i permessi nel database con record temporanei e rollback finale. Richiede due account bilingui e uno solo italiano e riserva dicembre 2199 per le prove; eseguirlo come amministratore. Controlla lettura, scrittura, aggiornamento, cancellazione e impossibilità di assegnarsi da soli un gruppo.

## Amministrazione

L’area `/admin/` è accessibile dal menu utente di Romolo in entrambe le lingue. Offre metriche live di database e Storage, inventario delle tabelle e RLS, ultimo aggiornamento dei gruppi, gestione delle abilitazioni IT/DE, registro delle ultime 50 modifiche, endpoint API e chiave pubblicabile, link ai servizi e report diagnostico JSON. Quote, fatturazione, backup, creazione account e log completi si gestiscono nelle console collegate; non vengono presentati valori stimati come dati reali. Il report non è un backup e non include email o chiavi.

L’interfaccia è in italiano e riprende colori, logo e tipografia dell’app. I dati amministrativi non sono inclusi nel sito statico: vengono richiesti alla Edge Function `maintenance-admin`. L’identità è verificata con `auth.getUser(token)` per ogni richiesta, controllando UUID, email e conferma email del titolare. Il link nel menu è solo una comodità, non il controllo di sicurezza. Non sono utilizzati `user_metadata` o controlli solo nel browser per autorizzare le operazioni.

Backend e riproducibilità:

- `supabase-admin.sql` contiene lo schema iniziale applicato tramite la migrazione remota `maintenance_admin_service_api`. Le due RPC sono `SECURITY INVOKER`, eseguibili esclusivamente da `service_role`. Il registro ha RLS attivo senza policy per i client, intenzionalmente: gli utenti ordinari non possono leggerlo o scriverlo.
- `supabase/functions/maintenance-admin/` contiene il codice distribuito. Usa le variabili server predefinite `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`; nessuna chiave riservata viene scritta nei file pubblici. `verify_jwt` è disattivato al gateway perché il corpo verifica esplicitamente la sessione con Auth; richieste anonime o con token non valido ricevono 401, account diversi ricevono 403.
- L’UUID del proprietario è fissato nel backend e nella RPC. Se l’account viene ricreato, occorre aggiornare questi riferimenti e quello del collegamento nel menu, verificando prima l’identità del nuovo account. Le abilitazioni del proprietario non sono modificabili dal pannello.
- Ogni modifica ai gruppi e la relativa voce di registro sono una singola transazione. Non vengono eliminate persone o preghiere. Le operazioni amministrative non consentono SQL arbitrario.
- `npm run build` genera anche `admin/index.html` con versione degli asset. `npm run test:admin` verifica autorizzazione server, UI, layout mobile, gestione gruppi, annullamento, errori, report e logout con backend simulato. `npm test` verifica le funzionalità del foglio.

Verifiche di rilascio: misurazioni reali con ruolo `service_role`; assenza di privilegi sulle RPC e sul registro per `anon`/`authenticated`; modifica e revoca di prova in una transazione annullata; rifiuto HTTP 401 dall’endpoint live senza una sessione valida. L’advisor segnala come informativo il registro senza policy (scelta intenzionale). È inoltre presente l’avviso preesistente di protezione password compromesse disattivata: gestione in Supabase Auth, [documentazione](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

### Registro operativo e gestione account

Le migrazioni `supabase-activity.sql` e `supabase-activity-private.sql` aggiungono il registro operativo. I salvataggi sono registrati da trigger nella stessa transazione del foglio, con identità Auth e data server. Le esportazioni sono segnalazioni autenticate del browser (non prova del download sul dispositivo); errori di rete possono impedire la registrazione. Non sono registrati contenuti delle preghiere o password. Il registro mostra gli ultimi 200 eventi operativi e le ultime 50 modifiche ai gruppi, conservando le email storiche anche dopo la cancellazione di un account. Non ricostruisce eventi precedenti all’installazione.

Il pannello può ora creare account con password iniziale (senza email automatica), impostare nuove password e cancellare account dopo conferma dell’email. I nuovi account non hanno gruppi: abilitarli esplicitamente nella tabella. Le password non sono mostrate né inserite nei log. Le operazioni Auth sono autorizzate esclusivamente dal backend al proprietario; il suo account è protetto. Gli eventi Auth sono registrati dopo l’operazione: se il registro fallisce, il pannello avverte che l’operazione è comunque completata. La rimozione dell’account rimuove anche le appartenenze ai gruppi tramite le chiavi esterne, preservando i fogli condivisi.
