# Foglio di Preghiera

App statica in HTML, CSS e JavaScript per aggiornare mese dopo mese il calendario dei soggetti di preghiera con accesso protetto da Supabase.

## Come si usa

Apri `index.html` nel browser ed effettua l'accesso con un utente Supabase.

- Scegli mese e anno dalla barra in alto.
- Compila la colonna `Lettura` e la colonna `Soggetto di preghiera`.
- Seleziona una parte del testo in una cella e usa `B` per metterla in grassetto.
- Il salvataggio e' automatico per ogni mese su Supabase.
- `Importa mese precedente` copia i soggetti dal mese prima nello stesso ordine, mantenendo il grassetto e saltando sempre le domeniche.
- `PDF` scarica un file A4 orizzontale di 2 pagine esatte, senza footer dell'app.
- `Immagine` scarica un PNG ad alta risoluzione con tutto il mese in un'unica colonna.

Il browser mantiene una copia locale di emergenza, ma la sorgente condivisa dei mesi e' Supabase.

## Supabase

L'app salva il contenuto completo dei fogli mensili in Supabase. Il sito resta compatibile con GitHub Pages: i file sono statici, mentre Supabase salva i dati e protegge l'accesso.

### Configurazione

1. Crea un progetto gratuito su Supabase.
2. Apri `SQL Editor` e incolla il contenuto di `supabase-schema.sql`.
3. In `Authentication > Users`, crea l'utente con email e password.
4. In `Project Settings > API`, copia `Project URL` e `anon public key`.
5. Inserisci quei valori in `supabase-config.js`:

```js
window.FOGLIO_PREGHIERA_SUPABASE = {
  url: "https://tuo-progetto.supabase.co",
  anonKey: "la-tua-anon-key",
};
```

### Pagina

- `index.html`: richiede accesso, salva i fogli mensili e permette di importare i soggetti dal mese precedente saltando le domeniche.

La chiave `anon` puo' stare nel JavaScript pubblico: la sicurezza e' nelle policy RLS definite in `supabase-schema.sql`.
