const jumpButtons = document.querySelectorAll('[data-jump]');
const playerToggle = document.getElementById('player-toggle');
const playerStatus = document.getElementById('player-status');
const liveStatus = document.getElementById('live-status');
const liveFeedItems = document.querySelectorAll('#live-feed-list li');

jumpButtons.forEach((button) => {
  button.addEventListener('click', () => {
    document.getElementById(button.dataset.jump)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  });
});

if (playerToggle && playerStatus) {
  playerToggle.addEventListener('click', () => {
    const isPlaying = playerToggle.dataset.state === 'playing';

    if (isPlaying) {
      playerToggle.dataset.state = 'idle';
      playerToggle.textContent = 'Ascolta ora';
      playerStatus.textContent = 'Diretta disponibile';
      return;
    }

    playerToggle.dataset.state = 'playing';
    playerToggle.textContent = 'Metti in pausa';
    playerStatus.textContent = 'In ascolto adesso';
  });
}

if (liveStatus && liveFeedItems.length > 0) {
  let freshIndex = 0;
  const statuses = ['Segnale stabile', 'Nuovo aggiornamento', 'Feed in tempo reale'];

  window.setInterval(() => {
    liveFeedItems.forEach((item) => item.classList.remove('is-fresh'));
    liveFeedItems[freshIndex].classList.add('is-fresh');
    liveStatus.textContent = statuses[freshIndex % statuses.length];
    freshIndex = (freshIndex + 1) % liveFeedItems.length;
  }, 3200);
}

const orPdfCanvas = document.getElementById('or-pdf-canvas');

