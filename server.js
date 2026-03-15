const path = require('path');
const fs = require('fs');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = Number(process.env.PORT || 5500);
const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'vatican.sqlite');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

const DEFAULT_EDITIONS = [
  {
    id: '2026-03-13',
    name: 'Edizione 13 marzo 2026',
    pdfPath: 'assets/osservatore-edizione2.pdf'
  },
  {
    id: '2026-03-14',
    name: 'Edizione 14 marzo 2026',
    pdfPath: 'assets/osservatore-edizione2.pdf'
  }
];

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapEditionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    pdfPath: row.pdf_path || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMappingRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    editionId: row.edition_id,
    title: row.title,
    titleNormalized: row.title_normalized,
    url: row.url || '',
    pdfPath: row.pdf_path || '',
    regions: JSON.parse(row.regions_json || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRssRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    editionId: row.edition_id,
    title: row.title,
    titleNormalized: row.title_normalized,
    link: row.link || '',
    pubDate: row.pub_date || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function initSchema() {
  await run(`
    CREATE TABLE IF NOT EXISTS editions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pdf_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS mappings (
      id TEXT PRIMARY KEY,
      edition_id TEXT NOT NULL,
      title TEXT NOT NULL,
      title_normalized TEXT NOT NULL,
      url TEXT,
      pdf_path TEXT,
      regions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (edition_id) REFERENCES editions(id)
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_mappings_edition
    ON mappings (edition_id)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS rss_items (
      id TEXT PRIMARY KEY,
      edition_id TEXT NOT NULL,
      title TEXT NOT NULL,
      title_normalized TEXT NOT NULL,
      link TEXT,
      pub_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (edition_id) REFERENCES editions(id)
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_rss_edition
    ON rss_items (edition_id)
  `);
}

async function initDefaults() {
  const row = await get('SELECT COUNT(1) AS cnt FROM editions');
  if ((row?.cnt || 0) > 0) {
    return;
  }

  const now = new Date().toISOString();

  for (const edition of DEFAULT_EDITIONS) {
    await run(
      `INSERT INTO editions (id, name, pdf_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [edition.id, edition.name, edition.pdfPath, now, now]
    );
  }
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

app.get('/api/health', async (req, res) => {
  res.json({ ok: true, dbPath: DB_PATH });
});

app.post('/api/init-defaults', async (req, res) => {
  try {
    await initDefaults();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/editions', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM editions ORDER BY name ASC');
    res.json(rows.map(mapEditionRow));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/editions/:id', async (req, res) => {
  try {
    const row = await get('SELECT * FROM editions WHERE id = ?', [req.params.id]);
    if (!row) {
      res.status(404).json({ error: 'Edition not found' });
      return;
    }
    res.json(mapEditionRow(row));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/editions/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const name = String(req.body?.name || '').trim();
    const pdfPath = String(req.body?.pdfPath || '').trim();

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const current = await get('SELECT * FROM editions WHERE id = ?', [id]);
    const now = new Date().toISOString();

    if (current) {
      await run(
        `UPDATE editions
         SET name = ?, pdf_path = ?, updated_at = ?
         WHERE id = ?`,
        [name, pdfPath, now, id]
      );
    } else {
      await run(
        `INSERT INTO editions (id, name, pdf_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, name, pdfPath, now, now]
      );
    }

    const row = await get('SELECT * FROM editions WHERE id = ?', [id]);
    res.json(mapEditionRow(row));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/editions/:id/mappings', async (req, res) => {
  try {
    const rows = await all(
      'SELECT * FROM mappings WHERE edition_id = ? ORDER BY title ASC',
      [req.params.id]
    );
    res.json(rows.map(mapMappingRow));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/mappings/:id', async (req, res) => {
  try {
    const mappingId = req.params.id;
    const editionId = String(req.body?.editionId || '').trim();
    const title = String(req.body?.title || '').trim();
    const titleNormalized = normalizeText(req.body?.titleNormalized || title);
    const url = String(req.body?.url || '').trim();
    const pdfPath = String(req.body?.pdfPath || '').trim();
    const regions = Array.isArray(req.body?.regions) ? req.body.regions : [];
    const now = new Date().toISOString();

    if (!editionId || !title || regions.length === 0) {
      res.status(400).json({ error: 'editionId, title and regions are required' });
      return;
    }

    const current = await get('SELECT * FROM mappings WHERE id = ?', [mappingId]);
    const createdAt = current?.created_at || req.body?.createdAt || now;

    await run(
      `INSERT INTO mappings (id, edition_id, title, title_normalized, url, pdf_path, regions_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         edition_id = excluded.edition_id,
         title = excluded.title,
         title_normalized = excluded.title_normalized,
         url = excluded.url,
         pdf_path = excluded.pdf_path,
         regions_json = excluded.regions_json,
         updated_at = excluded.updated_at`,
      [
        mappingId,
        editionId,
        title,
        titleNormalized,
        url,
        pdfPath,
        JSON.stringify(regions),
        createdAt,
        now
      ]
    );

    const row = await get('SELECT * FROM mappings WHERE id = ?', [mappingId]);
    res.json(mapMappingRow(row));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/mappings/:id', async (req, res) => {
  try {
    await run('DELETE FROM mappings WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/editions/:id/mappings', async (req, res) => {
  try {
    await run('DELETE FROM mappings WHERE edition_id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/editions/:id/mappings/replace', async (req, res) => {
  try {
    const editionId = req.params.id;
    const mappings = Array.isArray(req.body?.mappings) ? req.body.mappings : [];

    await run('DELETE FROM mappings WHERE edition_id = ?', [editionId]);

    for (const mapping of mappings) {
      const mappingId = String(mapping.id || '').trim();
      const title = String(mapping.title || '').trim();
      const regions = Array.isArray(mapping.regions) ? mapping.regions : [];
      if (!mappingId || !title || regions.length === 0) {
        continue;
      }

      const now = new Date().toISOString();
      const createdAt = mapping.createdAt || now;

      await run(
        `INSERT INTO mappings (id, edition_id, title, title_normalized, url, pdf_path, regions_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mappingId,
          editionId,
          title,
          normalizeText(mapping.titleNormalized || title),
          String(mapping.url || '').trim(),
          String(mapping.pdfPath || '').trim(),
          JSON.stringify(regions),
          createdAt,
          now
        ]
      );
    }

    const rows = await all('SELECT * FROM mappings WHERE edition_id = ? ORDER BY title ASC', [editionId]);
    res.json(rows.map(mapMappingRow));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/editions/:id/rss', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM rss_items WHERE edition_id = ? ORDER BY title ASC', [req.params.id]);
    res.json(rows.map(mapRssRow));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/editions/:id/rss', async (req, res) => {
  try {
    const editionId = req.params.id;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const now = new Date().toISOString();

    for (const item of items) {
      const title = String(item.title || '').trim();
      if (!title) {
        continue;
      }

      const titleNormalized = normalizeText(title);
      const id = `${editionId}::${titleNormalized}`;

      await run(
        `INSERT INTO rss_items (id, edition_id, title, title_normalized, link, pub_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           title_normalized = excluded.title_normalized,
           link = excluded.link,
           pub_date = excluded.pub_date,
           updated_at = excluded.updated_at`,
        [
          id,
          editionId,
          title,
          titleNormalized,
          String(item.link || '').trim(),
          String(item.pubDate || '').trim(),
          now,
          now
        ]
      );
    }

    const rows = await all('SELECT * FROM rss_items WHERE edition_id = ? ORDER BY title ASC', [editionId]);
    res.json(rows.map(mapRssRow));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

initSchema()
  .then(() => initDefaults())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server avviato su http://127.0.0.1:${PORT}`);
      console.log(`SQLite: ${DB_PATH}`);
    });
  })
  .catch((error) => {
    console.error('Errore avvio server:', error);
    process.exit(1);
  });
