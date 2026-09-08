# Foglio di preghiera / Gebetsplan

Un’unica app statica HTML, CSS e JavaScript con due ingressi e contenuti indipendenti:

- [Scelta del gruppo](https://romoloedmondo.github.io/App-Foglio-Preghiera/)
- [Italiano](https://romoloedmondo.github.io/App-Foglio-Preghiera/it/) → `prayer_months`
- [Deutsch](https://romoloedmondo.github.io/App-Foglio-Preghiera/de/) → `prayer_months_de`

Entrambe usano il progetto Supabase configurato in `supabase-config.js`. Le chiavi pubbliche di connessione non sono password degli utenti. Le policy RLS verificano l’appartenenza al gruppo su ogni operazione. Il gruppo tedesco inizia senza contenuti italiani copiati o tradotti.

## Funzioni

Accesso con email e password, calendario mensile, salvataggio automatico, testo in grassetto, importazione dei soggetti dal mese precedente saltando le domeniche, PDF A4 orizzontale di due pagine e immagine PNG dell’intero mese. Interfaccia, calendario, messaggi ed esportazioni seguono la lingua dell’ingresso scelto. Il logo della chiesa è condiviso.

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

## Verifiche

Con Node.js 20 o successivo: `npm ci`, `npx playwright install chromium`, `npm test`. Per usare Chrome già installato impostare `TEST_BROWSER_CHANNEL=chrome` prima di eseguire i test.

I test browser intercettano tutte le richieste al backend e non scrivono nel database reale. Verificano i due ingressi, login/logout, traduzioni, salvataggi indipendenti, recupero delle modifiche non sincronizzate, importazione, domeniche, esportazioni e accesso negato. Le anteprime e i PDF di prova sono in `test-results/`, esclusa da Git.

`tests/group-permissions.sql` verifica i permessi nel database con record temporanei e rollback finale. Richiede due account bilingui e uno solo italiano e riserva dicembre 2199 per le prove; eseguirlo come amministratore. Controlla lettura, scrittura, aggiornamento, cancellazione e impossibilità di assegnarsi da soli un gruppo.
