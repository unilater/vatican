(() => {
  const canvas = document.getElementById('or-pdf-canvas');
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('or-pdf-stage');
  const highlightLayer = document.getElementById('or-pdf-highlight-layer');
  const hitLayer = document.getElementById('or-pdf-hit-layer');
  const viewerLabel = document.getElementById('or-viewer-label');
  const editionNumber = document.getElementById('or-edition-number');
  const editionDate = document.getElementById('or-edition-date');
  const pdfLoader = document.getElementById('or-pdf-loader');
  const pdfLoaderText = document.getElementById('or-pdf-loader-text');
  const pdfHint = document.getElementById('or-pdf-hint');
  const searchResult = document.getElementById('or-search-result');
  const fitButton = document.getElementById('or-fit-toggle');
  const zoomButton = document.getElementById('or-zoom-toggle');

  const editionSelect = document.getElementById('or-edition-select');
  const editionStatus = document.getElementById('or-edition-status');
  const mappedList = document.getElementById('or-mapped-titles-list');
  const mappedStatus = document.getElementById('or-mapped-status');
  const textPreviewLead = document.getElementById('or-text-preview-lead');
  const textPreviewBody = document.getElementById('or-text-preview-body');
  const textPreviewLink = document.getElementById('or-text-preview-link');
  const minimap = document.getElementById('or-minimap');
  const minimapCanvas = document.getElementById('or-minimap-canvas');
  const minimapViewport = document.getElementById('or-minimap-viewport');
  const minimapLabel = document.getElementById('or-minimap-label');
  const mobileListToggle = document.getElementById('or-mobile-list-toggle');
  const mobileListClose = document.getElementById('or-mobile-list-close');
  const mobileListBackdrop = document.getElementById('or-mobile-list-backdrop');
  const filmstripToggle = document.getElementById('or-filmstrip-toggle');
  const articleDialog = document.getElementById('or-article-dialog');
  const articleDialogTitle = document.getElementById('or-article-dialog-title');
  const articleDialogBody = document.getElementById('or-article-dialog-body');
  const articleDialogLink = document.getElementById('or-article-dialog-link');
  const articleDialogClose = document.getElementById('or-article-dialog-close');
  const filmstrip = document.getElementById('or-filmstrip');
  const filmstripList = document.getElementById('or-filmstrip-list');
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

  let pdfWorkerSrc = PDFJS_SOURCES[0].worker;

  let editions = [];
  let selectedEditionId = '';
  let selectedEdition = null;
  let mappings = [];
  let rssItems = [];
  let selectedMappedArticleId = '';
  let selectedArticle = null;

  let pdfDocument = null;
  let currentPage = 1;
  let maxPage = 1;
  let renderToken = 0;
  let zoomScaleFactor = 1;
  let fitPageScale = 1;
  let fitWidthScale = 1;
  let fitMode = 'page';
  let renderedTotalScale = 1;
  let isLoadingEdition = false;
  let isZoomAnimating = false;
  let activeFocusRegion = null;
  let activeFocusRegions = [];
  let isMagnetFocusEnabled = false;
  let isApplyingMagnetScroll = false;
  let isMagnetBypassActive = false;
  let isFilmstripVisible = false;
  let pendingRestoredState = null;
  let persistTimer = null;
  let touchStartPoint = null;
  const pageCache = new Map();
  const thumbCache = new Map();
  const READER_STATE_KEY = 'orReaderStateV2';

  const LOREM_IPSUM_PREVIEW = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
  ].join(' ');

  function isMobileLayout() {
    return window.matchMedia('(max-width: 820px)').matches;
  }

  function setMobileListOpen(isOpen) {
    if (!isMobileLayout()) {
      document.body.classList.remove('or-mobile-list-open');
      document.body.classList.remove('or-mobile-list-collapsed');
      if (mobileListToggle) {
        mobileListToggle.setAttribute('aria-expanded', 'false');
        mobileListToggle.textContent = 'Apri titoli';
      }
      if (mobileListClose) {
        mobileListClose.textContent = 'Chiudi titoli';
      }
      return;
    }

    const shouldOpen = Boolean(isOpen);
    document.body.classList.toggle('or-mobile-list-open', shouldOpen);
    document.body.classList.toggle('or-mobile-list-collapsed', !shouldOpen);

    if (mobileListToggle) {
      mobileListToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      mobileListToggle.textContent = shouldOpen ? 'Chiudi titoli' : 'Apri titoli';
    }

    if (mobileListClose) {
      mobileListClose.textContent = 'Chiudi titoli';
    }
  }

  function normalizeText(value) {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }

    try {
      const url = new URL(raw, window.location.origin);
      const cleanPath = url.pathname
        .replace(/\/+$/, '')
        .replace(/\.html?$/i, '')
        .toLowerCase();
      return cleanPath || '/';
    } catch (error) {
      return raw
        .replace(/^https?:\/\/[^/]+/i, '')
        .replace(/[?#].*$/, '')
        .replace(/\/+$/, '')
        .replace(/\.html?$/i, '')
        .toLowerCase();
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stripHtml(value) {
    const html = String(value || '');
    if (!html) {
      return '';
    }

    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseEditionDate(edition) {
    if (!edition) {
      return '';
    }

    if (edition.id && /^\d{4}-\d{2}-\d{2}$/.test(edition.id)) {
      return edition.id;
    }

    const fromName = String(edition.name || '').match(/(\d{4}-\d{2}-\d{2})/);
    return fromName ? fromName[1] : '';
  }

  function formatItalianDate(isoDate) {
    if (!isoDate) {
      return '--';
    }

    const dt = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(dt.getTime())) {
      return isoDate;
    }

    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(dt);
  }

  function extractEditionNumber(edition) {
    if (!edition) {
      return '--';
    }

    const fromName = String(edition.name || '').match(/(\d+)/);
    if (fromName) {
      return fromName[1];
    }

    const fromId = String(edition.id || '').match(/(\d{2})$/);
    return fromId ? fromId[1] : '--';
  }

  function updateEditionMeta() {
    if (editionNumber) {
      editionNumber.textContent = `Edizione ${extractEditionNumber(selectedEdition)}`;
    }

    if (editionDate) {
      const parsedDate = parseEditionDate(selectedEdition);
      editionDate.textContent = formatItalianDate(parsedDate);
      editionDate.setAttribute('datetime', parsedDate || '');
    }
  }

  function getRssMatch(article) {
    const articleUrl = normalizeUrl(article.url);
    const articleTitle = normalizeText(stripHtml(article.titleNormalized || article.title));

    if (articleUrl) {
      const byUrl = rssItems.find((item) => normalizeUrl(item.link) === articleUrl);
      if (byUrl) {
        return byUrl;
      }
    }

    const exactTitle = rssItems.find((item) => (
      normalizeText(stripHtml(item.titleNormalized || item.title)) === articleTitle
    ));
    if (exactTitle) {
      return exactTitle;
    }

    const byContains = rssItems.find((item) => {
      const rssTitle = normalizeText(stripHtml(item.titleNormalized || item.title));
      return rssTitle.includes(articleTitle) || articleTitle.includes(rssTitle);
    });
    return byContains || null;
  }

  function buildArticleMeta(article) {
    const rssMatch = getRssMatch(article);

    const description = stripHtml(rssMatch?.description || '');

    if (description) {
      return description.length > 190
        ? `${description.slice(0, 187)}...`
        : description;
    }

    return 'Descrizione non disponibile nel feed RSS.';
  }

  function updateFilmstripToggleButton() {
    if (!filmstripToggle) {
      return;
    }
    filmstripToggle.textContent = isFilmstripVisible ? 'Miniature ON' : 'Miniature OFF';
    filmstripToggle.classList.toggle('is-active', isFilmstripVisible);
  }

  function closeArticleDialog() {
    if (articleDialog?.open) {
      articleDialog.close();
    }
  }

  function openArticleDialog() {
    if (!articleDialog || articleDialog.open || !selectedArticle) {
      return;
    }
    articleDialog.showModal();
  }

  function updateArticleDialog(article) {
    if (!articleDialogTitle || !articleDialogBody || !articleDialogLink) {
      return;
    }

    if (!article) {
      articleDialogTitle.textContent = 'Articolo';
      articleDialogBody.textContent = 'Seleziona un area mappata per aprire il testo in finestra.';
      articleDialogLink.hidden = true;
      articleDialogLink.href = '#';
      return;
    }

    const rssMatch = getRssMatch(article);
    const cleanTitle = stripHtml(article.title);
    const description = stripHtml(rssMatch?.description || '');

    articleDialogTitle.textContent = cleanTitle || 'Articolo';
    articleDialogBody.textContent = description || 'Descrizione non disponibile nel feed RSS.';

    const link = String(article.url || rssMatch?.link || '').trim();
    if (link) {
      articleDialogLink.hidden = false;
      articleDialogLink.href = link;
    } else {
      articleDialogLink.hidden = true;
      articleDialogLink.href = '#';
    }
  }

  function setFilmstripVisible(isVisible) {
    isFilmstripVisible = Boolean(isVisible);
    filmstrip?.classList.toggle('is-hidden', !isFilmstripVisible);
    updateFilmstripToggleButton();
    schedulePersistReaderState();
  }

  function setSelectedArticle(article) {
    selectedArticle = article || null;
    updateArticleDialog(selectedArticle);
  }

  function getPersistedReaderState() {
    try {
      const raw = localStorage.getItem(READER_STATE_KEY);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function persistReaderState() {
    try {
      const payload = {
        editionId: selectedEditionId,
        currentPage,
        zoomScaleFactor,
        fitMode,
        selectedMappedArticleId,
        isFilmstripVisible
      };
      localStorage.setItem(READER_STATE_KEY, JSON.stringify(payload));
    } catch (error) {
      // Ignora errori localStorage.
    }
  }

  function schedulePersistReaderState() {
    if (persistTimer) {
      window.clearTimeout(persistTimer);
    }
    persistTimer = window.setTimeout(() => {
      persistTimer = null;
      persistReaderState();
    }, 120);
  }

  function applyRestoredArticleState() {
    if (!pendingRestoredState?.selectedMappedArticleId) {
      setSelectedArticle(null);
      return;
    }

    const matched = mappings.find((item) => item.id === pendingRestoredState.selectedMappedArticleId) || null;
    if (!matched) {
      return;
    }

    selectedMappedArticleId = matched.id;
    setSelectedArticle(matched);
    renderMappedList();
  }

  function parseRssItems(xmlText) {
    const xmlDoc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      return [];
    }

    return Array.from(xmlDoc.querySelectorAll('item'))
      .slice(0, 150)
      .map((item) => ({
        title: stripHtml(item.querySelector('title')?.textContent || ''),
        description: stripHtml(
          item.querySelector('description')?.textContent
          || item.querySelector('content\\:encoded')?.textContent
          || ''
        ),
        link: (item.querySelector('link')?.textContent || '').trim(),
        pubDate: (item.querySelector('pubDate')?.textContent || '').trim()
      }))
      .filter((item) => Boolean(item.title));
  }

  async function fetchRssXml() {
    const urls = [
      '/api/rss-live',
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

    return '';
  }

  async function refreshRssDescriptionsIfMissing(editionId) {
    if (!editionId || !window.OrDataStore) {
      return;
    }

    const missingCount = rssItems.filter((item) => stripHtml(item.description || '').length === 0).length;
    if (rssItems.length > 0 && missingCount === 0) {
      return;
    }

    const xml = await fetchRssXml();
    if (!xml) {
      return;
    }

    const parsed = parseRssItems(xml);
    if (parsed.length === 0) {
      return;
    }

    const mergedMap = new Map();

    rssItems.forEach((item) => {
      const key = normalizeUrl(item.link) || `t:${normalizeText(stripHtml(item.titleNormalized || item.title))}`;
      mergedMap.set(key, { ...item });
    });

    parsed.forEach((item) => {
      const key = normalizeUrl(item.link) || `t:${normalizeText(stripHtml(item.titleNormalized || item.title))}`;
      const existing = mergedMap.get(key);
      if (!existing) {
        mergedMap.set(key, { ...item });
        return;
      }

      mergedMap.set(key, {
        ...existing,
        title: existing.title || item.title,
        titleNormalized: existing.titleNormalized || item.titleNormalized,
        description: stripHtml(existing.description || '') || item.description || '',
        link: existing.link || item.link || '',
        pubDate: existing.pubDate || item.pubDate || ''
      });
    });

    rssItems = Array.from(mergedMap.values());

    try {
      await window.OrDataStore.upsertRssItems(editionId, parsed);
    } catch (error) {
      // Mantiene i dati in memoria anche con schema backend non aggiornato.
    }
  }

  function updateFilmstripActive() {
    if (!filmstripList) {
      return;
    }

    const buttons = filmstripList.querySelectorAll('button[data-page]');
    buttons.forEach((button) => {
      const page = Number(button.dataset.page || 0);
      button.classList.toggle('is-active', page === currentPage);
    });
  }

  async function goToPage(targetPage) {
    if (!pdfDocument) {
      return;
    }

    const nextPage = Math.max(1, Math.min(maxPage, Number(targetPage) || 1));
    if (nextPage === currentPage) {
      return;
    }

    currentPage = nextPage;
    await renderPdf();
    updateFilmstripActive();
    schedulePersistReaderState();
  }

  async function renderFilmstrip() {
    if (!filmstrip || !filmstripList || !pdfDocument) {
      return;
    }

    filmstrip.classList.toggle('is-hidden', !isFilmstripVisible);
    filmstripList.innerHTML = '';

    for (let pageNumber = 1; pageNumber <= maxPage; pageNumber += 1) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'or-filmstrip__item';
      button.dataset.page = String(pageNumber);
      button.innerHTML = `<span class="or-filmstrip__thumb-wrap"><canvas class="or-filmstrip__thumb" width="74" height="98"></canvas></span><span class="or-filmstrip__num">${pageNumber}</span>`;
      button.addEventListener('click', () => {
        goToPage(pageNumber);
      });

      li.appendChild(button);
      filmstripList.appendChild(li);
    }

    updateFilmstripActive();
    updateFilmstripToggleButton();

    for (let pageNumber = 1; pageNumber <= maxPage; pageNumber += 1) {
      const button = filmstripList.querySelector(`button[data-page="${pageNumber}"]`);
      const canvasThumb = button?.querySelector('canvas');
      if (!button || !canvasThumb) {
        continue;
      }

      if (thumbCache.has(pageNumber)) {
        const image = thumbCache.get(pageNumber);
        const thumbCtx = canvasThumb.getContext('2d');
        thumbCtx?.drawImage(image, 0, 0, canvasThumb.width, canvasThumb.height);
        continue;
      }

      try {
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 0.18 });
        const offscreen = document.createElement('canvas');
        offscreen.width = Math.max(1, Math.floor(viewport.width));
        offscreen.height = Math.max(1, Math.floor(viewport.height));

        const offCtx = offscreen.getContext('2d');
        if (!offCtx) {
          continue;
        }

        await page.render({ canvasContext: offCtx, viewport }).promise;
        thumbCache.set(pageNumber, offscreen);

        const thumbCtx = canvasThumb.getContext('2d');
        thumbCtx?.clearRect(0, 0, canvasThumb.width, canvasThumb.height);
        thumbCtx?.drawImage(offscreen, 0, 0, canvasThumb.width, canvasThumb.height);
      } catch (error) {
        // Ignora errori miniatura singola.
      }
    }
  }

  function setEditionStatus(message, isError = false) {
    if (!editionStatus) {
      return;
    }
    editionStatus.textContent = message;
    editionStatus.style.color = isError ? '#8d1f1f' : '';
  }

  function setMappedStatus(message, isError = false) {
    if (!mappedStatus) {
      return;
    }
    mappedStatus.textContent = message;
    mappedStatus.style.color = isError ? '#8d1f1f' : '';
  }

  function setPdfHint(message, isError = false) {
    if (!pdfHint) {
      return;
    }
    pdfHint.textContent = message;
    pdfHint.style.color = isError ? '#8d1f1f' : '';
  }

  function setLoadingEditionState(isLoading) {
    isLoadingEdition = isLoading;
    if (editionSelect) {
      editionSelect.disabled = isLoading;
    }
    if (fitButton) {
      fitButton.disabled = isLoading || isZoomAnimating;
    }
    if (zoomButton) {
      zoomButton.disabled = isLoading || isZoomAnimating;
    }
  }

  function setPdfLoadingState(isLoading, message = 'Caricamento PDF...') {
    if (!pdfLoader) {
      return;
    }

    pdfLoader.classList.toggle('is-hidden', !isLoading);
    if (pdfLoaderText) {
      pdfLoaderText.textContent = message;
    }
  }

  function clampZoom(value) {
    return Math.min(4, Math.max(1, value));
  }

  function updateToolbarLabels() {
    if (fitButton) {
      fitButton.textContent = fitMode === 'page' ? 'Fit pagina' : 'Fit larghezza';
    }

    if (zoomButton) {
      zoomButton.textContent = `Zoom ${Math.round(zoomScaleFactor * 100)}%`;
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function getDevicePixelRatio() {
    return Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function bindSingleAndDoubleClick(element, onSingle, onDouble, delay = 230) {
    let clickTimer = null;

    element.addEventListener('click', () => {
      if (clickTimer) {
        window.clearTimeout(clickTimer);
        clickTimer = null;
        onDouble();
        return;
      }

      clickTimer = window.setTimeout(() => {
        clickTimer = null;
        onSingle();
      }, delay);
    });
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

  function drawMappedHighlights() {
    if (!highlightLayer) {
      return;
    }

    highlightLayer.innerHTML = '';

    if (!activeFocusRegion || activeFocusRegion.page !== currentPage) {
      return;
    }

    const regionsOnCurrentPage = activeFocusRegions
      .filter((region) => region.page === currentPage);

    if (regionsOnCurrentPage.length === 0) {
      return;
    }

    // Oscura tutta la pagina lasciando finestre trasparenti esattamente sulle aree selezionate.
    // Usa una mask SVG (non even-odd) per evitare ri-oscuramenti nelle intersezioni.
    const svgNS = 'http://www.w3.org/2000/svg';
    const dimmer = document.createElementNS(svgNS, 'svg');
    dimmer.setAttribute('class', 'or-pdf-focus-dimmer');
    dimmer.setAttribute('viewBox', '0 0 100 100');
    dimmer.setAttribute('preserveAspectRatio', 'none');

    const defs = document.createElementNS(svgNS, 'defs');
    const mask = document.createElementNS(svgNS, 'mask');
    const maskId = `or-focus-mask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    mask.setAttribute('id', maskId);

    const maskBg = document.createElementNS(svgNS, 'rect');
    maskBg.setAttribute('x', '0');
    maskBg.setAttribute('y', '0');
    maskBg.setAttribute('width', '100');
    maskBg.setAttribute('height', '100');
    maskBg.setAttribute('fill', 'white');
    mask.appendChild(maskBg);

    regionsOnCurrentPage.forEach((region) => {
      const x = region.rect.x * 100;
      const y = region.rect.y * 100;
      const w = region.rect.w * 100;
      const h = region.rect.h * 100;
      const hole = document.createElementNS(svgNS, 'rect');
      hole.setAttribute('x', String(x));
      hole.setAttribute('y', String(y));
      hole.setAttribute('width', String(w));
      hole.setAttribute('height', String(h));
      hole.setAttribute('fill', 'black');
      mask.appendChild(hole);
    });

    defs.appendChild(mask);
    dimmer.appendChild(defs);

    const overlay = document.createElementNS(svgNS, 'rect');
    overlay.setAttribute('x', '0');
    overlay.setAttribute('y', '0');
    overlay.setAttribute('width', '100');
    overlay.setAttribute('height', '100');
    overlay.setAttribute('fill', 'rgba(12, 17, 26, 0.5)');
    overlay.setAttribute('mask', `url(#${maskId})`);
    dimmer.appendChild(overlay);

    highlightLayer.appendChild(dimmer);

    regionsOnCurrentPage.forEach((region) => {
      const spot = document.createElement('div');
      spot.className = 'or-pdf-focus-spot';
      spot.style.left = `${region.rect.x * 100}%`;
      spot.style.top = `${region.rect.y * 100}%`;
      spot.style.width = `${region.rect.w * 100}%`;
      spot.style.height = `${region.rect.h * 100}%`;
      highlightLayer.appendChild(spot);
    });
  }

  function sortRegions(regions) {
    return regions.slice().sort((a, b) => {
      if (a.page !== b.page) {
        return a.page - b.page;
      }
      if (a.rect.y !== b.rect.y) {
        return a.rect.y - b.rect.y;
      }
      if (a.rect.x !== b.rect.x) {
        return a.rect.x - b.rect.x;
      }
      return b.rect.w - a.rect.w;
    });
  }

  function mergeRegions(regions) {
    if (!regions || regions.length === 0) {
      return null;
    }

    const minX = Math.min(...regions.map((region) => region.rect.x));
    const minY = Math.min(...regions.map((region) => region.rect.y));
    const maxX = Math.max(...regions.map((region) => region.rect.x + region.rect.w));
    const maxY = Math.max(...regions.map((region) => region.rect.y + region.rect.h));

    return {
      id: `group-${regions.map((region) => region.id || 'r').join('-')}`,
      page: regions[0].page,
      rect: {
        x: minX,
        y: minY,
        w: Math.max(0.001, maxX - minX),
        h: Math.max(0.001, maxY - minY)
      }
    };
  }

  function sameRegion(a, b) {
    if (!a || !b) {
      return false;
    }

    if (a.id && b.id) {
      return a.id === b.id;
    }

    return (
      a.page === b.page
      && a.rect.x === b.rect.x
      && a.rect.y === b.rect.y
      && a.rect.w === b.rect.w
      && a.rect.h === b.rect.h
    );
  }

  function rectsTouchOrOverlap(rectA, rectB, pad = 0.002) {
    const aLeft = rectA.x - pad;
    const aTop = rectA.y - pad;
    const aRight = rectA.x + rectA.w + pad;
    const aBottom = rectA.y + rectA.h + pad;

    const bLeft = rectB.x - pad;
    const bTop = rectB.y - pad;
    const bRight = rectB.x + rectB.w + pad;
    const bBottom = rectB.y + rectB.h + pad;

    return !(aRight < bLeft || bRight < aLeft || aBottom < bTop || bBottom < aTop);
  }

  function getConnectedCluster(regions, seedRegion) {
    if (!regions || regions.length === 0) {
      return [];
    }

    const seed = seedRegion
      ? regions.find((region) => sameRegion(region, seedRegion)) || regions[0]
      : regions[0];

    const stack = [seed];
    const cluster = [];
    const visited = new Set();

    while (stack.length > 0) {
      const current = stack.pop();
      const key = current.id || `${current.page}:${current.rect.x}:${current.rect.y}:${current.rect.w}:${current.rect.h}`;

      if (visited.has(key)) {
        continue;
      }

      visited.add(key);
      cluster.push(current);

      regions.forEach((candidate) => {
        const candidateKey = candidate.id || `${candidate.page}:${candidate.rect.x}:${candidate.rect.y}:${candidate.rect.w}:${candidate.rect.h}`;
        if (visited.has(candidateKey)) {
          return;
        }

        if (rectsTouchOrOverlap(current.rect, candidate.rect)) {
          stack.push(candidate);
        }
      });
    }

    return sortRegions(cluster);
  }

  function getFocusGroupForArticle(article, preferredPage = null, seedRegion = null) {
    const ordered = sortRegions(article.regions || []);
    if (ordered.length === 0) {
      return { focusRegion: null, regions: [], selectedCount: 0, totalCount: 0 };
    }

    const targetPage = preferredPage || seedRegion?.page || ordered[0].page;
    const pageRegions = ordered.filter((region) => region.page === targetPage);
    const grouped = getConnectedCluster(pageRegions, seedRegion);
    const focusRegion = mergeRegions(grouped);

    return {
      focusRegion,
      regions: grouped,
      selectedCount: grouped.length,
      totalCount: ordered.length
    };
  }

  function setTextPreview(article, regionInfo = null) {
    if (textPreviewLead) {
      if (!article) {
        textPreviewLead.textContent = 'Seleziona un titolo per aprire il focus e vedere l\'anteprima.';
      } else {
        const suffix = regionInfo && regionInfo.totalCount > 1
          ? `Rettangoli in focus: ${regionInfo.selectedCount}/${regionInfo.totalCount}`
          : 'Area selezionata';
        textPreviewLead.textContent = `${article.title} - ${suffix}`;
      }
    }

    if (textPreviewBody) {
      textPreviewBody.textContent = LOREM_IPSUM_PREVIEW;
      textPreviewBody.classList.remove('is-refresh');
      window.requestAnimationFrame(() => {
        textPreviewBody.classList.add('is-refresh');
      });
    }

    if (textPreviewLink) {
      if (article?.url) {
        textPreviewLink.href = article.url;
        textPreviewLink.hidden = false;
      } else {
        textPreviewLink.href = '#';
        textPreviewLink.hidden = true;
      }
    }
  }

  function setArticleTextHint(article, regionInfo = null) {
    if (!searchResult) {
      return;
    }

    if (article?.url) {
      const suffix = regionInfo && regionInfo.totalCount > 1
        ? `Rettangoli attivi: ${regionInfo.selectedCount}/${regionInfo.totalCount}. `
        : 'Area selezionata. ';
      searchResult.innerHTML = `${suffix}<a class="or-inline-article-link" href="${article.url}" target="_blank" rel="noopener">Apri versione testuale</a>.`;
      return;
    }

    searchResult.textContent = 'Area selezionata. Versione testuale non disponibile.';
  }

  function updateMinimap() {
    if (!minimap || !minimapCanvas || !stage || !canvas || !minimapViewport) {
      return;
    }

    if (!pdfDocument || canvas.clientWidth <= 0 || canvas.clientHeight <= 0) {
      minimap.classList.add('is-hidden');
      return;
    }

    minimap.classList.remove('is-hidden');

    const miniCtx = minimapCanvas.getContext('2d');
    if (!miniCtx) {
      return;
    }

    const miniWidth = minimapCanvas.width;
    const miniHeight = minimapCanvas.height;

    miniCtx.clearRect(0, 0, miniWidth, miniHeight);
    miniCtx.fillStyle = '#eef2f8';
    miniCtx.fillRect(0, 0, miniWidth, miniHeight);
    miniCtx.drawImage(canvas, 0, 0, miniWidth, miniHeight);

    if (activeFocusRegion && activeFocusRegion.page === currentPage) {
      const fx = activeFocusRegion.rect.x * miniWidth;
      const fy = activeFocusRegion.rect.y * miniHeight;
      const fw = Math.max(4, activeFocusRegion.rect.w * miniWidth);
      const fh = Math.max(4, activeFocusRegion.rect.h * miniHeight);
      miniCtx.fillStyle = 'rgba(252, 215, 84, 0.22)';
      miniCtx.strokeStyle = '#c28509';
      miniCtx.lineWidth = 2;
      miniCtx.fillRect(fx, fy, fw, fh);
      miniCtx.strokeRect(fx, fy, fw, fh);
    }

    const contentW = canvas.clientWidth;
    const contentH = canvas.clientHeight;
    const viewportX = (stage.scrollLeft / contentW) * miniWidth;
    const viewportY = (stage.scrollTop / contentH) * miniHeight;
    const viewportW = Math.max(12, (stage.clientWidth / contentW) * miniWidth);
    const viewportH = Math.max(12, (stage.clientHeight / contentH) * miniHeight);

    minimapViewport.style.left = `${viewportX}px`;
    minimapViewport.style.top = `${viewportY}px`;
    minimapViewport.style.width = `${viewportW}px`;
    minimapViewport.style.height = `${viewportH}px`;

    if (minimapLabel) {
      minimapLabel.textContent = `Pagina ${currentPage}/${maxPage}`;
    }
  }

  function scrollToRegion(region) {
    if (!stage || !region || region.page !== currentPage) {
      return;
    }

    const centerX = (region.rect.x + region.rect.w / 2) * canvas.width;
    const centerY = (region.rect.y + region.rect.h / 2) * canvas.height;

    const left = Math.max(0, centerX - stage.clientWidth / 2);
    const top = Math.max(0, centerY - stage.clientHeight / 2);

    stage.scrollTo({ left, top, behavior: 'smooth' });
  }

  function scrollToRegionPrecise(region) {
    if (!stage || !region || region.page !== currentPage) {
      return;
    }

    const centerX = (region.rect.x + region.rect.w / 2) * canvas.width;
    const centerY = (region.rect.y + region.rect.h / 2) * canvas.height;

    const targetLeft = centerX - stage.clientWidth / 2;
    const targetTop = centerY - stage.clientHeight / 2;

    const maxLeft = Math.max(0, canvas.width - stage.clientWidth);
    const maxTop = Math.max(0, canvas.height - stage.clientHeight);

    stage.scrollTo({
      left: Math.max(0, Math.min(targetLeft, maxLeft)),
      top: Math.max(0, Math.min(targetTop, maxTop)),
      behavior: 'auto'
    });
  }

  function clampScrollToFocusRegion() {
    if (
      !stage ||
      !activeFocusRegion ||
      activeFocusRegion.page !== currentPage ||
      !isMagnetFocusEnabled ||
      isMagnetBypassActive
    ) {
      return;
    }

    const centerX = (activeFocusRegion.rect.x + activeFocusRegion.rect.w / 2) * canvas.width;
    const centerY = (activeFocusRegion.rect.y + activeFocusRegion.rect.h / 2) * canvas.height;
    const regionWidth = Math.max(12, activeFocusRegion.rect.w * canvas.width);
    const regionHeight = Math.max(12, activeFocusRegion.rect.h * canvas.height);

    const centerLeft = centerX - stage.clientWidth / 2;
    const centerTop = centerY - stage.clientHeight / 2;

    const driftX = Math.max(stage.clientWidth * 0.22, regionWidth * 0.8);
    const driftYDown = Math.max(stage.clientHeight * 0.34, regionHeight * 1.05);

    const absMaxLeft = Math.max(0, canvas.width - stage.clientWidth);
    const absMaxTop = Math.max(0, canvas.height - stage.clientHeight);

    const minLeft = Math.max(0, centerLeft - driftX);
    const maxLeft = Math.min(absMaxLeft, centerLeft + driftX);
    // Mantiene il vincolo verso il basso ma lascia liberta di risalire verso l'alto.
    const minTop = 0;
    const maxTop = Math.min(absMaxTop, centerTop + driftYDown);

    const clampedLeft = Math.max(minLeft, Math.min(stage.scrollLeft, maxLeft));
    const clampedTop = Math.max(minTop, Math.min(stage.scrollTop, maxTop));

    if (Math.abs(clampedLeft - stage.scrollLeft) < 1 && Math.abs(clampedTop - stage.scrollTop) < 1) {
      return;
    }

    isApplyingMagnetScroll = true;
    stage.scrollTo({ left: clampedLeft, top: clampedTop, behavior: 'auto' });
    isApplyingMagnetScroll = false;
  }

  function drawPageHitAreas() {
    if (!hitLayer) {
      return;
    }

    hitLayer.innerHTML = '';

    mappings.forEach((article) => {
      article.regions
        .filter((region) => region.page === currentPage)
        .forEach((region) => {
          const groupInfo = getFocusGroupForArticle(article, region.page, region);

          const hit = document.createElement('button');
          hit.type = 'button';
          hit.className = 'or-pdf-hit';
          hit.style.left = `${region.rect.x * 100}%`;
          hit.style.top = `${region.rect.y * 100}%`;
          hit.style.width = `${region.rect.w * 100}%`;
          hit.style.height = `${region.rect.h * 100}%`;
          hit.title = `${article.title} - Click: apri testo articolo.`;

          hit.addEventListener('click', () => {
            selectedMappedArticleId = article.id;
            setSelectedArticle(article);
            activeFocusRegion = groupInfo.focusRegion;
            activeFocusRegions = groupInfo.regions;
            isMagnetFocusEnabled = true;
            drawMappedHighlights();
            updateMinimap();
            renderMappedList();
            setArticleTextHint(article, groupInfo);
            setTextPreview(article, groupInfo);
            openArticleDialog();
          });

          hitLayer.appendChild(hit);
        });
    });
  }

  async function renderPdf(focusRegion = null) {
    if (!pdfDocument || !ctx) {
      return;
    }

    currentPage = Math.min(Math.max(1, currentPage), maxPage);

    const token = renderToken + 1;
    renderToken = token;

    stage?.classList.add('is-rendering');

    const page = await pdfDocument.getPage(currentPage);
    const baseViewport = page.getViewport({ scale: 1 });

    const stageWidth = Math.max(320, (stage?.clientWidth || 980) - 14);
    const stageHeight = Math.max(320, (stage?.clientHeight || Math.floor(window.innerHeight * 0.75)) - 14);

    fitPageScale = Math.min(stageWidth / baseViewport.width, stageHeight / baseViewport.height);
    fitWidthScale = stageWidth / baseViewport.width;
    const baseScale = fitMode === 'width' ? fitWidthScale : fitPageScale;
    renderedTotalScale = baseScale * zoomScaleFactor;
    const viewport = page.getViewport({ scale: renderedTotalScale });

    if (token !== renderToken) {
      return;
    }

    const cssWidth = Math.floor(viewport.width);
    const cssHeight = Math.floor(viewport.height);
    const dpr = getDevicePixelRatio();

    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (highlightLayer) {
      highlightLayer.style.width = `${cssWidth}px`;
      highlightLayer.style.height = `${cssHeight}px`;
    }

    if (hitLayer) {
      hitLayer.style.width = `${cssWidth}px`;
      hitLayer.style.height = `${cssHeight}px`;
    }

    await page.render({ canvasContext: ctx, viewport }).promise;

    if (token !== renderToken) {
      return;
    }

    if (viewerLabel) {
      viewerLabel.textContent = `${selectedEdition?.name || 'Edizione'} - Pagina ${currentPage}/${maxPage} - ${Math.round(zoomScaleFactor * 100)}%`;
    }

    updateToolbarLabels();

    drawMappedHighlights();
    drawPageHitAreas();
    updateMinimap();
    updateFilmstripActive();
    schedulePersistReaderState();

    if (focusRegion && focusRegion.page === currentPage) {
      window.requestAnimationFrame(() => {
        scrollToRegion(focusRegion);
        clampScrollToFocusRegion();
      });
    } else if (zoomScaleFactor === 1 && stage) {
      stage.scrollTo({ left: 0, top: 0, behavior: 'auto' });
      isMagnetFocusEnabled = false;
    } else if (isMagnetFocusEnabled) {
      window.requestAnimationFrame(() => {
        clampScrollToFocusRegion();
      });
    }

    const nextPage = currentPage + 1;
    if (pdfDocument && nextPage <= maxPage && !pageCache.has(nextPage)) {
      pdfDocument.getPage(nextPage).then((pageProxy) => {
        pageCache.set(nextPage, pageProxy);
      }).catch(() => {
        // Ignora errori di prefetch.
      });
    }

    window.setTimeout(() => {
      stage?.classList.remove('is-rendering');
    }, 140);
  }

  async function cinematicZoomToRegion(region) {
    if (!region || isZoomAnimating) {
      return;
    }

    isZoomAnimating = true;
    setLoadingEditionState(true);

    try {
      if (currentPage !== region.page) {
        currentPage = region.page;
      }

      activeFocusRegion = region;

      await renderPdf(region);
      await animateZoomTo(2.22, region, 340);

      if (searchResult) {
        searchResult.textContent = 'Zoom sul punto dell\'articolo.';
      }
    } finally {
      isZoomAnimating = false;
      setLoadingEditionState(false);
    }
  }

  async function readabilityZoomToRegion(region) {
    if (!region || isZoomAnimating) {
      return;
    }

    isZoomAnimating = true;
    setLoadingEditionState(true);

    try {
      if (currentPage !== region.page) {
        currentPage = region.page;
      }

      activeFocusRegion = region;
      isMagnetFocusEnabled = true;

      await renderPdf(region);
      await animateZoomTo(2.65, region, 220);

      // Stabilizza il centro dell'area dopo l'animazione per mantenere il focus esatto.
      scrollToRegionPrecise(region);
      await sleep(24);
      scrollToRegionPrecise(region);
      clampScrollToFocusRegion();
    } finally {
      isZoomAnimating = false;
      setLoadingEditionState(false);
    }
  }

  async function animateZoomTo(targetScale, region, durationMs = 260) {
    const startScale = zoomScaleFactor;
    const finalScale = clampZoom(targetScale);
    const startAt = performance.now();

    while (true) {
      const elapsed = performance.now() - startAt;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(t);

      zoomScaleFactor = startScale + (finalScale - startScale) * eased;
      await renderPdf(region);

      if (t >= 1) {
        break;
      }

      await sleep(16);
    }
  }

  async function zoomAtPointer(nextZoom, clientX, clientY) {
    if (!stage || !pdfDocument) {
      return;
    }

    const previousTotal = renderedTotalScale || 1;
    const stageRect = stage.getBoundingClientRect();
    const anchorX = stage.scrollLeft + (clientX - stageRect.left);
    const anchorY = stage.scrollTop + (clientY - stageRect.top);

    zoomScaleFactor = clampZoom(nextZoom);
    await renderPdf();

    const ratio = (renderedTotalScale || 1) / previousTotal;
    const nextAnchorX = anchorX * ratio;
    const nextAnchorY = anchorY * ratio;

    stage.scrollTo({
      left: Math.max(0, nextAnchorX - (clientX - stageRect.left)),
      top: Math.max(0, nextAnchorY - (clientY - stageRect.top)),
      behavior: 'auto'
    });
  }

  function renderMappedList() {
    if (!mappedList) {
      return;
    }

    mappedList.innerHTML = '';

    if (mappings.length === 0) {
      setMappedStatus('Nessuna mappatura trovata per questa edizione.');
      setSelectedArticle(null);
      return;
    }

    setMappedStatus(`Titoli disponibili: ${mappings.length}.`);

    mappings.forEach((article) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'or-rss-linker__item-btn';
      if (article.id === selectedMappedArticleId) {
        button.classList.add('is-active');
      }
      const displayTitle = stripHtml(article.title);
      const metaLabel = buildArticleMeta(article);
      button.innerHTML = `<span class="or-rss-linker__item-title">${escapeHtml(displayTitle)}</span><small>${escapeHtml(metaLabel)}</small>`;
      bindSingleAndDoubleClick(
        button,
        () => {
          selectedMappedArticleId = article.id;
          setSelectedArticle(article);
          renderMappedList();
          const groupInfo = getFocusGroupForArticle(article);
          if (groupInfo.focusRegion) {
            activeFocusRegion = groupInfo.focusRegion;
            activeFocusRegions = groupInfo.regions;
            isMagnetFocusEnabled = true;
            cinematicZoomToRegion(groupInfo.focusRegion);
            setArticleTextHint(article, groupInfo);
            setTextPreview(article, groupInfo);
            setMobileListOpen(false);
          }
        },
        () => {
          selectedMappedArticleId = article.id;
          setSelectedArticle(article);
          renderMappedList();
          const groupInfo = getFocusGroupForArticle(article);
          if (groupInfo.focusRegion) {
            activeFocusRegion = groupInfo.focusRegion;
            activeFocusRegions = groupInfo.regions;
            isMagnetFocusEnabled = true;
            readabilityZoomToRegion(groupInfo.focusRegion);
            setArticleTextHint(article, groupInfo);
            setTextPreview(article, groupInfo);
            setMobileListOpen(false);
          }
        }
      );
      li.appendChild(button);
      mappedList.appendChild(li);
    });
  }

  async function loadPdfForEdition() {
    if (!selectedEdition?.pdfPath) {
      pdfDocument = null;
      maxPage = 1;
      setPdfHint('PDF non configurato per questa edizione.', true);
      minimap?.classList.add('is-hidden');
      filmstrip?.classList.add('is-hidden');
      setPdfLoadingState(false);
      return;
    }

    setPdfLoadingState(true, 'Caricamento PDF...');

    const hasPdfJs = await ensurePdfJsLoaded();
    if (!hasPdfJs || !window.pdfjsLib) {
      setPdfHint('PDF.js non disponibile: CDN non raggiungibili.', true);
      minimap?.classList.add('is-hidden');
      filmstrip?.classList.add('is-hidden');
      setPdfLoadingState(false);
      return;
    }

    window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

    const path = selectedEdition.pdfPath;

    try {
      setPdfLoadingState(true, 'Verifica risorsa PDF...');
      const head = await fetch(path, { method: 'HEAD', cache: 'no-store' });
      if (!head.ok) {
        throw new Error('PDF non trovato');
      }

      setPdfLoadingState(true, 'Rendering pagina...');
      pdfDocument = await window.pdfjsLib.getDocument(path).promise;
      maxPage = pdfDocument.numPages;
      currentPage = 1;
      zoomScaleFactor = 1;
      activeFocusRegion = null;
      activeFocusRegions = [];
      isMagnetFocusEnabled = false;
      fitMode = 'page';
      pageCache.clear();
      thumbCache.clear();

      if (stage) {
        stage.classList.remove('is-hidden');
      }

      setPdfHint(`PDF collegato: ${path}`);
      if (pendingRestoredState) {
        currentPage = Math.max(1, Math.min(maxPage, Number(pendingRestoredState.currentPage) || 1));
        zoomScaleFactor = clampZoom(Number(pendingRestoredState.zoomScaleFactor) || 1);
        fitMode = pendingRestoredState.fitMode === 'width' ? 'width' : 'page';
        setFilmstripVisible(Boolean(pendingRestoredState.isFilmstripVisible));
      }

      await renderPdf();
      await renderFilmstrip();
      applyRestoredArticleState();
      setPdfLoadingState(false);
    } catch (error) {
      pdfDocument = null;
      maxPage = 1;
      setPdfHint(`Errore caricamento PDF: ${error?.message || 'sconosciuto'}.`, true);
      minimap?.classList.add('is-hidden');
      filmstrip?.classList.add('is-hidden');
      setPdfLoadingState(false);
      if (stage) {
        stage.classList.add('is-hidden');
      }
    }
  }

  async function loadEditionData(editionId) {
    if (!editionId) {
      return;
    }

    setLoadingEditionState(true);

    try {
      selectedEditionId = editionId;
      selectedEdition = await window.OrDataStore.getEdition(editionId);

      if (!selectedEdition) {
        setEditionStatus('Edizione non trovata.', true);
        return;
      }

      if (editionSelect) {
        editionSelect.value = selectedEditionId;
      }

      updateEditionMeta();

      setEditionStatus(`Edizione attiva: ${selectedEdition.name}`);

      const persisted = getPersistedReaderState();
      pendingRestoredState = persisted && persisted.editionId === editionId ? persisted : null;

      mappings = await window.OrDataStore.listMappingsByEdition(editionId);
      try {
        rssItems = await window.OrDataStore.listRssItemsByEdition(editionId);
        try {
          await refreshRssDescriptionsIfMissing(editionId);
        } catch (error) {
          // Mantiene i dati RSS locali anche se l'aggiornamento feed fallisce.
        }
      } catch (error) {
        rssItems = [];
      }
      selectedMappedArticleId = '';
      activeFocusRegions = [];
      setSelectedArticle(null);
      setTextPreview(null);

      renderMappedList();
      await loadPdfForEdition();
    } catch (error) {
      setEditionStatus(`Errore caricamento edizione: ${error?.message || 'sconosciuto'}.`, true);
      setMappedStatus('Impossibile caricare le mappature.', true);
    } finally {
      setLoadingEditionState(false);
    }
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
      selectedEditionId = editions[editions.length - 1].id;
    }

    editionSelect.value = selectedEditionId;
  }

  zoomButton?.addEventListener('click', () => {
    if (isZoomAnimating) {
      return;
    }
    const target = zoomScaleFactor < 1.4 ? 1.8 : 1;
    if (target === 1) {
      isMagnetFocusEnabled = false;
      activeFocusRegion = null;
      activeFocusRegions = [];
    }
    animateZoomTo(target, null, 220);
    schedulePersistReaderState();
  });

  fitButton?.addEventListener('click', () => {
    if (isZoomAnimating) {
      return;
    }
    fitMode = fitMode === 'page' ? 'width' : 'page';
    zoomScaleFactor = 1;
    isMagnetFocusEnabled = false;
    activeFocusRegion = null;
    activeFocusRegions = [];
    renderPdf();
    schedulePersistReaderState();
  });

  stage?.addEventListener('wheel', (event) => {
    if (!pdfDocument || isZoomAnimating) {
      return;
    }

    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }

    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.14 : -0.14;
    const next = clampZoom(zoomScaleFactor + delta);
    zoomAtPointer(next, event.clientX, event.clientY);
  }, { passive: false });

  stage?.addEventListener('scroll', () => {
    if (isApplyingMagnetScroll || isZoomAnimating || !isMagnetFocusEnabled) {
      updateMinimap();
      return;
    }
    clampScrollToFocusRegion();
    updateMinimap();
  });

  stage?.addEventListener('touchstart', (event) => {
    const touch = event.touches?.[0];
    if (!touch) {
      return;
    }
    touchStartPoint = {
      x: touch.clientX,
      y: touch.clientY,
      ts: Date.now()
    };
  }, { passive: true });

  stage?.addEventListener('touchend', (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch || !touchStartPoint || !pdfDocument) {
      touchStartPoint = null;
      return;
    }

    const dx = touch.clientX - touchStartPoint.x;
    const dy = touch.clientY - touchStartPoint.y;
    const dt = Date.now() - touchStartPoint.ts;
    touchStartPoint = null;

    if (Math.abs(dx) < 60 || Math.abs(dy) > 44 || dt > 450 || zoomScaleFactor > 1.08) {
      return;
    }

    if (dx < 0) {
      goToPage(currentPage + 1);
    } else {
      goToPage(currentPage - 1);
    }
  }, { passive: true });

  minimapCanvas?.addEventListener('click', (event) => {
    if (!stage || !canvas || !pdfDocument || canvas.clientWidth <= 0 || canvas.clientHeight <= 0) {
      return;
    }

    const rect = minimapCanvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    const ratioX = clickX / rect.width;
    const ratioY = clickY / rect.height;

    const targetLeft = ratioX * canvas.clientWidth - stage.clientWidth / 2;
    const targetTop = ratioY * canvas.clientHeight - stage.clientHeight / 2;

    const maxLeft = Math.max(0, canvas.clientWidth - stage.clientWidth);
    const maxTop = Math.max(0, canvas.clientHeight - stage.clientHeight);

    stage.scrollTo({
      left: Math.max(0, Math.min(targetLeft, maxLeft)),
      top: Math.max(0, Math.min(targetTop, maxTop)),
      behavior: 'smooth'
    });
  });

  mobileListToggle?.addEventListener('click', () => {
    const isOpen = !document.body.classList.contains('or-mobile-list-collapsed');
    setMobileListOpen(!isOpen);
  });

  mobileListClose?.addEventListener('click', () => {
    const isOpen = !document.body.classList.contains('or-mobile-list-collapsed');
    setMobileListOpen(!isOpen);
  });

  mobileListBackdrop?.addEventListener('click', () => {
    setMobileListOpen(false);
  });

  filmstripToggle?.addEventListener('click', () => {
    setFilmstripVisible(!isFilmstripVisible);
  });

  articleDialogClose?.addEventListener('click', () => {
    closeArticleDialog();
  });

  articleDialog?.addEventListener('click', (event) => {
    if (event.target === articleDialog) {
      closeArticleDialog();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Shift') {
      isMagnetBypassActive = true;
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') {
      isMagnetBypassActive = false;
      clampScrollToFocusRegion();
    }
  });

  window.addEventListener('resize', () => {
    if (!isMobileLayout()) {
      setMobileListOpen(false);
    }

    if (!pdfDocument || isZoomAnimating) {
      return;
    }
    renderPdf();
  });

  editionSelect?.addEventListener('change', () => {
    if (isLoadingEdition) {
      return;
    }
    loadEditionData(editionSelect.value);
    schedulePersistReaderState();
  });

  async function bootstrap() {
    if (!window.OrDataStore) {
      setEditionStatus('Modulo datastore SQL non disponibile.', true);
      return;
    }

    try {
      setLoadingEditionState(true);
      await window.OrDataStore.initDefaults();
      await renderEditionSelect();

      if (!selectedEditionId) {
        setEditionStatus('Nessuna edizione configurata.', true);
        return;
      }

      await loadEditionData(selectedEditionId);
      updateFilmstripToggleButton();
      updateArticleDialog(null);

      if (isMobileLayout()) {
        setMobileListOpen(false);
      }
    } catch (error) {
      setEditionStatus(`Errore bootstrap: ${error?.message || 'sconosciuto'}.`, true);
    } finally {
      setLoadingEditionState(false);
    }
  }

  bootstrap();
})();
