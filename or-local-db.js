(() => {
  const DB_NAME = 'or_local_db';
  const DB_VERSION = 1;

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

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains('editions')) {
          db.createObjectStore('editions', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('mappings')) {
          const mappingsStore = db.createObjectStore('mappings', { keyPath: 'id' });
          mappingsStore.createIndex('editionId', 'editionId', { unique: false });
        }

        if (!db.objectStoreNames.contains('rss_items')) {
          const rssStore = db.createObjectStore('rss_items', { keyPath: 'id' });
          rssStore.createIndex('editionId', 'editionId', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Cannot open IndexedDB'));
    });
  }

  async function withStore(storeName, mode, callback) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let callbackResult;
      let callbackSettled = false;
      let callbackError = null;
      let finalized = false;

      const finishResolve = (value) => {
        if (finalized) {
          return;
        }
        finalized = true;
        db.close();
        resolve(value);
      };

      const finishReject = (error) => {
        if (finalized) {
          return;
        }
        finalized = true;
        db.close();
        reject(error);
      };

      tx.oncomplete = () => {
        if (callbackError) {
          finishReject(callbackError);
          return;
        }
        finishResolve(callbackResult);
      };

      tx.onerror = () => {
        finishReject(tx.error || new Error('Transaction error'));
      };

      tx.onabort = () => {
        finishReject(tx.error || new Error('Transaction aborted'));
      };

      Promise.resolve(callback(store, tx))
        .then((result) => {
          callbackResult = result;
          callbackSettled = true;
        })
        .catch((error) => {
          callbackError = error;
          callbackSettled = true;
        });

      // Se non parte alcuna request nel callback, la transazione puo chiudersi subito.
      // In quel caso risolviamo non appena il callback termina.
      Promise.resolve().then(() => {
        if (callbackSettled && tx.readyState === 'finished') {
          if (callbackError) {
            finishReject(callbackError);
          } else {
            finishResolve(callbackResult);
          }
        }
      });
    });
  }

  async function initDefaults() {
    const existing = await listEditions();
    if (existing.length > 0) {
      return existing;
    }

    const now = new Date().toISOString();
    await withStore('editions', 'readwrite', (store) => {
      DEFAULT_EDITIONS.forEach((edition) => {
        store.put({
          ...edition,
          createdAt: now,
          updatedAt: now
        });
      });
    });

    return listEditions();
  }

  async function listEditions() {
    const editions = await withStore('editions', 'readonly', async (store) => {
      const request = store.getAll();
      const items = await requestToPromise(request);
      return Array.isArray(items) ? items : [];
    });

    return editions.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it'));
  }

  async function getEdition(id) {
    if (!id) {
      return null;
    }

    return withStore('editions', 'readonly', (store) => requestToPromise(store.get(id)));
  }

  async function saveEdition(edition) {
    if (!edition || !edition.id) {
      throw new Error('Edition id is required');
    }

    const now = new Date().toISOString();
    const current = await getEdition(edition.id);

    const payload = {
      ...current,
      ...edition,
      updatedAt: now,
      createdAt: current?.createdAt || now
    };

    await withStore('editions', 'readwrite', (store) => {
      store.put(payload);
    });

    return payload;
  }

  async function listMappingsByEdition(editionId) {
    if (!editionId) {
      return [];
    }

    const rows = await withStore('mappings', 'readonly', async (store) => {
      const index = store.index('editionId');
      const request = index.getAll(editionId);
      const items = await requestToPromise(request);
      return Array.isArray(items) ? items : [];
    });

    return rows.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'it'));
  }

  async function saveMapping(mapping) {
    if (!mapping || !mapping.id || !mapping.editionId) {
      throw new Error('Mapping id and editionId are required');
    }

    await withStore('mappings', 'readwrite', (store) => {
      store.put(mapping);
    });

    return mapping;
  }

  async function deleteMapping(mappingId) {
    if (!mappingId) {
      return;
    }

    await withStore('mappings', 'readwrite', (store) => {
      store.delete(mappingId);
    });
  }

  async function clearMappingsByEdition(editionId) {
    if (!editionId) {
      return;
    }

    const rows = await listMappingsByEdition(editionId);
    await withStore('mappings', 'readwrite', (store) => {
      rows.forEach((row) => store.delete(row.id));
    });
  }

  async function replaceMappingsByEdition(editionId, mappings) {
    await clearMappingsByEdition(editionId);
    await withStore('mappings', 'readwrite', (store) => {
      mappings.forEach((mapping) => {
        store.put({
          ...mapping,
          editionId
        });
      });
    });
  }

  async function listRssItemsByEdition(editionId) {
    if (!editionId) {
      return [];
    }

    const rows = await withStore('rss_items', 'readonly', async (store) => {
      const index = store.index('editionId');
      const request = index.getAll(editionId);
      const items = await requestToPromise(request);
      return Array.isArray(items) ? items : [];
    });

    return rows.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'it'));
  }

  async function upsertRssItems(editionId, items) {
    if (!editionId || !Array.isArray(items) || items.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    await withStore('rss_items', 'readwrite', (store) => {
      items.forEach((item) => {
        const title = String(item.title || '').trim();
        if (!title) {
          return;
        }

        const normalizedTitle = title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        const id = `${editionId}::${normalizedTitle}`;

        store.put({
          id,
          editionId,
          title,
          titleNormalized: normalizedTitle,
          link: String(item.link || '').trim(),
          pubDate: String(item.pubDate || '').trim(),
          updatedAt: now,
          createdAt: now
        });
      });
    });
  }

  window.OrLocalDb = {
    initDefaults,
    listEditions,
    getEdition,
    saveEdition,
    listMappingsByEdition,
    saveMapping,
    deleteMapping,
    clearMappingsByEdition,
    replaceMappingsByEdition,
    listRssItemsByEdition,
    upsertRssItems
  };
})();
