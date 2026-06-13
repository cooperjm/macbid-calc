(function initMacbidTruePriceContent(root) {
  'use strict';

  const ROOT_ID = 'macbid-true-price-root';
  const STORAGE_KEY = 'macbidTruePriceSettings';
  const ITEM_PATH_PATTERN = /\/(?:auction|lot|product|item)(?:\/|$|[-_])/i;
  const BID_LABEL_PATTERN = /\b(?:current|high)\s+bid\b/i;
  const DEBOUNCE_MS = 150;

  const fees = root.MacbidFees;
  const taxes = root.MacbidTaxes;
  const parser = root.MacbidParser;

  if (!fees || !taxes || !parser) {
    return;
  }

  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  const percentFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: 'percent',
  });

  let settings = fees.normalizeSettings(fees.DEFAULT_SETTINGS);
  let observer = null;
  let renderTimer = null;

  function hasChromeStorage() {
    return Boolean(
      root.chrome
        && root.chrome.storage
        && root.chrome.storage.sync
        && typeof root.chrome.storage.sync.get === 'function',
    );
  }

  function normalizeStoredSettings(value) {
    return fees.normalizeSettings(value || fees.DEFAULT_SETTINGS);
  }

  function loadSettings(callback) {
    if (!hasChromeStorage()) {
      callback(normalizeStoredSettings());
      return;
    }

    try {
      root.chrome.storage.sync.get(STORAGE_KEY, (items) => {
        if (root.chrome.runtime && root.chrome.runtime.lastError) {
          callback(normalizeStoredSettings());
          return;
        }

        callback(normalizeStoredSettings(items && items[STORAGE_KEY]));
      });
    } catch (error) {
      callback(normalizeStoredSettings());
    }
  }

  function persistSettings() {
    if (!hasChromeStorage() || typeof root.chrome.storage.sync.set !== 'function') {
      return;
    }

    try {
      root.chrome.storage.sync.set({ [STORAGE_KEY]: settings });
    } catch (error) {
      // Ignore transient extension-context failures; the in-page estimate still updates.
    }
  }

  function formatCurrency(value) {
    return currencyFormatter.format(Number.isFinite(Number(value)) ? Number(value) : 0);
  }

  function formatPercent(value) {
    return percentFormatter.format(Number.isFinite(Number(value)) ? Number(value) : 0);
  }

  function getSnapshot() {
    return parser.parseSnapshotFromDocument(document);
  }

  function isLikelyItemPage(snapshot) {
    return (snapshot.currentBid !== null && snapshot.currentBid !== undefined)
      || ITEM_PATH_PATTERN.test(root.location.pathname);
  }

  function isInsideOverlay(node) {
    const overlayRoot = document.getElementById(ROOT_ID);

    return Boolean(overlayRoot && node && (node === overlayRoot || overlayRoot.contains(node)));
  }

  function isElementVisible(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE || isInsideOverlay(element)) {
      return false;
    }

    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      const style = root.getComputedStyle(current);

      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }

      current = current.parentElement;
    }

    return true;
  }

  function getNearestInsertionElement(element) {
    let current = element;
    let depth = 0;

    while (current && current !== document.body && depth < 5) {
      const style = root.getComputedStyle(current);
      const tagName = current.tagName.toLowerCase();
      const blockLike = /^(block|flex|grid|table|list-item)$/.test(style.display);
      const semanticBlock = /^(article|aside|div|dl|form|li|main|section|table|tbody|td|tr)$/.test(tagName);

      if (blockLike || semanticBlock) {
        return current;
      }

      current = current.parentElement;
      depth += 1;
    }

    return element;
  }

  function findBidLabelTarget() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(textNode) {
        if (!BID_LABEL_PATTERN.test(textNode.nodeValue || '')) {
          return NodeFilter.FILTER_REJECT;
        }

        const parent = textNode.parentElement;

        if (!parent || !isElementVisible(parent)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNode = walker.nextNode();

    return textNode ? getNearestInsertionElement(textNode.parentElement) : null;
  }

  function findInsertionTarget() {
    if (!document.body) {
      return null;
    }

    return findBidLabelTarget() || document.body.firstElementChild || document.body;
  }

  function getOrCreateRoot() {
    let overlayRoot = document.getElementById(ROOT_ID);

    if (!overlayRoot) {
      overlayRoot = document.createElement('div');
      overlayRoot.id = ROOT_ID;
    }

    return overlayRoot;
  }

  function placeRoot(overlayRoot, target) {
    if (!target || !document.body) {
      return false;
    }

    if (target === document.body) {
      if (overlayRoot.parentElement !== document.body || overlayRoot !== document.body.firstElementChild) {
        document.body.insertBefore(overlayRoot, document.body.firstElementChild);
      }

      return true;
    }

    if (overlayRoot.previousElementSibling !== target) {
      target.insertAdjacentElement('afterend', overlayRoot);
    }

    return true;
  }

  function removeRoot() {
    const overlayRoot = document.getElementById(ROOT_ID);

    if (overlayRoot) {
      overlayRoot.remove();
    }
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);

    if (className) {
      element.className = className;
    }

    if (text !== undefined) {
      element.textContent = text;
    }

    return element;
  }

  function createRow(label, value) {
    const row = createElement('div', 'macbid-tp-row');
    row.append(createElement('span', '', label), createElement('strong', '', value));
    return row;
  }

  function getEffectiveSettings(snapshot, taxSelection) {
    const effectiveSettings = {
      ...settings,
      taxRate: taxSelection.rate,
    };

    if (snapshot.assuranceFee !== null && snapshot.assuranceFee !== undefined) {
      effectiveSettings.assuranceEnabled = true;
      effectiveSettings.assuranceFee = snapshot.assuranceFee;
    }

    return fees.normalizeSettings(effectiveSettings);
  }

  function getBudgetAmount() {
    if (settings.budget === null || settings.budget === undefined || String(settings.budget).trim() === '') {
      return null;
    }

    const amount = Number(settings.budget);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  function updateBudgetResult(container, effectiveSettings) {
    const result = container.querySelector('[data-macbid-budget-result]');
    const budgetAmount = getBudgetAmount();

    if (!result) {
      return;
    }

    if (budgetAmount === null) {
      result.textContent = '';
      return;
    }

    result.textContent = `Max safe bid: ${formatCurrency(fees.maxBidFromBudget(budgetAmount, effectiveSettings))}`;
  }

  function createBudgetControls(effectiveSettings) {
    const controls = createElement('div', 'macbid-tp-controls');
    const label = createElement('label', '', 'Budget ');
    const input = document.createElement('input');
    const result = createElement('span', 'macbid-tp-badge');

    input.type = 'number';
    input.min = '0';
    input.step = '0.01';
    input.placeholder = '0.00';
    input.value = settings.budget === null || settings.budget === undefined ? '' : String(settings.budget);
    input.setAttribute('aria-label', 'Budget');
    result.dataset.macbidBudgetResult = 'true';

    input.addEventListener('input', () => {
      settings = fees.normalizeSettings({
        ...settings,
        budget: input.value,
      });
      persistSettings();
      updateBudgetResult(controls, effectiveSettings);
    });

    label.append(input);
    controls.append(label, result);
    updateBudgetResult(controls, effectiveSettings);

    return controls;
  }

  function getListingCandidates() {
    if (!document.body) {
      return [];
    }

    return Array.from(document.querySelectorAll('a, article, [class*="card"], [class*="lot"], [class*="item"]'))
      .filter((node) => node instanceof Element)
      .filter((node) => !isInsideOverlay(node))
      .filter((node) => node !== document.body && node !== document.documentElement)
      .filter((node) => isElementVisible(node))
      .filter((node) => {
        const text = node.innerText || node.textContent || '';
        return text.length < 2000 && /\b(?:current|high)\s+bid\b|\$[0-9]/i.test(text);
      });
  }

  function getCardTextWithoutBadge(card) {
    const clone = card.cloneNode(true);
    clone.querySelectorAll('.macbid-tp-badge').forEach((badge) => badge.remove());
    return clone.innerText || clone.textContent || '';
  }

  function renderListingBadges() {
    const candidates = getListingCandidates();

    candidates.slice(0, 80).forEach((card) => {
      const snapshot = parser.parseSnapshotFromText(getCardTextWithoutBadge(card));

      if (snapshot.currentBid === null || snapshot.currentBid === undefined) {
        return;
      }

      const taxSelection = taxes.selectTaxRate({
        settings,
        locationName: snapshot.locationName,
        stateCode: snapshot.stateCode,
      });
      const effectiveSettings = getEffectiveSettings(snapshot, taxSelection);
      const total = fees.calculateTotal(snapshot.currentBid, effectiveSettings);
      const signature = JSON.stringify({
        bid: snapshot.currentBid,
        assuranceFee: snapshot.assuranceFee,
        stateCode: snapshot.stateCode,
        locationName: snapshot.locationName,
        total: total.total,
      });
      let badge = card.querySelector(':scope > .macbid-tp-badge');

      if (!badge) {
        badge = createElement('span', 'macbid-tp-badge');
        card.insertAdjacentElement('afterbegin', badge);
      }

      if (badge.dataset.macbidSignature !== signature) {
        badge.textContent = `Est. ${formatCurrency(total.total)}`;
        badge.title = `Estimated total with fees and ${taxSelection.label}`;
        badge.dataset.macbidSignature = signature;
      }
    });
  }

  function renderWarning(overlayRoot) {
    overlayRoot.replaceChildren(
      createElement('div', 'macbid-tp-warning', 'Current bid not found. MAC.BID True Price will update when the bid appears.'),
    );
  }

  function renderPanel(overlayRoot, snapshot) {
    const taxSelection = taxes.selectTaxRate({
      settings,
      locationName: snapshot.locationName,
      stateCode: snapshot.stateCode,
    });
    const effectiveSettings = getEffectiveSettings(snapshot, taxSelection);
    const total = fees.calculateTotal(snapshot.currentBid, effectiveSettings);
    const panel = createElement('div', 'macbid-tp-panel');
    const taxNote = `${taxSelection.label}: ${formatPercent(taxSelection.rate)} estimate. Local taxes may vary.`;
    const breakdown = createElement('div', 'macbid-tp-breakdown');

    panel.append(
      createElement('p', 'macbid-tp-kicker', 'Estimated total'),
      createElement('p', 'macbid-tp-total', formatCurrency(total.total)),
      createElement('p', 'macbid-tp-note', taxNote),
    );

    if (snapshot.retailPrice !== null && snapshot.retailPrice !== undefined && snapshot.retailPrice > 0) {
      panel.append(createElement(
        'p',
        'macbid-tp-note',
        `${formatPercent(total.total / snapshot.retailPrice)} of ${formatCurrency(snapshot.retailPrice)} retail`,
      ));
    }

    breakdown.append(
      createRow('Current bid', formatCurrency(total.bid)),
      createRow(`Buyer premium (${formatPercent(effectiveSettings.premiumRate)})`, formatCurrency(total.premium)),
      createRow('Lot fee', formatCurrency(total.lotFee)),
      createRow('Assurance', formatCurrency(total.assurance)),
      createRow(`Sales tax (${formatPercent(total.taxRate)})`, formatCurrency(total.taxAmount)),
      createRow('Fees above bid', formatCurrency(total.overhead)),
    );

    panel.append(breakdown, createBudgetControls(effectiveSettings));
    overlayRoot.replaceChildren(panel);
  }

  function render() {
    if (!document.body) {
      return;
    }

    renderListingBadges();

    const snapshot = getSnapshot();
    const likelyItemPage = isLikelyItemPage(snapshot);

    if (!likelyItemPage) {
      removeRoot();
      return;
    }

    const target = findInsertionTarget();
    const overlayRoot = getOrCreateRoot();

    if (!placeRoot(overlayRoot, target)) {
      return;
    }

    if (snapshot.currentBid === null || snapshot.currentBid === undefined) {
      renderWarning(overlayRoot);
      return;
    }

    renderPanel(overlayRoot, snapshot);
  }

  function scheduleRender() {
    root.clearTimeout(renderTimer);
    renderTimer = root.setTimeout(render, DEBOUNCE_MS);
  }

  function isOverlayMutation(mutation) {
    if (isInsideOverlay(mutation.target)) {
      return true;
    }

    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return nodes.length > 0 && nodes.every(isInsideOverlay);
  }

  function startObserver() {
    if (observer || !document.body) {
      return;
    }

    observer = new MutationObserver((mutations) => {
      if (mutations.length > 0 && mutations.every(isOverlayMutation)) {
        return;
      }

      scheduleRender();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function listenForStorageChanges() {
    if (
      !root.chrome
      || !root.chrome.storage
      || !root.chrome.storage.onChanged
      || typeof root.chrome.storage.onChanged.addListener !== 'function'
    ) {
      return;
    }

    root.chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync' || !changes[STORAGE_KEY]) {
        return;
      }

      settings = normalizeStoredSettings(changes[STORAGE_KEY].newValue);
      scheduleRender();
    });
  }

  function disconnectObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  loadSettings((storedSettings) => {
    settings = storedSettings;
    render();
    startObserver();
    listenForStorageChanges();
  });

  root.addEventListener('beforeunload', disconnectObserver, { once: true });
})(globalThis);