if (orPdfCanvas) {
  const orPdfCtx = orPdfCanvas.getContext('2d');
  const PDFJS_SOURCES = [
    {
      lib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.js',
      worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.js'
    },
    {
      lib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    },
    {
      lib: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
      worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
    },
    {
      lib: 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js',
      worker: 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
    }
  ];
  const orPdfStage = document.getElementById('or-pdf-stage');
  const orPdfHighlightLayer = document.getElementById('or-pdf-highlight-layer');
  const orPdfHitLayer = document.getElementById('or-pdf-hit-layer');
  const orViewerLabel = document.getElementById('or-viewer-label');
  const orPdfHint = document.getElementById('or-pdf-hint');
  const orSearchResult = document.getElementById('or-search-result');
  const orSearchForm = document.getElementById('or-search-form');
  const orSearchInput = document.getElementById('or-search-title');
  const orRssLoadButton = document.getElementById('or-rss-load');
  const orRssStatus = document.getElementById('or-rss-status');
  const orRssList = document.getElementById('or-rss-list');
  const orViewerFallback = document.getElementById('or-viewer-fallback');
  const orPrevPage = document.getElementById('or-prev-page');
  const orNextPage = document.getElementById('or-next-page');
  const orZoomToggle = document.getElementById('or-zoom-toggle');
  const orThumbButtons = document.querySelectorAll('.or-thumb[data-page]');
  const orMappedTitlesList = document.getElementById('or-mapped-titles-list');
  const orMappedStatus = document.getElementById('or-mapped-status');
  const params = new URLSearchParams(window.location.search);
  let pdfPath = 'assets/osservatore-edizione.pdf';
  let pdfPathResolved = false;
  const pdfCacheBust = Date.now();
  let currentPage = 1;
  let zoomMode = 'page-width';
  let pdfTextIndex = [];
  let hasPdfLoaded = false;
  let maxPage = orThumbButtons.length || 1;
  let mappedArticles = [];
  let selectedMappedArticleId = '';
  let pdfDocument = null;
  let renderToken = 0;
  let pdfWorkerSrc = PDFJS_SOURCES[0].worker;

  const withCacheBust = (path) => {
    if (!path) {
      return path;
    }
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}v=${pdfCacheBust}`;
  };

  const pathFromMappings = () => {
    try {
      const raw = window.localStorage.getItem('orPdfTitleMappings');
      if (!raw) {
        return '';
      }
      const parsed = JSON.parse(raw);
      const mappings = Array.isArray(parsed) ? parsed : parsed?.mappings;
      if (!Array.isArray(mappings) || mappings.length === 0) {
        return '';
      }
      return mappings.find((item) => item?.pdfPath)?.pdfPath || '';
    } catch (error) {
      return '';
    }
  };

  const resolvePdfPath = async () => {
    if (pdfPathResolved) {
      return pdfPath;
    }

    const fromQuery = (params.get('pdf') || '').trim();
    const fromMappings = pathFromMappings().trim();
    const candidates = [
      fromQuery,
      fromMappings,
      'assets/osservatore-edizione.pdf',
      'assets/osservatore-edizione2.pdf'
    ].filter(Boolean);

    for (const candidate of candidates) {
      try {
        const response = await fetch(withCacheBust(candidate), { method: 'HEAD', cache: 'no-store' });
        if (response.ok) {
          pdfPath = candidate;
          pdfPathResolved = true;
          return pdfPath;
        }
      } catch (error) {
        continue;
      }
    }

    pdfPathResolved = true;
    return pdfPath;
  };

  const normalizeText = (value) =>
    (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Script non raggiungibile: ${src}`));
      document.head.appendChild(script);
    });

  const ensurePdfJsLoaded = async () => {
    if (window.pdfjsLib) {
      return true;
    }

    for (const source of PDFJS_SOURCES) {
      try {
        await loadScript(source.lib);
        if (window.pdfjsLib) {
          pdfWorkerSrc = source.worker;
          return true;
        }
      } catch (error) {
        continue;
      }
    }

    return false;
  };

  const normalizeMappedArticles = () => {
    try {
      const raw = window.localStorage.getItem('orPdfTitleMappings');
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed?.mappings;
      if (!Array.isArray(list)) {
        return [];
      }

      return list
        .map((entry) => {
          if (!entry || !entry.title) {
            return null;
          }

          const regionsRaw = Array.isArray(entry.regions)
            ? entry.regions
            : entry.rect && typeof entry.page === 'number'
              ? [{ id: `legacy-${entry.id || entry.title}`, page: entry.page, rect: entry.rect }]
              : [];

          const regions = regionsRaw
            .filter((region) => region && typeof region.page === 'number' && region.rect)
            .map((region) => ({
              id: region.id || `region-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              page: Number(region.page),
              rect: {
                x: Number(region.rect.x || 0),
                y: Number(region.rect.y || 0),
                w: Number(region.rect.w || 0),
                h: Number(region.rect.h || 0)
              }
            }))
            .filter((region) => region.rect.w > 0 && region.rect.h > 0);

          if (regions.length === 0) {
            return null;
          }

          return {
            id: entry.id || `article-${normalizeText(entry.title)}`,
            title: entry.title,
            titleNormalized: entry.titleNormalized || normalizeText(entry.title),
            regions,
            url: entry.url || ''
          };
        })
        .filter(Boolean);
    } catch (error) {
      return [];
    }
  };

  const drawMappedHighlights = () => {
    if (!orPdfHighlightLayer) {
      return;
    }

    orPdfHighlightLayer.innerHTML = '';

    if (!selectedMappedArticleId) {
      return;
    }

    const selected = mappedArticles.find((item) => item.id === selectedMappedArticleId);
    if (!selected) {
      return;
    }

    selected.regions
      .filter((region) => region.page === currentPage)
      .forEach((region) => {
        const rect = document.createElement('div');
        rect.className = 'or-pdf-highlight';
        rect.style.left = `${region.rect.x * 100}%`;
        rect.style.top = `${region.rect.y * 100}%`;
        rect.style.width = `${region.rect.w * 100}%`;
        rect.style.height = `${region.rect.h * 100}%`;
        orPdfHighlightLayer.appendChild(rect);
      });
  };

  const drawPageHitAreas = () => {
    if (!orPdfHitLayer) {
      return;
    }

    orPdfHitLayer.innerHTML = '';

    mappedArticles.forEach((article) => {
      article.regions
        .filter((region) => region.page === currentPage)
        .forEach((region) => {
          const hit = document.createElement('button');
          hit.type = 'button';
          hit.className = 'or-pdf-hit';
          hit.style.left = `${region.rect.x * 100}%`;
          hit.style.top = `${region.rect.y * 100}%`;
          hit.style.width = `${region.rect.w * 100}%`;
          hit.style.height = `${region.rect.h * 100}%`;
          hit.title = article.title;

          hit.addEventListener('click', () => {
            selectMappedArticle(article, false);
            if (orSearchResult) {
              orSearchResult.textContent = article.url
                ? 'Area articolo selezionata. Doppio click sull\'area per aprire l\'articolo.'
                : 'Area articolo selezionata.';
            }
          });

          hit.addEventListener('dblclick', () => {
            if (article.url) {
              window.open(article.url, '_blank', 'noopener');
            }
          });

          orPdfHitLayer.appendChild(hit);
        });
    });
  };

  const selectMappedArticle = (article, jumpToFirstRegion = true) => {
    if (!article) {
      selectedMappedArticleId = '';
      drawMappedHighlights();
      return;
    }

    selectedMappedArticleId = article.id;
    if (jumpToFirstRegion) {
      const sortedRegions = article.regions.slice().sort((a, b) => a.page - b.page);
      const firstRegion = sortedRegions[0];
      if (firstRegion) {
        currentPage = Math.min(Math.max(1, firstRegion.page), maxPage);
      }
    }

    renderMappedTitles();
    renderPdf();

    if (orSearchResult) {
      const onPageCount = article.regions.filter((region) => region.page === currentPage).length;
      orSearchResult.textContent = `Titolo mappato: evidenziate ${onPageCount} aree a pagina ${currentPage}.`;
    }
  };

  const renderMappedTitles = () => {
    if (!orMappedTitlesList) {
      return;
    }

    mappedArticles = normalizeMappedArticles();
    orMappedTitlesList.innerHTML = '';

    if (mappedArticles.length === 0) {
      if (orMappedStatus) {
        orMappedStatus.textContent = 'Nessuna mappatura trovata. Crea aree in admin-mapper e aggiorna questa pagina.';
      }
      return;
    }

    if (orMappedStatus) {
      orMappedStatus.textContent = `Titoli mappati disponibili: ${mappedArticles.length}.`;
    }

    mappedArticles.forEach((article) => {
      const pages = Array.from(new Set(article.regions.map((region) => region.page))).sort((a, b) => a - b);
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'or-rss-linker__item-btn';
      if (article.id === selectedMappedArticleId) {
        button.classList.add('is-active');
      }
      button.innerHTML = `<span class="or-rss-linker__item-title">${article.title}</span><small>Aree: ${article.regions.length} · Pagine: ${pages.join(', ')}</small>`;
      button.addEventListener('click', () => {
        selectMappedArticle(article, true);
      });
      li.appendChild(button);
      orMappedTitlesList.appendChild(li);
    });
  };

  const setActiveThumb = () => {
    orThumbButtons.forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.page) === currentPage);
    });
  };

  const searchInPdf = (rawQuery) => {
    if (!hasPdfLoaded) {
      if (orSearchResult) {
        orSearchResult.textContent = 'Carica prima il PDF per usare la ricerca.';
      }
      return false;
    }

    const query = normalizeText(rawQuery || '');
    if (!query) {
      if (orSearchResult) {
        orSearchResult.textContent = 'Inserisci un titolo o una porzione di titolo.';
      }
      return false;
    }

    const found = pdfTextIndex.find((entry) => entry.text.includes(query));
    if (!found) {
      if (orSearchResult) {
        orSearchResult.textContent = 'Nessuna corrispondenza trovata nel PDF.';
      }
      return false;
    }

    currentPage = found.page;
    renderPdf();
    if (orSearchResult) {
      orSearchResult.textContent = `Titolo trovato: pagina ${found.page}.`;
    }
    return true;
  };

  const renderPdf = async () => {
    if (!pdfDocument || !orPdfCtx) {
      return;
    }

    currentPage = Math.min(Math.max(1, currentPage), maxPage);

    const token = renderToken + 1;
    renderToken = token;

    const page = await pdfDocument.getPage(currentPage);
    const baseViewport = page.getViewport({ scale: 1 });
    const stageWidth = Math.max(640, (orPdfStage?.clientWidth || 980) - 2);
    const fitScale = stageWidth / baseViewport.width;
    const zoomScale = zoomMode === '120' ? 1.2 : 1;
    const viewport = page.getViewport({ scale: fitScale * zoomScale });

    if (token !== renderToken) {
      return;
    }

    orPdfCanvas.width = Math.floor(viewport.width);
    orPdfCanvas.height = Math.floor(viewport.height);

    if (orPdfHighlightLayer) {
      orPdfHighlightLayer.style.width = `${orPdfCanvas.width}px`;
      orPdfHighlightLayer.style.height = `${orPdfCanvas.height}px`;
    }
    if (orPdfHitLayer) {
      orPdfHitLayer.style.width = `${orPdfCanvas.width}px`;
      orPdfHitLayer.style.height = `${orPdfCanvas.height}px`;
    }

    await page.render({ canvasContext: orPdfCtx, viewport }).promise;

    if (token !== renderToken) {
      return;
    }

    if (orViewerLabel) {
      const fileName = pdfPath.split('/').pop() || pdfPath;
      orViewerLabel.textContent = `Edizione 13 marzo 2026 · Anno CLXVI · N. 60 · ${fileName} · Pagina ${currentPage}`;
    }
    setActiveThumb();
    drawMappedHighlights();
    drawPageHitAreas();
  };

  const buildPdfIndex = async () => {
    if (!window.pdfjsLib) {
      if (orSearchResult) {
        orSearchResult.textContent = 'Ricerca avanzata non disponibile: PDF.js non caricato.';
      }
      return;
    }

    if (!pdfDocument) {
      return;
    }

    maxPage = pdfDocument.numPages;
    const maxPageForIndex = pdfDocument.numPages;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= maxPageForIndex; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const fullText = textContent.items.map((item) => item.str).join(' ');
      pages.push({ page: pageNumber, text: normalizeText(fullText) });
    }

    pdfTextIndex = pages;
    if (orSearchResult) {
      orSearchResult.textContent = 'Ricerca titolo pronta.';
    }
  };

  orPrevPage?.addEventListener('click', () => {
    currentPage = currentPage <= 1 ? 1 : currentPage - 1;
    renderPdf();
  });

  orNextPage?.addEventListener('click', () => {
    currentPage = currentPage >= maxPage ? maxPage : currentPage + 1;
    renderPdf();
  });

  orZoomToggle?.addEventListener('click', () => {
    zoomMode = zoomMode === 'page-width' ? '120' : 'page-width';
    renderPdf();
  });

  orThumbButtons.forEach((button) => {
    button.addEventListener('click', () => {
      currentPage = Number(button.dataset.page) || 1;
      renderPdf();
    });
  });

  resolvePdfPath()
    .then(async (resolvedPath) => {
      const hasPdfJs = await ensurePdfJsLoaded();
      if (!hasPdfJs) {
        throw new Error('PDF.js non disponibile (CDN non raggiungibili)');
      }
      return resolvedPath;
    })
    .then((resolvedPath) => fetch(withCacheBust(resolvedPath), { method: 'HEAD', cache: 'no-store' }))
    .then((response) => {
      if (!response.ok) {
        throw new Error('PDF non trovato');
      }

      window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

      return window.pdfjsLib.getDocument(withCacheBust(pdfPath)).promise;
    })
    .then((pdf) => {
      hasPdfLoaded = true;
      pdfDocument = pdf;
      maxPage = pdf.numPages;

      orPdfStage?.classList.remove('is-hidden');
      orViewerFallback?.classList.add('is-hidden');
      if (orPdfHint) {
        orPdfHint.textContent = `PDF collegato (${pdfPath}): usa miniature, frecce e zoom per il test.`;
      }
      renderMappedTitles();
      return renderPdf().then(() => buildPdfIndex()).then(() => {
        const queryFromUrl = params.get('q') || params.get('title');
        if (queryFromUrl) {
          if (orSearchInput) {
            orSearchInput.value = queryFromUrl;
          }
          searchInPdf(queryFromUrl);
        }
      });
    })
    .catch((error) => {
      orPdfStage?.classList.add('is-hidden');
      pdfDocument = null;
      if (orPdfHint) {
        orPdfHint.textContent = `Errore caricamento PDF: ${error?.message || 'sconosciuto'}.`;
      }
      if (orSearchResult) {
        orSearchResult.textContent = '';
      }
    });

  orSearchForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    searchInPdf(orSearchInput?.value || '');
  });

  const feedUrl = 'https://www.osservatoreromano.va/it.newsfeed.xml';

  const formatDateShort = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const renderRssItems = (items) => {
    if (!orRssList) {
      return;
    }

    orRssList.innerHTML = '';
    items.forEach((item) => {
      const titleRaw = item.querySelector('title')?.textContent || 'Titolo non disponibile';
      const title = titleRaw.replace(/\s+/g, ' ').trim();
      const pubDate = item.querySelector('pubDate')?.textContent || '';

      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'or-rss-linker__item-btn';
      button.innerHTML = `<span class="or-rss-linker__item-title">${title}</span><small>${formatDateShort(pubDate)}</small>`;
      button.addEventListener('click', () => {
        if (orSearchInput) {
          orSearchInput.value = title;
        }
        const mapped = mappedArticles.find((article) => article.titleNormalized.includes(normalizeText(title)));
        if (mapped) {
          selectMappedArticle(mapped, true);
          if (orRssStatus) {
            orRssStatus.textContent = 'Titolo RSS agganciato alle aree mappate nel PDF.';
          }
          return;
        }
        const found = searchInPdf(title);
        if (orRssStatus) {
          orRssStatus.textContent = found
            ? 'Titolo RSS agganciato al PDF con successo.'
            : 'Titolo RSS non trovato nel PDF corrente.';
        }
      });
      li.appendChild(button);
      orRssList.appendChild(li);
    });
  };

  orRssLoadButton?.addEventListener('click', async () => {
    if (orRssStatus) {
      orRssStatus.textContent = 'Caricamento feed RSS in corso...';
    }
    if (orRssList) {
      orRssList.innerHTML = '';
    }
    orRssLoadButton.disabled = true;

    try {
      const response = await fetch(feedUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const xmlText = await response.text();
      const xmlDoc = new DOMParser().parseFromString(xmlText, 'application/xml');
      const items = Array.from(xmlDoc.querySelectorAll('item')).slice(0, 10);

      if (items.length === 0) {
        if (orRssStatus) {
          orRssStatus.textContent = 'Nessun titolo disponibile dal feed.';
        }
        return;
      }

      renderRssItems(items);
      if (orRssStatus) {
        orRssStatus.textContent = `Feed caricato: ${items.length} titoli pronti al collegamento PDF.`;
      }
    } catch (error) {
      if (orRssStatus) {
        orRssStatus.textContent = 'Feed non raggiungibile da browser (CORS). In produzione usare proxy/server ingest e passare JSON al viewer.';
      }
    } finally {
      orRssLoadButton.disabled = false;
    }
  });
}

const rssLoadButton = document.getElementById('rss-load-or');
const rssStatus = document.getElementById('rss-or-status');
const rssList = document.getElementById('rss-or-list');

if (rssLoadButton && rssStatus && rssList) {
  const feedUrl = 'https://www.osservatoreromano.va/it.newsfeed.xml';

  const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  rssLoadButton.addEventListener('click', async () => {
    rssLoadButton.disabled = true;
    rssStatus.textContent = 'Caricamento feed in corso...';
    rssList.innerHTML = '';

    try {
      const response = await fetch(feedUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const xmlText = await response.text();
      const xmlDoc = new DOMParser().parseFromString(xmlText, 'application/xml');
      const items = Array.from(xmlDoc.querySelectorAll('item')).slice(0, 6);

      if (items.length === 0) {
        rssStatus.textContent = 'Feed raggiunto, ma nessun item disponibile.';
        return;
      }

      items.forEach((item) => {
        const title = (item.querySelector('title')?.textContent || 'Titolo non disponibile').replace(/\s+/g, ' ').trim();
        const link = item.querySelector('link')?.textContent || '#';
        const pubDate = item.querySelector('pubDate')?.textContent || '';

        const li = document.createElement('li');
        li.innerHTML = `<a href="${link}" target="_blank" rel="noopener noreferrer">${title}</a> <small>(${formatDate(pubDate)})</small>`;
        rssList.appendChild(li);
      });

      rssStatus.textContent = `Feed caricato: ${items.length} titoli.`;
    } catch (error) {
      rssStatus.textContent = 'Fetch diretto bloccato (probabile CORS). In produzione usa ingest server-side del feed.';
    } finally {
      rssLoadButton.disabled = false;
    }
  });
}