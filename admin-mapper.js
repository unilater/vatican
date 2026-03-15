(() => {
  const canvas = document.getElementById('or-admin-canvas');
  if (!canvas) {
    return;
  }

  const overlay = document.getElementById('or-admin-overlay');
  const canvasWrap = document.getElementById('or-admin-canvas-wrap');

  const editionSelect = document.getElementById('or-admin-edition-select');
  const editionStatus = document.getElementById('or-admin-edition-status');

  const pdfPathInput = document.getElementById('or-admin-pdf-path');
  const pdfLoadButton = document.getElementById('or-admin-pdf-load');
  const pdfStatus = document.getElementById('or-admin-pdf-status');

  const pageInput = document.getElementById('or-admin-page');
  const prevButton = document.getElementById('or-admin-prev');
  const nextButton = document.getElementById('or-admin-next');
  const zoomOutButton = document.getElementById('or-admin-zoom-out');
  const zoomInButton = document.getElementById('or-admin-zoom-in');
  const zoomInput = document.getElementById('or-admin-zoom');
  const zoomValue = document.getElementById('or-admin-zoom-value');
  const pageStatus = document.getElementById('or-admin-page-status');

  const titleInput = document.getElementById('or-admin-title');
  const urlInput = document.getElementById('or-admin-url');
  const rssLoadButton = document.getElementById('or-admin-rss-load');
  const rssSelect = document.getElementById('or-admin-rss-select');
  const rssStatus = document.getElementById('or-admin-rss-status');
  const editSelectedCheckbox = document.getElementById('or-admin-edit-selected');
  const saveButton = document.getElementById('or-admin-save');
  const clearSelectionButton = document.getElementById('or-admin-clear-selection');
  const selectionStatus = document.getElementById('or-admin-selection');

  const exportButton = document.getElementById('or-admin-export');
  const copyButton = document.getElementById('or-admin-copy');
  const importInput = document.getElementById('or-admin-import-file');
  const resetButton = document.getElementById('or-admin-reset');
  const dataStatus = document.getElementById('or-admin-data-status');

  const list = document.getElementById('or-admin-list');
  const count = document.getElementById('or-admin-count');

  const RSS_FEED_URL = 'https://www.osservatoreromano.va/it.newsfeed.xml';
  const PDFJS_SOURCES = [
    {
      lib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.js',
      worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.js'
    },
    {
      lib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    }
  ];

  const ctx = canvas.getContext('2d');

  let editions = [];
  let selectedEditionId = '';
  let selectedEdition = null;
  let mappings = [];

  let pdfDoc = null;
  let currentPage = 1;
  let currentPdfPath = (pdfPathInput?.value || '').trim();
  let currentCanvasSize = { width: 1, height: 1 };

  let selectedArticleId = null;
  let selectedRegionId = null;

  let dragStart = null;
  let draftRect = null;
  let pdfWorkerSrc = PDFJS_SOURCES[0].worker;
  let zoomPercent = Number(zoomInput?.value || 80);

  function normalizeText(value) {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function createId(prefix) {
    return window.crypto?.randomUUID ? window.crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  function setEditionStatus(message, isError = false) {
    if (!editionStatus) {
      return;
    }
    editionStatus.textContent = message;
    editionStatus.style.color = isError ? '#8d1f1f' : '';
  }

  function setPdfStatus(message, isError = false) {
    if (!pdfStatus) {
      return;
    }
    pdfStatus.textContent = message;
    pdfStatus.style.color = isError ? '#8d1f1f' : '';
  }

  function setSelectionStatus(message) {
    if (selectionStatus) {
      selectionStatus.textContent = message;
    }
  }

  function setRssStatus(message, isError = false) {
    if (!rssStatus) {
      return;
    }
    rssStatus.textContent = message;
    rssStatus.style.color = isError ? '#8d1f1f' : '';
  }

  function normalizeRectShape(rect) {
    return {
      x: Number(rect?.x || 0),
      y: Number(rect?.y || 0),
      w: Number(rect?.w || 0),
      h: Number(rect?.h || 0)
    };
  }

  function normalizeArticle(article) {
    if (!article || !article.title) {
      return null;
    }

    const title = String(article.title).trim();
    if (!title) {
      return null;
    }

    const now = new Date().toISOString();
    const incomingRegions = Array.isArray(article.regions)
      ? article.regions
      : article.rect && typeof article.page === 'number'
        ? [{ id: createId('region'), page: article.page, rect: article.rect }]
        : [];

    const regions = incomingRegions
      .filter((region) => region && typeof region.page === 'number' && region.rect)
      .map((region) => ({
        id: region.id || createId('region'),
        page: Number(region.page),
        rect: normalizeRectShape(region.rect),
        createdAt: region.createdAt || now,
        updatedAt: region.updatedAt || now
      }))
      .filter((region) => region.page > 0 && region.rect.w > 0 && region.rect.h > 0);

    if (regions.length === 0) {
      return null;
    }

    return {
      id: article.id || createId('article'),
      editionId: article.editionId || selectedEditionId,
      title,
      titleNormalized: article.titleNormalized || normalizeText(title),
      url: String(article.url || '').trim(),
      pdfPath: article.pdfPath || currentPdfPath,
      regions,
      createdAt: article.createdAt || now,
      updatedAt: now
    };
  }

  function normalizeIncomingMappings(payload) {
    const incoming = Array.isArray(payload) ? payload : payload?.mappings;
    if (!Array.isArray(incoming)) {
      return [];
    }

    return incoming
      .map((item) => normalizeArticle(item))
      .filter(Boolean);
  }

  function getTotalRegions() {
    return mappings.reduce((total, article) => total + article.regions.length, 0);
  }

  function updateDataStatus(message) {
    if (!dataStatus) {
      return;
    }
    dataStatus.textContent = message || `Articoli salvati: ${mappings.length} - Aree totali: ${getTotalRegions()}.`;
  }

  function clearOverlay() {
    if (overlay) {
      overlay.innerHTML = '';
    }
  }

  function denormalizeRect(rect) {
    return {
      x: rect.x * currentCanvasSize.width,
      y: rect.y * currentCanvasSize.height,
      w: rect.w * currentCanvasSize.width,
      h: rect.h * currentCanvasSize.height
    };
  }

  function normalizeRect(rect) {
    const width = currentCanvasSize.width || 1;
    const height = currentCanvasSize.height || 1;

    return {
      x: rect.x / width,
      y: rect.y / height,
      w: rect.w / width,
      h: rect.h / height
    };
  }

  function clampRect(rect) {
    const maxW = currentCanvasSize.width;
    const maxH = currentCanvasSize.height;

    const x = Math.max(0, Math.min(rect.x, maxW));
    const y = Math.max(0, Math.min(rect.y, maxH));
    const w = Math.max(0, Math.min(rect.w, maxW - x));
    const h = Math.max(0, Math.min(rect.h, maxH - y));

    return { x, y, w, h };
  }

  function getPageRegions(page) {
    const regions = [];

    mappings.forEach((article) => {
      article.regions.forEach((region) => {
        if (region.page === page) {
          regions.push({ article, region });
        }
      });
    });

    return regions;
  }

  function drawOverlay() {
    if (!overlay) {
      return;
    }

    overlay.innerHTML = '';

    getPageRegions(currentPage).forEach(({ article, region }) => {
      const pixelRect = denormalizeRect(region.rect);
      const rectEl = document.createElement('button');
      rectEl.type = 'button';
      rectEl.className = 'or-admin-rect';
      rectEl.style.left = `${pixelRect.x}px`;
      rectEl.style.top = `${pixelRect.y}px`;
      rectEl.style.width = `${pixelRect.w}px`;
      rectEl.style.height = `${pixelRect.h}px`;
      rectEl.dataset.articleId = article.id;
      rectEl.dataset.regionId = region.id;
      rectEl.title = `${article.title} (area)`;

      if (article.id === selectedArticleId && region.id === selectedRegionId) {
        rectEl.classList.add('is-selected');
      }

      rectEl.addEventListener('click', () => {
        selectedArticleId = article.id;
        selectedRegionId = region.id;
        if (titleInput) {
          titleInput.value = article.title;
        }
        if (urlInput) {
          urlInput.value = article.url || '';
        }
        setSelectionStatus(`Area selezionata: ${article.title}`);
        drawOverlay();
        renderList();
      });

      overlay.appendChild(rectEl);
    });

    if (draftRect) {
      const draft = document.createElement('div');
      draft.className = 'or-admin-rect is-draft';
      draft.style.left = `${draftRect.x}px`;
      draft.style.top = `${draftRect.y}px`;
      draft.style.width = `${draftRect.w}px`;
      draft.style.height = `${draftRect.h}px`;
      overlay.appendChild(draft);
    }
  }

  function getContainerWidth() {
    const containerWidth = canvasWrap?.clientWidth || 800;
    return Math.max(320, containerWidth - 2);
  }

  function setZoomPercent(value) {
    const next = Math.min(180, Math.max(40, value));
    zoomPercent = next;
    if (zoomInput) {
      zoomInput.value = String(next);
    }
    if (zoomValue) {
      zoomValue.textContent = `${next}%`;
    }
  }

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source.lib;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Impossibile caricare ${source.lib}`));
      document.head.appendChild(script);
    });
  }

  async function ensurePdfJsLoaded() {
    if (window.pdfjsLib) {
      return true;
    }

    for (const source of PDFJS_SOURCES) {
      try {
        await loadScript(source);
        if (window.pdfjsLib) {
          pdfWorkerSrc = source.worker;
          return true;
        }
      } catch (error) {
        continue;
      }
    }

    return false;
  }

  async function renderPage() {
    if (!pdfDoc || !ctx) {
      return;
    }

    currentPage = Math.min(Math.max(1, currentPage), pdfDoc.numPages);
    const page = await pdfDoc.getPage(currentPage);

    const viewportAtScaleOne = page.getViewport({ scale: 1 });
    const containerWidth = getContainerWidth();
    const fitWidthScale = containerWidth / viewportAtScaleOne.width;
    const scale = fitWidthScale * (zoomPercent / 100);
    const viewport = page.getViewport({ scale });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    currentCanvasSize = { width: canvas.width, height: canvas.height };

    if (overlay) {
      overlay.style.width = `${canvas.width}px`;
      overlay.style.height = `${canvas.height}px`;
    }

    await page.render({ canvasContext: ctx, viewport }).promise;

    if (pageStatus) {
      pageStatus.textContent = `Pagina ${currentPage} / ${pdfDoc.numPages}`;
    }

    if (pageInput) {
      pageInput.value = String(currentPage);
      pageInput.max = String(pdfDoc.numPages);
    }

    drawOverlay();
  }

  async function loadPdf(path) {
    const hasPdfJs = await ensurePdfJsLoaded();
    if (!hasPdfJs || !window.pdfjsLib) {
      setPdfStatus('PDF.js non disponibile: CDN non raggiungibili.', true);
      return;
    }

    window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
    setPdfStatus('Caricamento PDF in corso...');

    try {
      const cleanPath = (path || '').trim();
      if (!cleanPath) {
        throw new Error('Percorso PDF mancante');
      }

      const candidates = [cleanPath];
      if (!cleanPath.startsWith('/')) {
        candidates.push(`/${cleanPath}`);
      }

      let loaded = null;
      let loadedPath = '';

      for (const candidate of candidates) {
        try {
          const head = await fetch(candidate, { method: 'HEAD', cache: 'no-store' });
          if (!head.ok) {
            continue;
          }
          loaded = await window.pdfjsLib.getDocument(candidate).promise;
          loadedPath = candidate;
          break;
        } catch (error) {
          continue;
        }
      }

      if (!loaded) {
        throw new Error('PDF non raggiungibile');
      }

      pdfDoc = loaded;
      currentPdfPath = loadedPath || cleanPath;
      if (pdfPathInput) {
        pdfPathInput.value = currentPdfPath;
      }
      currentPage = 1;
      setPdfStatus(`PDF caricato: ${pdfDoc.numPages} pagine.`);
      await renderPage();
    } catch (error) {
      pdfDoc = null;
      setPdfStatus(`Impossibile caricare il PDF. ${error?.message || 'Errore sconosciuto'}.`, true);
      if (pageStatus) {
        pageStatus.textContent = 'Pagina - / -';
      }
      clearOverlay();
    }
  }

  function pointerToCanvasPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(event.clientX - rect.left, rect.width)),
      y: Math.max(0, Math.min(event.clientY - rect.top, rect.height))
    };
  }

  function beginDrag(event) {
    if (!pdfDoc) {
      return;
    }

    const pos = pointerToCanvasPosition(event);
    dragStart = pos;
    draftRect = { x: pos.x, y: pos.y, w: 0, h: 0 };
    drawOverlay();
  }

  function moveDrag(event) {
    if (!dragStart) {
      return;
    }

    const pos = pointerToCanvasPosition(event);
    const x = Math.min(dragStart.x, pos.x);
    const y = Math.min(dragStart.y, pos.y);
    const w = Math.abs(pos.x - dragStart.x);
    const h = Math.abs(pos.y - dragStart.y);

    draftRect = { x, y, w, h };
    drawOverlay();
  }

  function endDrag() {
    if (!dragStart || !draftRect) {
      dragStart = null;
      return;
    }

    const minSize = 8;
    if (draftRect.w < minSize || draftRect.h < minSize) {
      draftRect = null;
      dragStart = null;
      drawOverlay();
      setSelectionStatus('Selezione troppo piccola. Disegna un rettangolo piu ampio.');
      return;
    }

    draftRect = clampRect(draftRect);
    dragStart = null;
    drawOverlay();
    setSelectionStatus('Area pronta per il salvataggio.');
  }

  function getSelectedArticle() {
    return mappings.find((article) => article.id === selectedArticleId) || null;
  }

  function getSelectedRegion(article) {
    if (!article) {
      return null;
    }
    return article.regions.find((region) => region.id === selectedRegionId) || null;
  }

  async function saveArticle(article) {
    await window.OrDataStore.saveMapping(article);
    await reloadMappingsForEdition();
  }

  async function upsertMapping() {
    const title = (titleInput?.value || '').trim();
    if (!title) {
      setSelectionStatus('Inserisci prima il titolo articolo.');
      return;
    }

    if (!selectedEditionId) {
      setSelectionStatus('Seleziona un edizione prima di salvare.');
      return;
    }

    if (!pdfDoc) {
      setSelectionStatus('Carica prima il PDF.');
      return;
    }

    const selectedArticle = getSelectedArticle();
    const selectedRegion = getSelectedRegion(selectedArticle);

    if (!draftRect && !(selectedArticle && selectedRegion)) {
      setSelectionStatus('Disegna prima un rettangolo oppure seleziona un area esistente.');
      return;
    }

    const url = (urlInput?.value || '').trim();
    const normalizedTitle = normalizeText(title);
    const now = new Date().toISOString();

    const shouldEditSelected = Boolean(editSelectedCheckbox?.checked && selectedArticle && selectedRegion);

    if (shouldEditSelected) {
      const baseRect = draftRect || denormalizeRect(selectedRegion.rect);
      const nextRect = normalizeRect(clampRect(baseRect));

      const updatedArticle = {
        ...selectedArticle,
        title,
        titleNormalized: normalizedTitle,
        url,
        pdfPath: currentPdfPath,
        updatedAt: now,
        regions: selectedArticle.regions.map((region) => {
          if (region.id !== selectedRegion.id) {
            return region;
          }
          return {
            ...region,
            page: currentPage,
            rect: nextRect,
            updatedAt: now
          };
        })
      };

      await saveArticle(updatedArticle);
      setSelectionStatus(`Area aggiornata per: ${title}`);
    } else {
      const region = {
        id: createId('region'),
        page: currentPage,
        rect: normalizeRect(clampRect(draftRect)),
        createdAt: now,
        updatedAt: now
      };

      let article = mappings.find((item) => item.titleNormalized === normalizedTitle && (item.url || '') === url);

      if (!article) {
        article = {
          id: createId('article'),
          editionId: selectedEditionId,
          title,
          titleNormalized: normalizedTitle,
          url,
          pdfPath: currentPdfPath,
          regions: [],
          createdAt: now,
          updatedAt: now
        };
      }

      const updatedArticle = {
        ...article,
        editionId: selectedEditionId,
        title,
        titleNormalized: normalizedTitle,
        url,
        pdfPath: currentPdfPath,
        updatedAt: now,
        regions: [...article.regions, region]
      };

      await saveArticle(updatedArticle);
      selectedArticleId = updatedArticle.id;
      selectedRegionId = region.id;
      setSelectionStatus(`Nuova area aggiunta a: ${title}`);
    }

    draftRect = null;
    drawOverlay();
    renderList();
  }

  function clearSelection() {
    selectedArticleId = null;
    selectedRegionId = null;
    draftRect = null;
    if (editSelectedCheckbox) {
      editSelectedCheckbox.checked = false;
    }
    if (titleInput) {
      titleInput.value = '';
    }
    if (urlInput) {
      urlInput.value = '';
    }
    setSelectionStatus('Nessuna area selezionata.');
    drawOverlay();
    renderList();
  }

  async function deleteArticle(articleId) {
    await window.OrDataStore.deleteMapping(articleId);
    if (selectedArticleId === articleId) {
      clearSelection();
    }
    await reloadMappingsForEdition();
  }

  function renderList() {
    if (!list) {
      return;
    }

    list.innerHTML = '';

    mappings
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title, 'it'))
      .forEach((article) => {
        const li = document.createElement('li');
        li.className = 'or-admin-item';
        if (article.id === selectedArticleId) {
          li.classList.add('is-selected');
        }

        const pages = Array.from(new Set(article.regions.map((region) => region.page))).sort((a, b) => a - b);

        const meta = document.createElement('div');
        meta.className = 'or-admin-item__meta';
        meta.innerHTML = `<strong>${article.title}</strong><small>Aree: ${article.regions.length} - Pagine: ${pages.join(', ')}${article.url ? ` - ${article.url}` : ''}</small>`;

        const actions = document.createElement('div');
        actions.className = 'or-admin-item__actions';

        const jumpButton = document.createElement('button');
        jumpButton.type = 'button';
        jumpButton.textContent = 'Vai';
        jumpButton.addEventListener('click', async () => {
          const firstRegion = article.regions[0];
          if (!firstRegion) {
            return;
          }
          currentPage = firstRegion.page;
          selectedArticleId = article.id;
          selectedRegionId = firstRegion.id;
          if (titleInput) {
            titleInput.value = article.title;
          }
          if (urlInput) {
            urlInput.value = article.url || '';
          }
          await renderPage();
          renderList();
        });

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'or-admin-btn-danger is-small';
        deleteButton.textContent = 'Elimina';
        deleteButton.addEventListener('click', () => {
          deleteArticle(article.id);
        });

        actions.appendChild(jumpButton);
        actions.appendChild(deleteButton);
        li.appendChild(meta);
        li.appendChild(actions);
        list.appendChild(li);
      });

    if (count) {
      count.textContent = String(getTotalRegions());
    }
    updateDataStatus();
  }

  function setRssOptions(items) {
    if (!rssSelect) {
      return;
    }

    rssSelect.innerHTML = '';

    const first = document.createElement('option');
    first.value = '';
    first.textContent = 'Seleziona un titolo dal feed...';
    rssSelect.appendChild(first);

    items.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.title;
      option.textContent = item.title;
      option.dataset.link = item.link || '';
      rssSelect.appendChild(option);
    });
  }

  async function renderRssSelectFromDb() {
    if (!selectedEditionId) {
      setRssOptions([]);
      setRssStatus('Seleziona una edizione.');
      return;
    }

    const items = await window.OrDataStore.listRssItemsByEdition(selectedEditionId);
    setRssOptions(items);

    if (items.length === 0) {
      setRssStatus('Nessun titolo RSS in cache per questa edizione.');
      return;
    }

    setRssStatus(`Titoli RSS in DB locale: ${items.length}.`);
  }

  function parseRssItems(xmlText) {
    const xmlDoc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error('XML feed non valido');
    }

    return Array.from(xmlDoc.querySelectorAll('item'))
      .slice(0, 120)
      .map((item) => ({
        title: (item.querySelector('title')?.textContent || '').replace(/\s+/g, ' ').trim(),
        link: (item.querySelector('link')?.textContent || '').trim(),
        pubDate: (item.querySelector('pubDate')?.textContent || '').trim()
      }))
      .filter((item) => Boolean(item.title));
  }

  async function fetchRssXml() {
    const urls = [
      RSS_FEED_URL,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(RSS_FEED_URL)}`,
      'https://r.jina.ai/http://www.osservatoreromano.va/it.newsfeed.xml'
    ];

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          continue;
        }
        const text = await response.text();
        if (text && text.trim()) {
          return text;
        }
      } catch (error) {
        continue;
      }
    }

    throw new Error('Feed non raggiungibile');
  }

  async function importRssToDb() {
    if (!selectedEditionId) {
      setRssStatus('Seleziona un edizione prima di importare RSS.', true);
      return;
    }

    if (rssLoadButton) {
      rssLoadButton.disabled = true;
    }

    setRssStatus('Import RSS in corso...');

    try {
      const xml = await fetchRssXml();
      const items = parseRssItems(xml);
      if (items.length === 0) {
        setRssStatus('Feed raggiunto ma senza titoli utilizzabili.', true);
        return;
      }

      await window.OrDataStore.upsertRssItems(selectedEditionId, items);
      await renderRssSelectFromDb();
      setRssStatus(`Import RSS completato: ${items.length} titoli salvati nel DB locale.`);
    } catch (error) {
      setRssStatus('Import RSS non riuscito (CORS/rete).', true);
    } finally {
      if (rssLoadButton) {
        rssLoadButton.disabled = false;
      }
    }
  }

  async function reloadMappingsForEdition() {
    if (!selectedEditionId) {
      mappings = [];
      renderList();
      drawOverlay();
      return;
    }

    mappings = await window.OrDataStore.listMappingsByEdition(selectedEditionId);
    selectedArticleId = null;
    selectedRegionId = null;
    draftRect = null;
    renderList();
    drawOverlay();
  }

  async function exportMappings() {
    const payload = {
      version: 3,
      exportedAt: new Date().toISOString(),
      editionId: selectedEditionId,
      editionName: selectedEdition?.name || '',
      pdfPath: currentPdfPath,
      mappings
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `or-pdf-mappings-${selectedEditionId || 'edition'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    updateDataStatus('Export completato.');
  }

  async function copyMappingsToClipboard() {
    const payload = {
      version: 3,
      exportedAt: new Date().toISOString(),
      editionId: selectedEditionId,
      editionName: selectedEdition?.name || '',
      pdfPath: currentPdfPath,
      mappings
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      updateDataStatus('JSON copiato negli appunti.');
    } catch (error) {
      updateDataStatus('Copia non riuscita. Usa Export JSON.');
    }
  }

  async function importMappingsFromFile(file) {
    if (!file || !selectedEditionId) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const normalized = normalizeIncomingMappings(parsed);

      if (normalized.length === 0) {
        throw new Error('Formato non valido');
      }

      const withEdition = normalized.map((item) => ({
        ...item,
        id: item.id || createId('article'),
        editionId: selectedEditionId,
        pdfPath: currentPdfPath
      }));

      await window.OrDataStore.replaceMappingsByEdition(selectedEditionId, withEdition);
      await reloadMappingsForEdition();
      updateDataStatus(`Import completato: articoli ${withEdition.length}.`);
    } catch (error) {
      updateDataStatus('Import non riuscito: JSON non valido.');
    }
  }

  async function resetAllMappings() {
    if (!selectedEditionId) {
      return;
    }

    const confirmed = window.confirm('Confermi la cancellazione di tutte le mappature per questa edizione?');
    if (!confirmed) {
      return;
    }

    await window.OrDataStore.clearMappingsByEdition(selectedEditionId);
    await reloadMappingsForEdition();
    setSelectionStatus('Archivio mappature edizione azzerato.');
  }

  async function renderEditionSelect() {
    editions = await window.OrDataStore.listEditions();
    if (!editionSelect) {
      return;
    }

    editionSelect.innerHTML = '';
    editions.forEach((edition) => {
      const option = document.createElement('option');
      option.value = edition.id;
      option.textContent = edition.name;
      editionSelect.appendChild(option);
    });

    if (!selectedEditionId && editions.length > 0) {
      selectedEditionId = editions[0].id;
    }

    editionSelect.value = selectedEditionId;
  }

  async function applyEdition(editionId) {
    selectedEditionId = editionId;
    selectedEdition = await window.OrDataStore.getEdition(editionId);

    if (!selectedEdition) {
      setEditionStatus('Edizione non trovata.', true);
      return;
    }

    if (pdfPathInput) {
      pdfPathInput.value = selectedEdition.pdfPath || '';
    }

    currentPdfPath = selectedEdition.pdfPath || '';

    setEditionStatus(`Edizione attiva: ${selectedEdition.name}. PDF: ${selectedEdition.pdfPath || 'non impostato'}.`);

    await reloadMappingsForEdition();
    await renderRssSelectFromDb();

    if (currentPdfPath) {
      await loadPdf(currentPdfPath);
    }
  }

  async function savePdfPathOnEditionAndLoad() {
    if (!selectedEditionId) {
      setPdfStatus('Seleziona prima una edizione.', true);
      return;
    }

    const path = (pdfPathInput?.value || '').trim();
    if (!path) {
      setPdfStatus('Inserisci un percorso PDF.', true);
      return;
    }

    const edition = await window.OrDataStore.getEdition(selectedEditionId);
    if (!edition) {
      setPdfStatus('Edizione non trovata.', true);
      return;
    }

    const updatedEdition = {
      ...edition,
      pdfPath: path,
      updatedAt: new Date().toISOString()
    };

    await window.OrDataStore.saveEdition(updatedEdition);
    currentPdfPath = path;
    selectedEdition = updatedEdition;
    setEditionStatus(`Edizione attiva: ${updatedEdition.name}. PDF aggiornato.`);

    await loadPdf(path);
  }

  async function bootstrap() {
    if (!window.OrDataStore) {
      setEditionStatus('Modulo database locale non disponibile.', true);
      return;
    }

    await window.OrDataStore.initDefaults();
    await renderEditionSelect();

    if (!selectedEditionId) {
      setEditionStatus('Nessuna edizione configurata.', true);
      return;
    }

    await applyEdition(selectedEditionId);
    setZoomPercent(zoomPercent);
  }

  pdfLoadButton?.addEventListener('click', () => {
    savePdfPathOnEditionAndLoad();
  });

  editionSelect?.addEventListener('change', () => {
    applyEdition(editionSelect.value);
  });

  prevButton?.addEventListener('click', async () => {
    if (!pdfDoc) {
      return;
    }
    currentPage = Math.max(1, currentPage - 1);
    await renderPage();
  });

  nextButton?.addEventListener('click', async () => {
    if (!pdfDoc) {
      return;
    }
    currentPage = Math.min(pdfDoc.numPages, currentPage + 1);
    await renderPage();
  });

  pageInput?.addEventListener('change', async () => {
    if (!pdfDoc) {
      return;
    }

    const requested = Number(pageInput.value) || 1;
    currentPage = Math.min(Math.max(1, requested), pdfDoc.numPages);
    await renderPage();
  });

  zoomOutButton?.addEventListener('click', async () => {
    setZoomPercent(zoomPercent - 10);
    if (pdfDoc) {
      await renderPage();
    }
  });

  zoomInButton?.addEventListener('click', async () => {
    setZoomPercent(zoomPercent + 10);
    if (pdfDoc) {
      await renderPage();
    }
  });

  zoomInput?.addEventListener('input', async () => {
    setZoomPercent(Number(zoomInput.value || 80));
    if (pdfDoc) {
      await renderPage();
    }
  });

  saveButton?.addEventListener('click', () => {
    upsertMapping();
  });

  clearSelectionButton?.addEventListener('click', clearSelection);

  rssLoadButton?.addEventListener('click', () => {
    importRssToDb();
  });

  rssSelect?.addEventListener('change', () => {
    const selectedTitle = rssSelect.value || '';
    if (!selectedTitle) {
      return;
    }

    if (titleInput) {
      titleInput.value = selectedTitle;
    }

    const selectedOption = rssSelect.options[rssSelect.selectedIndex];
    const selectedLink = selectedOption?.dataset?.link || '';
    if (selectedLink && urlInput && !urlInput.value.trim()) {
      urlInput.value = selectedLink;
    }

    setSelectionStatus('Titolo RSS inserito nei campi articolo.');
  });

  exportButton?.addEventListener('click', () => {
    exportMappings();
  });

  copyButton?.addEventListener('click', () => {
    copyMappingsToClipboard();
  });

  importInput?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    importMappingsFromFile(file);
    importInput.value = '';
  });

  resetButton?.addEventListener('click', () => {
    resetAllMappings();
  });

  canvas.addEventListener('pointerdown', beginDrag);
  canvas.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', endDrag);

  if (window.ResizeObserver) {
    const resizeObserver = new ResizeObserver(() => {
      if (pdfDoc) {
        renderPage();
      }
    });
    resizeObserver.observe(canvasWrap);
  }

  renderList();
  bootstrap();
})();
