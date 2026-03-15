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
  const pdfHint = document.getElementById('or-pdf-hint');
  const searchResult = document.getElementById('or-search-result');
  const searchForm = document.getElementById('or-search-form');
  const searchInput = document.getElementById('or-search-title');
  const fitButton = document.getElementById('or-fit-toggle');
  const zoomButton = document.getElementById('or-zoom-toggle');

  const editionSelect = document.getElementById('or-edition-select');
  const editionStatus = document.getElementById('or-edition-status');
  const mappedList = document.getElementById('or-mapped-titles-list');
  const mappedStatus = document.getElementById('or-mapped-status');

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
  let selectedMappedArticleId = '';

  let pdfDocument = null;
  let currentPage = 1;
  let maxPage = 1;
  let renderToken = 0;
  let zoomScaleFactor = 1;
  let fitPageScale = 1;
  let fitWidthScale = 1;
  let fitMode = 'page';
  let renderedTotalScale = 1;
  let pdfTextIndex = [];
  let isLoadingEdition = false;
  let isZoomAnimating = false;
  let activeFocusRegion = null;
  let isMagnetFocusEnabled = false;
  let isApplyingMagnetScroll = false;
  let isMagnetBypassActive = false;
  const pageCache = new Map();

  function normalizeText(value) {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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

    const mask = document.createElement('div');
    mask.className = 'or-pdf-focus-mask';
    mask.style.left = `${activeFocusRegion.rect.x * 100}%`;
    mask.style.top = `${activeFocusRegion.rect.y * 100}%`;
    mask.style.width = `${activeFocusRegion.rect.w * 100}%`;
    mask.style.height = `${activeFocusRegion.rect.h * 100}%`;

    const box = document.createElement('div');
    box.className = 'or-pdf-focus-box';
    box.style.left = `${activeFocusRegion.rect.x * 100}%`;
    box.style.top = `${activeFocusRegion.rect.y * 100}%`;
    box.style.width = `${activeFocusRegion.rect.w * 100}%`;
    box.style.height = `${activeFocusRegion.rect.h * 100}%`;

    highlightLayer.appendChild(mask);
    highlightLayer.appendChild(box);
  }

  function setArticleTextHint(article) {
    if (!searchResult) {
      return;
    }

    if (article?.url) {
      searchResult.innerHTML = `Area selezionata. <a class="or-inline-article-link" href="${article.url}" target="_blank" rel="noopener">Apri versione testuale</a>.`;
      return;
    }

    searchResult.textContent = 'Area selezionata. Versione testuale non disponibile.';
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
          const hit = document.createElement('button');
          hit.type = 'button';
          hit.className = 'or-pdf-hit';
          hit.style.left = `${region.rect.x * 100}%`;
          hit.style.top = `${region.rect.y * 100}%`;
          hit.style.width = `${region.rect.w * 100}%`;
          hit.style.height = `${region.rect.h * 100}%`;
          hit.title = article.url
            ? `${article.title} - Click: zoom sul titolo. Doppio click: apri versione testuale.`
            : `${article.title} - Click: zoom sul titolo.`;

          bindSingleAndDoubleClick(
            hit,
            () => {
              selectedMappedArticleId = article.id;
              activeFocusRegion = region;
              isMagnetFocusEnabled = true;
              renderMappedList();
              cinematicZoomToRegion(region);
              setArticleTextHint(article);
            },
            () => {
              selectedMappedArticleId = article.id;
              activeFocusRegion = region;
              isMagnetFocusEnabled = true;
              renderMappedList();
              readabilityZoomToRegion(region);

              if (searchResult) {
                searchResult.textContent = article.url
                  ? 'Modalita lettura attiva. Usa il link sotto per aprire la versione testuale.'
                  : 'Modalita lettura attiva su area selezionata.';
              }
            }
          );

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
      return;
    }

    setMappedStatus(`Titoli mappati disponibili: ${mappings.length}.`);

    mappings.forEach((article) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'or-rss-linker__item-btn';
      if (article.id === selectedMappedArticleId) {
        button.classList.add('is-active');
      }
      button.innerHTML = `<span class="or-rss-linker__item-title">${article.title}</span><small>Aree mappate: ${article.regions.length}</small>`;
      bindSingleAndDoubleClick(
        button,
        () => {
          selectedMappedArticleId = article.id;
          renderMappedList();
          const firstRegion = article.regions.slice().sort((a, b) => a.page - b.page)[0];
          if (firstRegion) {
            activeFocusRegion = firstRegion;
            isMagnetFocusEnabled = true;
            cinematicZoomToRegion(firstRegion);
            setArticleTextHint(article);
          }
        },
        () => {
          selectedMappedArticleId = article.id;
          renderMappedList();
          const firstRegion = article.regions.slice().sort((a, b) => a.page - b.page)[0];
          if (firstRegion) {
            activeFocusRegion = firstRegion;
            isMagnetFocusEnabled = true;
            readabilityZoomToRegion(firstRegion);
            setArticleTextHint(article);
          }
        }
      );
      li.appendChild(button);
      mappedList.appendChild(li);
    });
  }

  async function buildPdfIndex() {
    if (!pdfDocument) {
      pdfTextIndex = [];
      return;
    }

    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const fullText = textContent.items.map((item) => item.str).join(' ');
      pages.push({ page: pageNumber, text: normalizeText(fullText) });
    }

    pdfTextIndex = pages;
  }

  function searchInPdf(rawQuery) {
    const query = normalizeText(rawQuery);
    if (!query) {
      if (searchResult) {
        searchResult.textContent = 'Inserisci un titolo o una porzione di titolo.';
      }
      return;
    }

    const mapped = mappings.find((item) => item.titleNormalized.includes(query));
    if (mapped) {
      const firstRegion = mapped.regions.slice().sort((a, b) => a.page - b.page)[0];
      if (firstRegion) {
        selectedMappedArticleId = mapped.id;
        activeFocusRegion = firstRegion;
        isMagnetFocusEnabled = true;
        renderMappedList();
        cinematicZoomToRegion(firstRegion);
        setArticleTextHint(mapped);
      }
      return;
    }

    const found = pdfTextIndex.find((entry) => entry.text.includes(query));
    if (!found) {
      if (searchResult) {
        searchResult.textContent = 'Nessuna corrispondenza trovata nel PDF.';
      }
      return;
    }

    currentPage = found.page;
    zoomScaleFactor = 1;
    activeFocusRegion = null;
    isMagnetFocusEnabled = false;
    renderPdf();
    if (searchResult) {
      searchResult.textContent = `Titolo trovato nel PDF a pagina ${found.page}.`;
    }
  }

  async function loadPdfForEdition() {
    if (!selectedEdition?.pdfPath) {
      pdfDocument = null;
      maxPage = 1;
      setPdfHint('PDF non configurato per questa edizione.', true);
      return;
    }

    const hasPdfJs = await ensurePdfJsLoaded();
    if (!hasPdfJs || !window.pdfjsLib) {
      setPdfHint('PDF.js non disponibile: CDN non raggiungibili.', true);
      return;
    }

    window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

    const path = selectedEdition.pdfPath;

    try {
      const head = await fetch(path, { method: 'HEAD', cache: 'no-store' });
      if (!head.ok) {
        throw new Error('PDF non trovato');
      }

      pdfDocument = await window.pdfjsLib.getDocument(path).promise;
      maxPage = pdfDocument.numPages;
      currentPage = 1;
      zoomScaleFactor = 1;
      activeFocusRegion = null;
      isMagnetFocusEnabled = false;
      fitMode = 'page';
      pageCache.clear();

      if (stage) {
        stage.classList.remove('is-hidden');
      }

      setPdfHint(`PDF collegato: ${path}`);
      await renderPdf();
      await buildPdfIndex();
    } catch (error) {
      pdfDocument = null;
      maxPage = 1;
      setPdfHint(`Errore caricamento PDF: ${error?.message || 'sconosciuto'}.`, true);
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

      setEditionStatus(`Edizione attiva: ${selectedEdition.name}`);

      mappings = await window.OrDataStore.listMappingsByEdition(editionId);
      selectedMappedArticleId = '';

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
    }
    animateZoomTo(target, null, 220);
  });

  fitButton?.addEventListener('click', () => {
    if (isZoomAnimating) {
      return;
    }
    fitMode = fitMode === 'page' ? 'width' : 'page';
    zoomScaleFactor = 1;
    isMagnetFocusEnabled = false;
    activeFocusRegion = null;
    renderPdf();
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
      return;
    }
    clampScrollToFocusRegion();
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
    if (!pdfDocument || isZoomAnimating) {
      return;
    }
    renderPdf();
  });

  searchForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    searchInPdf(searchInput?.value || '');
  });

  editionSelect?.addEventListener('change', () => {
    if (isLoadingEdition) {
      return;
    }
    loadEditionData(editionSelect.value);
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
    } catch (error) {
      setEditionStatus(`Errore bootstrap: ${error?.message || 'sconosciuto'}.`, true);
    } finally {
      setLoadingEditionState(false);
    }
  }

  bootstrap();
})();
