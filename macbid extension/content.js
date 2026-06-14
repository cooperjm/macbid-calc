(function initMacbidTruePriceContent(root) {
  'use strict';

  const ROOT_ID = 'macbid-true-price-root';
  const STORAGE_KEY = 'macbidTruePriceSettings';
  const ITEM_PATH_PATTERN = /\/(?:auction|lot|product|item)(?:\/|$|[-_])/i;
  const BID_LABEL_PATTERN = /\b(?:current|high)\s+bid\b/i;
  // Negative lookahead excludes digits and commas only — NOT letters — so that
  // flex-container innerText like "$3,262.37LIKE" (price adjacent to a "LIKE NEW"
  // badge with no whitespace separator) still parses correctly on mac.bid.
  const DOLLAR_PATTERN = /\$\s*((?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]{1,2})?)(?![0-9,.])/g;
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

  function getDealQuality(totalAmount, retailPrice) {
    if (!retailPrice || !Number.isFinite(retailPrice) || retailPrice <= 0 || !Number.isFinite(totalAmount)) {
      return null;
    }
    const ratio = totalAmount / retailPrice;
    if (ratio < 0.40) return 'good';
    if (ratio < 0.65) return 'ok';
    return 'bad';
  }

  function getSnapshot() {
    return getDetailSnapshot() || parser.parseSnapshotFromDocument(document);
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

  function getText(element) {
    return element ? element.innerText || element.textContent || '' : '';
  }

  function findDollarAmounts(text) {
    if (typeof text !== 'string') {
      return [];
    }

    return Array.from(text.matchAll(DOLLAR_PATTERN))
      .map((match) => Number(match[1].replace(/,/g, '')))
      .filter(Number.isFinite);
  }

  function findBidNowElement() {
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .filter((element) => isElementVisible(element) && /\bbid\s+now\b/i.test(getText(element)));

    if (candidates.length === 1) return candidates[0];

    // On pages with multiple BID NOW buttons (watchlist, all-deals, etc.) prefer
    // the one that belongs to the active detail card rather than a list-row button.

    // Priority 1: inside a "Set your max bid" container (watchlist / full detail view).
    const withBidSelector = candidates.find((el) => {
      let ancestor = el.parentElement;
      let depth = 0;
      while (ancestor && depth < 6) {
        if (/\bset\s+your\s+max\s+bid\b/i.test(getText(ancestor))) {
          return true;
        }
        ancestor = ancestor.parentElement;
        depth += 1;
      }
      return false;
    });
    if (withBidSelector) return withBidSelector;

    // Priority 2: actually on top — not covered by a modal backdrop.
    // On pages like all-deals a backdrop overlays the list, so elementFromPoint
    // at a list button's center returns the backdrop, not the button itself.
    // The modal's BID NOW button is genuinely on top and passes this check.
    const clickable = candidates.find((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return top !== null && (top === el || el.contains(top));
    });
    if (clickable) return clickable;

    // Priority 3: parent directly contains a countdown timer.
    const withCountdownParent = candidates.find(
      (el) => el.parentElement && el.parentElement.querySelector('.lot-countdown-timer'),
    );
    if (withCountdownParent) return withCountdownParent;

    return candidates[0] || null;
  }

  function findDetailBidCard() {
    const bidNow = findBidNowElement();

    if (!bidNow) {
      return null;
    }

    // On watchlist/modal pages the countdown timer lives in a different DOM branch
    // from "set your max bid", so the walk below never matches. Use the closest
    // dialog/modal ancestor first — it contains the full item detail including prices.
    const dialog = bidNow.closest('[role="dialog"], [aria-modal="true"]');
    if (dialog) {
      return dialog;
    }

    // Cover non-ARIA modals using common class name patterns.
    const classModal = bidNow.closest('[class*="modal"], [class*="overlay"], [class*="dialog"]');
    if (classModal && classModal !== document.body && classModal !== document.documentElement) {
      return classModal;
    }

    let current = bidNow;

    while (current && current !== document.body) {
      const text = getText(current);

      if (
        /\bset\s+your\s+max\s+bid\b/i.test(text)
        && current.querySelector('.lot-countdown-timer')
      ) {
        return current;
      }

      current = current.parentElement;
    }

    // Find the nearest common ancestor of the BID NOW button and any visible
    // countdown timer — handles layouts where the two elements share a container
    // but no ARIA role or modal class identifies it.
    const visibleCountdown = Array.from(document.querySelectorAll('.lot-countdown-timer'))
      .find(isElementVisible);
    if (visibleCountdown) {
      let ancestor = bidNow;
      while (ancestor && ancestor !== document.body) {
        if (ancestor.contains(visibleCountdown)) {
          return ancestor;
        }
        ancestor = ancestor.parentElement;
      }
    }

    return bidNow.parentElement || bidNow;
  }

  function getDetailInjectionTarget(card) {
    if (!card) {
      return null;
    }

    const countdown = card.querySelector('.lot-countdown-timer');
    return countdown ? countdown.closest('div[style]') || countdown : card;
  }

  function getDetailPriceText(card) {
    const clone = card.cloneNode(true);
    clone.querySelectorAll('select, option, button, input, .macbid-tp-panel, .macbid-tp-badge').forEach((node) => node.remove());
    return getText(clone);
  }

  function getAssuranceState(card) {
    const assurancePattern = /\bbuyer'?s\s+assurance\b/i;
    const checkboxes = Array.from(card.querySelectorAll('input[type="checkbox"]'));
    const checkbox = checkboxes.find((input) => {
      const localContainer = input.closest('label') || input.parentElement || input.closest('div') || card;
      return assurancePattern.test(getText(localContainer));
    }) || null;
    const assuranceElement = Array.from(card.querySelectorAll('label, p, span, div'))
      .filter((element) => assurancePattern.test(getText(element)))
      .sort((left, right) => getText(left).length - getText(right).length)[0];

    if (!assuranceElement && !checkbox) {
      return { selected: false, fee: null };
    }

    const textSources = [
      checkbox && checkbox.closest('label'),
      checkbox && checkbox.parentElement,
      checkbox && checkbox.closest('div'),
      assuranceElement,
      card,
    ].filter(Boolean);
    const fee = textSources.reduce((foundFee, element) => {
      if (foundFee !== null && foundFee !== undefined) {
        return foundFee;
      }

      return parser.parseAssuranceFee(getText(element));
    }, null);

    return {
      selected: Boolean(checkbox && checkbox.checked),
      fee,
    };
  }

  function removeListingBadges() {
    document.querySelectorAll('.macbid-tp-badge--listing').forEach((badge) => {
      if (!isInsideOverlay(badge)) {
        badge.remove();
      }
    });
  }

  function getDetailSnapshot() {
    const container = findDetailBidCard();

    if (!container) {
      return null;
    }

    const amounts = findDollarAmounts(getDetailPriceText(container));

    if (amounts.length === 0) {
      return null;
    }

    const baseSnapshot = parser.parseSnapshotFromDocument(document);
    const assurance = getAssuranceState(container);

    // Prefer specific price elements when present; fall back to positional text parsing.
    const priceElBid = extractCardPrice(container, 'price-current');
    const currentBid = priceElBid !== undefined ? priceElBid : amounts[0];

    // Search within the container first — on watchlist pages, baseSnapshot.retailPrice
    // may be taken from a different item visible elsewhere in the document.
    const retailPrice = extractCardPrice(container, 'price-retail')
      ?? amounts.slice(1).find((amount) => amount > (currentBid ?? amounts[0]))
      ?? baseSnapshot.retailPrice
      ?? null;

    return {
      ...baseSnapshot,
      currentBid,
      retailPrice,
      assuranceFee: assurance.fee,
      assuranceSelected: assurance.selected,
      detailContainer: container,
      detailInsertionTarget: getDetailInjectionTarget(container),
    };
  }

  function findInsertionTarget(snapshot) {
    if (!document.body) {
      return null;
    }

    // When the detail card has been identified, use its injection target directly.
    // findBidLabelTarget() may match unrelated bid labels elsewhere on the page
    // (e.g. an Algolia search facet labelled "Current Bid" on the all-deals page).
    if (snapshot && snapshot.detailInsertionTarget) {
      return snapshot.detailInsertionTarget;
    }
    if (snapshot && snapshot.detailContainer) {
      return snapshot.detailContainer;
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
      assuranceEnabled: false,
      taxRate: taxSelection.rate,
    };

    if (snapshot.assuranceSelected) {
      effectiveSettings.assuranceEnabled = true;
      effectiveSettings.assuranceFee = snapshot.assuranceFee !== null && snapshot.assuranceFee !== undefined
        ? snapshot.assuranceFee
        : settings.assuranceFee;
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

  function updateBudgetResult(container, effectiveSettings, currentTotal) {
    const result = container.querySelector('[data-macbid-budget-result]');
    const budgetAmount = getBudgetAmount();

    if (!result) {
      return;
    }

    if (budgetAmount === null) {
      result.textContent = '';
      result.className = 'macbid-tp-badge';
      return;
    }

    const maxBid = fees.maxBidFromBudget(budgetAmount, effectiveSettings);

    if (currentTotal !== null && currentTotal !== undefined && Number.isFinite(currentTotal)) {
      const excess = fees.roundCurrency(currentTotal - budgetAmount);
      if (excess > 0) {
        result.textContent = `Exceeds budget by ${formatCurrency(excess)}`;
        result.className = 'macbid-tp-badge macbid-tp-badge--over-budget';
      } else {
        result.textContent = `Fits • Max safe bid: ${formatCurrency(maxBid)}`;
        result.className = 'macbid-tp-badge macbid-tp-badge--fits-budget';
      }
    } else {
      result.textContent = `Max safe bid: ${formatCurrency(maxBid)}`;
      result.className = 'macbid-tp-badge';
    }
  }

  function createBudgetControls(effectiveSettings, currentTotal) {
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
      updateBudgetResult(controls, effectiveSettings, currentTotal);
    });

    label.append(input);
    controls.append(label, result);
    updateBudgetResult(controls, effectiveSettings, currentTotal);

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
        // Exclude BEM child elements (lot-card__price-current, lot-card__price-retail,
        // etc.) — these are content slots inside cards, not card containers.
        const cls = typeof node.className === 'string' ? node.className : '';
        if (/__/.test(cls)) return false;
        const text = node.innerText || node.textContent || '';
        const dollarCount = (text.match(/\$[0-9]/g) || []).length;
        return text.length < 1200 && dollarCount <= 6 && /\b(?:current|high)\s+bid\b|\$[0-9]/i.test(text);
      });
  }

  function getCardTextWithoutBadge(card) {
    const clone = card.cloneNode(true);
    clone.querySelectorAll('.macbid-tp-badge').forEach((badge) => badge.remove());
    return clone.innerText || clone.textContent || '';
  }

  function extractCardPrice(card, classFragment) {
    const el = card.querySelector(`[class*="${classFragment}"]`);
    if (!el || isInsideOverlay(el)) {
      return undefined; // element absent — caller may fall back to text parsing
    }
    return parser.parseCurrency(el.innerText || el.textContent || '');
    // returns null if element exists but is empty/unparseable — caller should wait
  }

  function renderListingBadges() {
    const candidates = getListingCandidates();

    candidates.slice(0, 80).forEach((card) => {
      // If an ancestor element was already badged this render pass, skip this
      // descendant — prevents double-badges when parent and child both match.
      let ancestor = card.parentElement;
      while (ancestor && ancestor !== document.body) {
        if (ancestor.querySelector(':scope > .macbid-tp-badge--listing')) return;
        ancestor = ancestor.parentElement;
      }

      const cardText = getCardTextWithoutBadge(card);
      const snapshot = typeof parser.parseListingSnapshotFromText === 'function'
        ? parser.parseListingSnapshotFromText(cardText)
        : parser.parseSnapshotFromText(cardText);

      // Read prices directly from the known price elements. Text-parsing is
      // unreliable on listing cards (picks up wrong prices from neighbours),
      // so we only badge once we have a confirmed number from the DOM.
      const currentBid = extractCardPrice(card, 'price-current');
      const retailPrice = extractCardPrice(card, 'price-retail') ?? snapshot.retailPrice;

      if (!Number.isFinite(currentBid)) {
        return;
      }

      const resolvedSnapshot = { ...snapshot, currentBid, retailPrice };
      const taxSelection = taxes.selectTaxRate({
        settings,
        locationName: snapshot.locationName,
        stateCode: snapshot.stateCode,
      });
      const effectiveSettings = getEffectiveSettings(resolvedSnapshot, taxSelection);
      const total = fees.calculateTotal(currentBid, effectiveSettings);
      const quality = getDealQuality(total.total, retailPrice);
      const signature = JSON.stringify({
        bid: currentBid,
        assuranceFee: snapshot.assuranceFee,
        stateCode: snapshot.stateCode,
        locationName: snapshot.locationName,
        total: total.total,
        quality,
      });
      let badge = card.querySelector(':scope > .macbid-tp-badge--listing');

      if (!badge) {
        badge = createElement('span', 'macbid-tp-badge macbid-tp-badge--listing');
        if (root.getComputedStyle(card).position === 'static') {
          card.style.position = 'relative';
        }
        card.insertAdjacentElement('afterbegin', badge);
      }

      if (badge.dataset.macbidSignature !== signature) {
        badge.textContent = `Est. ${formatCurrency(total.total)}`;
        badge.title = `Estimated total with fees and ${taxSelection.label}`;
        badge.dataset.macbidSignature = signature;
        badge.className = `macbid-tp-badge macbid-tp-badge--listing${quality ? ` macbid-tp-badge--${quality}` : ''}`;
      }
    });
  }

  function renderWarning(overlayRoot) {
    overlayRoot.replaceChildren(
      createElement('div', 'macbid-tp-warning macbid-tp-warning--waiting', 'Waiting for current bid… The estimate will update automatically when it appears.'),
    );
  }

  function createSavingsBar(totalAmount, retailPrice) {
    if (!retailPrice || !Number.isFinite(retailPrice) || retailPrice <= 0) {
      return null;
    }
    const ratio = Math.min(1, Math.max(0, totalAmount / retailPrice));
    const quality = getDealQuality(totalAmount, retailPrice);
    const bar = createElement('div', 'macbid-tp-savings-bar');
    const fill = createElement('div', `macbid-tp-savings-fill${quality ? ` macbid-tp-savings-fill--${quality}` : ''}`);
    fill.style.width = `${Math.round(ratio * 100)}%`;
    bar.append(fill);
    return bar;
  }

  function createBreakdownToggle(breakdown) {
    const toggle = createElement('button', 'macbid-tp-breakdown-toggle', 'Show breakdown ▾');
    breakdown.classList.add('macbid-tp-breakdown--collapsed');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const isCollapsed = breakdown.classList.toggle('macbid-tp-breakdown--collapsed');
      toggle.textContent = isCollapsed ? 'Show breakdown ▾' : 'Hide breakdown ▴';
      toggle.setAttribute('aria-expanded', String(!isCollapsed));
    });
    return toggle;
  }

  function renderPanel(overlayRoot, snapshot) {
    const taxSelection = taxes.selectTaxRate({
      settings,
      locationName: snapshot.locationName,
      stateCode: snapshot.stateCode,
    });
    const effectiveSettings = getEffectiveSettings(snapshot, taxSelection);
    const total = fees.calculateTotal(snapshot.currentBid, effectiveSettings);
    const quality = getDealQuality(total.total, snapshot.retailPrice);
    const signature = JSON.stringify({
      total: total.total,
      bid: total.bid,
      premium: total.premium,
      premiumRate: effectiveSettings.premiumRate,
      lotFee: total.lotFee,
      assurance: total.assurance,
      taxAmount: total.taxAmount,
      taxRate: total.taxRate,
      overhead: total.overhead,
      retailPrice: snapshot.retailPrice,
      taxLabel: taxSelection.label,
      budget: settings.budget,
      rgb: settings.rgbGlowEnabled,
      quality,
    });
    const existingPanel = overlayRoot.firstElementChild;

    if (existingPanel && existingPanel.dataset.macbidSig === signature) {
      return;
    }

    const panel = createElement('div', 'macbid-tp-panel');
    const taxNote = `${taxSelection.label}: ${formatPercent(taxSelection.rate)} estimate. Local taxes may vary.`;
    const breakdown = createElement('div', 'macbid-tp-breakdown');

    panel.dataset.macbidSig = signature;

    if (settings.rgbGlowEnabled) {
      panel.classList.add('macbid-tp-panel-rgb');
    }

    const totalEl = createElement('p', 'macbid-tp-total', formatCurrency(total.total));
    if (quality) {
      totalEl.classList.add(`macbid-tp-total--${quality}`);
    }

    panel.append(
      createElement('p', 'macbid-tp-kicker', 'Estimated total'),
      totalEl,
      createElement('p', 'macbid-tp-note', taxNote),
    );

    if (snapshot.retailPrice !== null && snapshot.retailPrice !== undefined && snapshot.retailPrice > 0) {
      panel.append(createElement(
        'p',
        'macbid-tp-note',
        `${formatPercent(total.total / snapshot.retailPrice)} of ${formatCurrency(snapshot.retailPrice)} retail`,
      ));
      const savingsBar = createSavingsBar(total.total, snapshot.retailPrice);
      if (savingsBar) {
        panel.append(savingsBar);
      }
    }

    breakdown.append(
      createRow('Current bid', formatCurrency(total.bid)),
      createRow(`Buyer premium (${formatPercent(effectiveSettings.premiumRate)})`, formatCurrency(total.premium)),
      createRow('Lot fee', formatCurrency(total.lotFee)),
      createRow('Assurance', formatCurrency(total.assurance)),
      createRow(`Sales tax (${formatPercent(total.taxRate)})`, formatCurrency(total.taxAmount)),
      createRow('Fees above bid', formatCurrency(total.overhead)),
    );

    const toggle = createBreakdownToggle(breakdown);
    panel.append(toggle, breakdown, createBudgetControls(effectiveSettings, total.total));
    overlayRoot.replaceChildren(panel);
  }

  function render() {
    if (!document.body) {
      return;
    }

    const snapshot = getSnapshot();
    const hasDetailView = Boolean(snapshot.detailContainer);

    if (hasDetailView) {
      removeListingBadges();
    } else {
      renderListingBadges();
    }

    const likelyItemPage = isLikelyItemPage(snapshot);

    if (!likelyItemPage) {
      removeRoot();
      return;
    }

    const target = findInsertionTarget(snapshot);
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
