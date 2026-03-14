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

const orPdfViewer = document.getElementById('or-pdf-viewer');

if (orPdfViewer) {
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
  const pdfPath = 'assets/osservatore-edizione.pdf';
  let currentPage = 1;
  let zoomMode = 'page-width';
  let pdfTextIndex = [];
  let hasPdfLoaded = false;

  const normalizeText = (value) =>
    (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

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

  const renderPdf = () => {
    orPdfViewer.src = `${pdfPath}#page=${currentPage}&zoom=${zoomMode}`;
    if (orViewerLabel) {
      orViewerLabel.textContent = `Edizione 13 marzo 2026 · Anno CLXVI · N. 60 · Pagina ${currentPage}`;
    }
    setActiveThumb();
  };

  const buildPdfIndex = async () => {
    if (!window.pdfjsLib) {
      if (orSearchResult) {
        orSearchResult.textContent = 'Ricerca avanzata non disponibile: PDF.js non caricato.';
      }
      return;
    }

    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.js';

    const loadingTask = window.pdfjsLib.getDocument(pdfPath);
    const pdf = await loadingTask.promise;
    const maxPage = Math.min(pdf.numPages, orThumbButtons.length || pdf.numPages);
    const pages = [];

    for (let pageNumber = 1; pageNumber <= maxPage; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const fullText = textContent.items.map((item) => item.str).join(' ');
      pages.push({ page: pageNumber, text: normalizeText(fullText) });
    }

    pdfTextIndex = pages;
    if (orSearchResult) {
      orSearchResult.textContent = 'Ricerca titolo pronta.';
    }
  };

  const maxPage = orThumbButtons.length || 1;

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

  fetch(pdfPath, { method: 'HEAD' })
    .then((response) => {
      if (!response.ok) {
        throw new Error('PDF non trovato');
      }

      hasPdfLoaded = true;

      orPdfViewer.classList.remove('is-hidden');
      orViewerFallback?.classList.add('is-hidden');
      if (orPdfHint) {
        orPdfHint.textContent = 'PDF collegato: usa miniature, frecce e zoom per il test.';
      }
      renderPdf();
      return buildPdfIndex().then(() => {
        const params = new URLSearchParams(window.location.search);
        const queryFromUrl = params.get('q') || params.get('title');
        if (queryFromUrl) {
          if (orSearchInput) {
            orSearchInput.value = queryFromUrl;
          }
          searchInPdf(queryFromUrl);
        }
      });
    })
    .catch(() => {
      if (orPdfHint) {
        orPdfHint.textContent = 'PDF non presente. Carica assets/osservatore-edizione.pdf per testare lo sfogliatore reale.';
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