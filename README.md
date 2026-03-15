# vatican

vatican developer d. daniele

## Area amministrativa mapping PDF

### Origine delle edizioni

Le edizioni vengono lette da SQLite tramite API backend (`server.js`).

- Database: `data/vatican.sqlite`
- API client browser: `or-api-store.js`
- Al primo avvio il server inserisce un set di edizioni default (`DEFAULT_EDITIONS`).
- Mappature e titoli RSS sono separati per `editionId`.

### Avvio locale con SQLite

1. Installa dipendenze:

```bash
npm install
```

2. Avvia il server:

```bash
npm start
```

3. Apri:

- `http://127.0.0.1:5500/admin-mapper.html`
- `http://127.0.0.1:5500/or-abbonati-sfogliatore.html`

E' stata aggiunta una pagina amministrativa per mappare i titoli articolo su rettangoli del PDF:

- Pagina: `admin-mapper.html`
- PDF di default: `assets/osservatore-edizione.pdf`
- Persistenza locale: `localStorage` (chiave `orPdfTitleMappings`)

### Flusso rapido

1. Apri `admin-mapper.html`.
2. Carica il PDF (campo percorso + pulsante `Apri`).
3. Vai alla pagina desiderata e disegna il rettangolo sul titolo nel PDF.
4. Inserisci `Titolo articolo` e, se serve, `URL articolo`.
5. Premi `Salva mappatura`.
6. Esporta in JSON con `Esporta JSON` oppure copia con `Copia JSON`.

### Struttura dati esportata

```json
{
	"version": 1,
	"exportedAt": "2026-03-14T10:30:00.000Z",
	"pdfPath": "assets/osservatore-edizione.pdf",
	"mappings": [
		{
			"id": "article-uuid",
			"title": "Titolo articolo",
			"titleNormalized": "titolo articolo",
			"url": "article-magistero.html",
			"pdfPath": "assets/osservatore-edizione.pdf",
			"regions": [
				{ "id": "region-1", "page": 1, "rect": { "x": 0.12, "y": 0.34, "w": 0.42, "h": 0.08 } },
				{ "id": "region-2", "page": 1, "rect": { "x": 0.12, "y": 0.43, "w": 0.42, "h": 0.07 } },
				{ "id": "region-3", "page": 2, "rect": { "x": 0.18, "y": 0.25, "w": 0.36, "h": 0.08 } }
			],
			"createdAt": "2026-03-14T10:00:00.000Z",
			"updatedAt": "2026-03-14T10:05:00.000Z"
		}
	]
}
```

Nota: ogni articolo puo avere piu aree (`regions`) per coprire titoli spezzati, rettangoli imperfetti o richiami su pagine diverse.
