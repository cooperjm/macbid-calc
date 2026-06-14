# MAC.BID Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome Manifest V3 extension that adds estimated all-in MAC.BID pricing to item pages, updates live when bids change, and adds compact badges to listing pages.

**Architecture:** Keep the existing `index.html` calculator intact and add a separate no-build `extension/` folder. Shared logic lives in browser-loadable UMD-style modules under `extension/shared/`, so content scripts, options code, and Node tests can use the same functions.

**Tech Stack:** Chrome Manifest V3, plain JavaScript, CSS, `chrome.storage.sync`, Node's built-in `node:test` runner.

---

## File Structure

- Create `package.json`: test script for Node's built-in test runner.
- Create `extension/manifest.json`: MV3 extension metadata, host permissions, content scripts, options page.
- Create `extension/content.css`: injected item panel and listing badge styles.
- Create `extension/content.js`: page detection, parsing orchestration, panel rendering, listing badges, live `MutationObserver`.
- Create `extension/options.html`: extension settings UI.
- Create `extension/options.js`: load/save/reset settings.
- Create `extension/shared/fees.js`: fee defaults, total calculation, max-safe-bid calculation, settings normalization.
- Create `extension/shared/taxes.js`: state tax table, warehouse mapping, tax-source selection.
- Create `extension/shared/parser.js`: currency parsing, state/location parsing, page snapshot extraction.
- Create `extension/tests/fees.test.mjs`: fee math tests.
- Create `extension/tests/taxes.test.mjs`: tax selection tests.
- Create `extension/tests/parser.test.mjs`: parser tests using plain text fixtures.
- Modify `README.md`: add local extension loading and test instructions.

## Task 1: Test Harness And Extension Scaffold

**Files:**
- Create: `package.json`
- Create: `extension/icon.svg`
- Create: `extension/manifest.json`
- Create: `extension/content.css`
- Modify: `README.md`

- [ ] **Step 1: Create the package test script**

Create `package.json`:

```json
{
  "name": "macbid-calc",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "node --test \"extension/tests/*.test.mjs\""
  }
}
```

- [ ] **Step 2: Create the MV3 manifest**

Create `extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "MAC.BID True Price",
  "version": "0.1.0",
  "description": "Estimate the actual MAC.BID total with fees and sales tax.",
  "permissions": ["storage"],
  "host_permissions": ["https://www.mac.bid/*", "https://mac.bid/*"],
  "content_scripts": [
    {
      "matches": ["https://www.mac.bid/*", "https://mac.bid/*"],
      "css": ["content.css"],
      "js": [
        "shared/fees.js",
        "shared/taxes.js",
        "shared/parser.js",
        "content.js"
      ],
      "run_at": "document_idle"
    }
  ],
  "options_page": "options.html",
  "icons": {
    "16": "icon.svg",
    "48": "icon.svg",
    "128": "icon.svg"
  }
}
```

- [ ] **Step 3: Copy the extension icon**

Create `extension/icon.svg` by copying the existing root `icon.svg` contents into the extension folder. Chrome extension icons must be inside the extension root.

- [ ] **Step 4: Create baseline content CSS**

Create `extension/content.css`:

```css
#macbid-true-price-root {
  font-family: Inter, Arial, sans-serif;
  color: #1f1726;
  margin: 14px 0;
}

.macbid-tp-panel {
  border: 1px solid #d7c9e7;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 22px rgba(31, 23, 38, 0.12);
  padding: 14px;
  max-width: 420px;
}

.macbid-tp-kicker {
  color: #6f5a87;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.macbid-tp-total {
  color: #24122f;
  font-size: 28px;
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: 8px;
}

.macbid-tp-note,
.macbid-tp-row {
  color: #5d5268;
  font-size: 13px;
}

.macbid-tp-breakdown {
  display: grid;
  gap: 5px;
  margin: 10px 0;
}

.macbid-tp-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
}

.macbid-tp-row strong {
  color: #24122f;
}

.macbid-tp-controls {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.macbid-tp-controls label {
  color: #5d5268;
  font-size: 12px;
  font-weight: 700;
}

.macbid-tp-controls input {
  width: 100%;
  border: 1px solid #d7c9e7;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
}

.macbid-tp-warning {
  border-color: #f0c36a;
  background: #fffaf0;
}

.macbid-tp-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: #24122f;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  padding: 4px 8px;
  margin: 4px 0;
}
```

- [ ] **Step 5: Document loading the extension**

Append this section to `README.md`:

```markdown
## Chrome extension development

This repo also contains an unpacked Chrome extension in `extension/`.

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension/` folder.
5. Visit a MAC.BID item page and confirm the estimated total panel appears.

Run focused shared-logic tests with `npm test`.
```

- [ ] **Step 6: Run scaffold verification**

Run: `npm test`

Expected: FAIL with no tests found or missing test files. This confirms the script exists before test files are added.

## Task 2: Fee Calculation Module

**Files:**
- Create: `extension/shared/fees.js`
- Create: `extension/tests/fees.test.mjs`

- [ ] **Step 1: Write fee tests**

Create `extension/tests/fees.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import "../shared/fees.js";

const { calculateTotal, maxBidFromBudget, normalizeSettings, DEFAULT_SETTINGS } = globalThis.MacbidFees;

test("calculateTotal returns full fee breakdown", () => {
  const result = calculateTotal(100, {
    premiumRate: 0.15,
    lotFee: 3,
    assuranceEnabled: true,
    assuranceFee: 7,
    taxRate: 0.06
  });

  assert.equal(result.bid, 100);
  assert.equal(result.premium, 15);
  assert.equal(result.lotFee, 3);
  assert.equal(result.assurance, 7);
  assert.equal(result.subtotal, 125);
  assert.equal(result.taxAmount, 7.5);
  assert.equal(result.total, 132.5);
  assert.equal(result.overhead, 32.5);
});

test("maxBidFromBudget reverses the total formula", () => {
  const bid = maxBidFromBudget(132.5, {
    premiumRate: 0.15,
    lotFee: 3,
    assuranceEnabled: true,
    assuranceFee: 7,
    taxRate: 0.06
  });

  assert.equal(Number(bid.toFixed(2)), 100);
});

test("normalizeSettings falls back to safe defaults", () => {
  const settings = normalizeSettings({
    premiumRate: "bad",
    lotFee: -10,
    assuranceFee: "7",
    customTaxRate: "6.5"
  });

  assert.equal(settings.premiumRate, DEFAULT_SETTINGS.premiumRate);
  assert.equal(settings.lotFee, DEFAULT_SETTINGS.lotFee);
  assert.equal(settings.assuranceFee, 7);
  assert.equal(settings.customTaxRate, 0.065);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL because `extension/shared/fees.js` does not exist.

- [ ] **Step 3: Implement fee module**

Create `extension/shared/fees.js`:

```js
(function attachMacbidFees(root) {
  const DEFAULT_SETTINGS = {
    premiumRate: 0.15,
    lotFee: 3,
    assuranceEnabled: false,
    assuranceFee: 7,
    customTaxEnabled: false,
    customTaxRate: null,
    budget: ""
  };

  function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeRate(value, fallback) {
    if (value === null || value === undefined || value === "") return fallback;
    const number = toNumber(value, fallback);
    if (number > 1) return number / 100;
    if (number < 0) return fallback;
    return number;
  }

  function normalizeMoney(value, fallback) {
    const number = toNumber(value, fallback);
    return number >= 0 ? number : fallback;
  }

  function normalizeSettings(input) {
    const raw = input || {};
    return {
      premiumRate: normalizeRate(raw.premiumRate, DEFAULT_SETTINGS.premiumRate),
      lotFee: normalizeMoney(raw.lotFee, DEFAULT_SETTINGS.lotFee),
      assuranceEnabled: Boolean(raw.assuranceEnabled),
      assuranceFee: normalizeMoney(raw.assuranceFee, DEFAULT_SETTINGS.assuranceFee),
      customTaxEnabled: Boolean(raw.customTaxEnabled),
      customTaxRate: raw.customTaxRate === null || raw.customTaxRate === undefined || raw.customTaxRate === ""
        ? null
        : normalizeRate(raw.customTaxRate, null),
      budget: raw.budget === undefined || raw.budget === null ? "" : String(raw.budget)
    };
  }

  function roundCurrency(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function calculateTotal(bid, options) {
    const settings = normalizeSettings(options);
    const cleanBid = normalizeMoney(bid, 0);
    const taxRate = normalizeRate(options && options.taxRate, 0) || 0;
    const premium = roundCurrency(cleanBid * settings.premiumRate);
    const lotFee = roundCurrency(settings.lotFee);
    const assurance = settings.assuranceEnabled ? roundCurrency(settings.assuranceFee) : 0;
    const subtotal = roundCurrency(cleanBid + premium + lotFee + assurance);
    const taxAmount = roundCurrency(subtotal * taxRate);
    const total = roundCurrency(subtotal + taxAmount);

    return {
      bid: roundCurrency(cleanBid),
      premium,
      lotFee,
      assurance,
      subtotal,
      taxRate,
      taxAmount,
      total,
      overhead: roundCurrency(total - cleanBid)
    };
  }

  function maxBidFromBudget(budget, options) {
    const settings = normalizeSettings(options);
    const cleanBudget = normalizeMoney(budget, 0);
    const taxRate = normalizeRate(options && options.taxRate, 0) || 0;
    const fixedFees = settings.lotFee + (settings.assuranceEnabled ? settings.assuranceFee : 0);
    const numerator = cleanBudget - fixedFees * (1 + taxRate);
    const denominator = (1 + settings.premiumRate) * (1 + taxRate);
    if (denominator <= 0) return 0;
    return Math.max(0, roundCurrency(numerator / denominator));
  }

  const api = {
    DEFAULT_SETTINGS,
    calculateTotal,
    maxBidFromBudget,
    normalizeSettings,
    roundCurrency
  };

  root.MacbidFees = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS for `fees.test.mjs`.

## Task 3: Tax Selection Module

**Files:**
- Create: `extension/shared/taxes.js`
- Create: `extension/tests/taxes.test.mjs`

- [ ] **Step 1: Write tax tests**

Create `extension/tests/taxes.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import "../shared/taxes.js";

const { selectTaxRate, normalizeStateCode } = globalThis.MacbidTaxes;

test("selectTaxRate prefers custom tax", () => {
  const result = selectTaxRate({
    stateCode: "PA",
    locationName: "Pittsburgh Mills",
    settings: { customTaxEnabled: true, customTaxRate: 0.0725 }
  });

  assert.equal(result.rate, 0.0725);
  assert.equal(result.source, "Custom tax");
  assert.equal(result.kind, "custom");
});

test("selectTaxRate uses known warehouse before state base tax", () => {
  const result = selectTaxRate({
    stateCode: "PA",
    locationName: "Pittsburgh Mills",
    settings: {}
  });

  assert.equal(result.kind, "warehouse");
  assert.equal(result.label.includes("Pittsburgh Mills"), true);
});

test("selectTaxRate falls back to state base tax", () => {
  const result = selectTaxRate({
    stateCode: "SC",
    locationName: "Unknown warehouse",
    settings: {}
  });

  assert.equal(result.rate, 0.06);
  assert.equal(result.kind, "state");
  assert.equal(result.label, "SC base tax");
});

test("normalizeStateCode handles names and codes", () => {
  assert.equal(normalizeStateCode("Pennsylvania"), "PA");
  assert.equal(normalizeStateCode("pa"), "PA");
  assert.equal(normalizeStateCode("not real"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL because `extension/shared/taxes.js` does not exist.

- [ ] **Step 3: Implement tax module**

Create `extension/shared/taxes.js`:

```js
(function attachMacbidTaxes(root) {
  const STATE_NAMES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
    MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
    NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
    ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
    RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
    TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
    WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"
  };

  const STATE_BASE_RATES = {
    AK: 0, DE: 0, MT: 0, NH: 0, OR: 0,
    PA: 0.06, OH: 0.0575, SC: 0.06, NC: 0.0475, GA: 0.04, TX: 0.0625
  };

  const DEFAULT_STATE_RATE = 0.06;

  const WAREHOUSE_RATES = [
    { match: "pittsburgh mills", label: "Pittsburgh Mills estimate", state: "PA", rate: 0.07 },
    { match: "monroeville", label: "Monroeville estimate", state: "PA", rate: 0.07 },
    { match: "robinson", label: "Robinson estimate", state: "PA", rate: 0.07 },
    { match: "beaver falls", label: "Beaver Falls estimate", state: "PA", rate: 0.06 },
    { match: "akron", label: "Akron estimate", state: "OH", rate: 0.0675 },
    { match: "canton", label: "Canton estimate", state: "OH", rate: 0.065 },
    { match: "rock hill", label: "Rock Hill estimate", state: "SC", rate: 0.07 },
    { match: "spartanburg", label: "Spartanburg estimate", state: "SC", rate: 0.07 },
    { match: "gastonia", label: "Gastonia estimate", state: "NC", rate: 0.07 },
    { match: "el paso", label: "El Paso estimate", state: "TX", rate: 0.0825 }
  ];

  function normalizeStateCode(value) {
    if (!value) return null;
    const clean = String(value).trim();
    if (/^[a-z]{2}$/i.test(clean)) {
      const code = clean.toUpperCase();
      return STATE_NAMES[code] ? code : null;
    }

    const lower = clean.toLowerCase();
    for (const [code, name] of Object.entries(STATE_NAMES)) {
      if (name.toLowerCase() === lower) return code;
    }

    return null;
  }

  function findWarehouseRate(locationName) {
    if (!locationName) return null;
    const lower = String(locationName).toLowerCase();
    return WAREHOUSE_RATES.find((entry) => lower.includes(entry.match)) || null;
  }

  function selectTaxRate({ stateCode, locationName, settings }) {
    const customEnabled = Boolean(settings && settings.customTaxEnabled);
    const customRate = settings && Number(settings.customTaxRate);
    if (customEnabled && Number.isFinite(customRate) && customRate >= 0) {
      return { rate: customRate, source: "Custom tax", label: "Custom tax", kind: "custom" };
    }

    const warehouse = findWarehouseRate(locationName);
    if (warehouse) {
      return {
        rate: warehouse.rate,
        source: warehouse.label,
        label: warehouse.label,
        stateCode: warehouse.state,
        kind: "warehouse"
      };
    }

    const normalizedState = normalizeStateCode(stateCode);
    if (normalizedState) {
      const rate = Object.prototype.hasOwnProperty.call(STATE_BASE_RATES, normalizedState)
        ? STATE_BASE_RATES[normalizedState]
        : DEFAULT_STATE_RATE;
      return {
        rate,
        source: `${normalizedState} base tax`,
        label: `${normalizedState} base tax`,
        stateCode: normalizedState,
        kind: "state"
      };
    }

    return {
      rate: 0,
      source: "Tax unknown",
      label: "Tax unknown",
      stateCode: null,
      kind: "unknown"
    };
  }

  const api = {
    STATE_NAMES,
    STATE_BASE_RATES,
    WAREHOUSE_RATES,
    normalizeStateCode,
    findWarehouseRate,
    selectTaxRate
  };

  root.MacbidTaxes = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS for fee and tax tests.

## Task 4: Parser Module

**Files:**
- Create: `extension/shared/parser.js`
- Create: `extension/tests/parser.test.mjs`

- [ ] **Step 1: Write parser tests**

Create `extension/tests/parser.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import "../shared/parser.js";

const { parseCurrency, extractStateCode, parseSnapshotFromText } = globalThis.MacbidParser;

test("parseCurrency handles dollars, commas, and cents", () => {
  assert.equal(parseCurrency("$1,234.56"), 1234.56);
  assert.equal(parseCurrency("Current Bid $42"), 42);
  assert.equal(parseCurrency("No price"), null);
});

test("extractStateCode finds codes and state names", () => {
  assert.equal(extractStateCode("Pittsburgh Mills, PA"), "PA");
  assert.equal(extractStateCode("Pickup in South Carolina"), "SC");
  assert.equal(extractStateCode("No state here"), null);
});

test("parseSnapshotFromText extracts common item fields", () => {
  const snapshot = parseSnapshotFromText(`
    Current Bid $55.00
    Retail Price $199.99
    Location Pittsburgh Mills, PA
    Buyer's Assurance $7
  `);

  assert.equal(snapshot.currentBid, 55);
  assert.equal(snapshot.retailPrice, 199.99);
  assert.equal(snapshot.assuranceFee, 7);
  assert.equal(snapshot.stateCode, "PA");
  assert.equal(snapshot.locationName.includes("Pittsburgh Mills"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL because `extension/shared/parser.js` does not exist.

- [ ] **Step 3: Implement parser module**

Create `extension/shared/parser.js`:

```js
(function attachMacbidParser(root) {
  const STATE_NAME_TO_CODE = {
    alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
    colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
    hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
    kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
    massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
    missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
    "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
    "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN",
    texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
    "west virginia": "WV", wisconsin: "WI", wyoming: "WY"
  };

  function parseCurrency(value) {
    if (value === null || value === undefined) return null;
    const match = String(value).match(/\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
    if (!match) return null;
    const number = Number(match[1].replace(/,/g, ""));
    return Number.isFinite(number) ? number : null;
  }

  function extractStateCode(text) {
    if (!text) return null;
    const value = String(text);
    const codeMatch = value.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i);
    if (codeMatch) return codeMatch[1].toUpperCase();

    const lower = value.toLowerCase();
    for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
      if (lower.includes(name)) return code;
    }
    return null;
  }

  function findAmountAfterLabel(text, labels) {
    const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
    for (const label of labels) {
      const labelLower = label.toLowerCase();
      const line = lines.find((entry) => entry.toLowerCase().includes(labelLower));
      const amount = parseCurrency(line);
      if (amount !== null) return amount;
    }
    return null;
  }

  function findLocationLine(text) {
    const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const line = lines.find((entry) => /location|pickup|warehouse/i.test(entry) && extractStateCode(entry));
    if (!line) return "";
    return line.replace(/^(location|pickup|warehouse)\s*:?\s*/i, "").trim();
  }

  function parseSnapshotFromText(text) {
    const bodyText = String(text || "");
    const locationName = findLocationLine(bodyText);
    return {
      currentBid: findAmountAfterLabel(bodyText, ["Current Bid", "High Bid", "Bid"]),
      retailPrice: findAmountAfterLabel(bodyText, ["Retail Price", "Retail", "MSRP"]),
      assuranceFee: findAmountAfterLabel(bodyText, ["Buyer's Assurance", "Buyer Assurance", "Assurance"]),
      stateCode: extractStateCode(locationName || bodyText),
      locationName
    };
  }

  function parseSnapshotFromDocument(doc) {
    const text = doc && doc.body ? doc.body.innerText || doc.body.textContent || "" : "";
    return parseSnapshotFromText(text);
  }

  const api = {
    parseCurrency,
    extractStateCode,
    parseSnapshotFromText,
    parseSnapshotFromDocument
  };

  root.MacbidParser = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS for fee, tax, and parser tests.

## Task 5: Item Page Overlay And Live Updates

**Files:**
- Create: `extension/content.js`

- [ ] **Step 1: Create content script with panel rendering**

Create `extension/content.js`:

```js
(function initMacbidTruePrice() {
  const ROOT_ID = "macbid-true-price-root";
  const STORAGE_KEY = "macbidTruePriceSettings";
  const { calculateTotal, maxBidFromBudget, normalizeSettings, DEFAULT_SETTINGS } = globalThis.MacbidFees;
  const { selectTaxRate } = globalThis.MacbidTaxes;
  const { parseSnapshotFromDocument } = globalThis.MacbidParser;

  let settings = normalizeSettings(DEFAULT_SETTINGS);
  let lastSignature = "";
  let updateTimer = null;
  let observer = null;

  function formatMoney(value) {
    return "$" + Number(value || 0).toFixed(2);
  }

  function formatPercent(value) {
    return (Number(value || 0) * 100).toFixed(2).replace(/\.00$/, "") + "%";
  }

  function getStorage() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
      return chrome.storage.sync;
    }
    return null;
  }

  function loadSettings() {
    return new Promise((resolve) => {
      const storage = getStorage();
      if (!storage) {
        resolve(normalizeSettings(DEFAULT_SETTINGS));
        return;
      }
      storage.get(STORAGE_KEY, (result) => {
        resolve(normalizeSettings(result && result[STORAGE_KEY]));
      });
    });
  }

  function isLikelyItemPage(snapshot) {
    return snapshot.currentBid !== null || /\/auction|\/lot|\/product|\/item/i.test(location.pathname);
  }

  function findInsertionTarget() {
    const textMatches = Array.from(document.querySelectorAll("body *"))
      .filter((node) => node.children.length < 4 && /current bid|high bid/i.test(node.textContent || ""));
    return textMatches[0] && textMatches[0].parentElement ? textMatches[0].parentElement : document.body.firstElementChild || document.body;
  }

  function getOrCreateRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement("div");
    root.id = ROOT_ID;
    const target = findInsertionTarget();
    target.insertAdjacentElement("afterend", root);
    return root;
  }

  function renderMissing(root, message) {
    root.innerHTML = `
      <section class="macbid-tp-panel macbid-tp-warning">
        <div class="macbid-tp-kicker">MAC.BID true price</div>
        <div class="macbid-tp-note">${message}</div>
      </section>
    `;
  }

  function renderPanel(root, snapshot) {
    const tax = selectTaxRate({
      stateCode: snapshot.stateCode,
      locationName: snapshot.locationName,
      settings
    });
    const effectiveSettings = {
      ...settings,
      assuranceEnabled: settings.assuranceEnabled || snapshot.assuranceFee !== null,
      assuranceFee: snapshot.assuranceFee !== null ? snapshot.assuranceFee : settings.assuranceFee,
      taxRate: tax.rate
    };
    const result = calculateTotal(snapshot.currentBid, effectiveSettings);
    const budget = Number(settings.budget);
    const maxBid = Number.isFinite(budget) && budget > 0 ? maxBidFromBudget(budget, effectiveSettings) : null;
    const retail = snapshot.retailPrice ? Math.round((result.total / snapshot.retailPrice) * 100) : null;

    root.innerHTML = `
      <section class="macbid-tp-panel">
        <div class="macbid-tp-kicker">Estimated total with fees</div>
        <div class="macbid-tp-total">${formatMoney(result.total)}</div>
        <div class="macbid-tp-note">${tax.label} (${formatPercent(tax.rate)}). Local tax may vary.</div>
        <div class="macbid-tp-breakdown">
          <div class="macbid-tp-row"><span>Current bid</span><strong>${formatMoney(result.bid)}</strong></div>
          <div class="macbid-tp-row"><span>Buyer's premium</span><strong>${formatMoney(result.premium)}</strong></div>
          <div class="macbid-tp-row"><span>Lot fee</span><strong>${formatMoney(result.lotFee)}</strong></div>
          <div class="macbid-tp-row"><span>Assurance</span><strong>${formatMoney(result.assurance)}</strong></div>
          <div class="macbid-tp-row"><span>Sales tax</span><strong>${formatMoney(result.taxAmount)}</strong></div>
          <div class="macbid-tp-row"><span>Fees above bid</span><strong>${formatMoney(result.overhead)}</strong></div>
        </div>
        ${retail ? `<div class="macbid-tp-note">Estimated total is ${retail}% of listed retail.</div>` : ""}
        ${maxBid !== null ? `<div class="macbid-tp-note">Max bid for ${formatMoney(budget)} budget: <strong>${formatMoney(maxBid)}</strong></div>` : ""}
        <div class="macbid-tp-controls">
          <label for="macbid-tp-budget">Budget for max safe bid</label>
          <input id="macbid-tp-budget" type="number" min="0" step="1" value="${settings.budget}" placeholder="Optional budget">
        </div>
      </section>
    `;

    const budgetInput = root.querySelector("#macbid-tp-budget");
    if (budgetInput) {
      budgetInput.addEventListener("input", () => {
        settings = normalizeSettings({ ...settings, budget: budgetInput.value });
        saveSettings(settings);
        scheduleUpdate();
      });
    }
  }

  function saveSettings(nextSettings) {
    const storage = getStorage();
    if (!storage) return;
    storage.set({ [STORAGE_KEY]: normalizeSettings(nextSettings) });
  }

  function update() {
    const root = getOrCreateRoot();
    const snapshot = parseSnapshotFromDocument(document);
    if (!isLikelyItemPage(snapshot)) return;
    if (snapshot.currentBid === null) {
      renderMissing(root, "Current bid not found. The estimate will appear when the bid can be read.");
      return;
    }

    const signature = JSON.stringify({ snapshot, settings });
    if (signature === lastSignature) return;
    lastSignature = signature;
    renderPanel(root, snapshot);
  }

  function scheduleUpdate() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(update, 150);
  }

  function startObserver() {
    observer = new MutationObserver((mutations) => {
      const ownChange = mutations.every((mutation) => {
        const target = mutation.target;
        return target && target.nodeType === 1 && target.closest && target.closest(`#${ROOT_ID}`);
      });
      if (!ownChange) scheduleUpdate();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  loadSettings().then((loaded) => {
    settings = loaded;
    update();
    startObserver();
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(() => loadSettings().then((next) => {
        settings = next;
        lastSignature = "";
        scheduleUpdate();
      }));
    }
  });

  window.addEventListener("beforeunload", () => {
    if (observer) observer.disconnect();
  });
})();
```

- [ ] **Step 2: Run shared tests**

Run: `npm test`

Expected: PASS. The content script is manually verified in Task 8 because it depends on Chrome extension APIs and the live MAC.BID DOM.

## Task 6: Options Page

**Files:**
- Create: `extension/options.html`
- Create: `extension/options.js`

- [ ] **Step 1: Create options UI**

Create `extension/options.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MAC.BID True Price Options</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 620px; margin: 32px auto; padding: 0 16px; color: #24122f; }
    h1 { font-size: 24px; }
    label { display: grid; gap: 6px; margin: 14px 0; font-weight: 700; }
    input { border: 1px solid #d7c9e7; border-radius: 8px; padding: 9px 10px; font-size: 15px; }
    input[type="checkbox"] { width: auto; justify-self: start; }
    button { border: 0; border-radius: 8px; padding: 10px 14px; font-weight: 800; cursor: pointer; }
    .primary { background: #24122f; color: white; }
    .secondary { background: #eee8f5; color: #24122f; }
    .row { display: flex; gap: 10px; margin-top: 18px; }
    #status { margin-top: 12px; color: #5d5268; }
  </style>
</head>
<body>
  <h1>MAC.BID True Price Options</h1>
  <p>Adjust the defaults used by the estimate panel. Tax and totals are still estimates.</p>

  <label>
    Buyer's premium percent
    <input id="premiumRate" type="number" min="0" step="0.1">
  </label>

  <label>
    Lot fee
    <input id="lotFee" type="number" min="0" step="0.01">
  </label>

  <label>
    Enable buyer's assurance by default
    <input id="assuranceEnabled" type="checkbox">
  </label>

  <label>
    Buyer's assurance amount
    <input id="assuranceFee" type="number" min="0" step="0.01">
  </label>

  <label>
    Use custom tax by default
    <input id="customTaxEnabled" type="checkbox">
  </label>

  <label>
    Custom tax percent
    <input id="customTaxRate" type="number" min="0" step="0.01">
  </label>

  <div class="row">
    <button class="primary" id="save">Save</button>
    <button class="secondary" id="reset">Reset defaults</button>
  </div>
  <div id="status" role="status"></div>

  <script src="shared/fees.js"></script>
  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create options behavior**

Create `extension/options.js`:

```js
(function initOptions() {
  const STORAGE_KEY = "macbidTruePriceSettings";
  const { DEFAULT_SETTINGS, normalizeSettings } = globalThis.MacbidFees;

  function $(id) {
    return document.getElementById(id);
  }

  function storage() {
    return chrome.storage.sync;
  }

  function percentFromRate(rate) {
    return rate === null || rate === undefined ? "" : String(Number(rate) * 100);
  }

  function rateFromPercent(value) {
    if (value === "") return null;
    return Number(value) / 100;
  }

  function fillForm(settings) {
    $("premiumRate").value = percentFromRate(settings.premiumRate);
    $("lotFee").value = settings.lotFee;
    $("assuranceEnabled").checked = settings.assuranceEnabled;
    $("assuranceFee").value = settings.assuranceFee;
    $("customTaxEnabled").checked = settings.customTaxEnabled;
    $("customTaxRate").value = percentFromRate(settings.customTaxRate);
  }

  function readForm() {
    return normalizeSettings({
      premiumRate: rateFromPercent($("premiumRate").value),
      lotFee: $("lotFee").value,
      assuranceEnabled: $("assuranceEnabled").checked,
      assuranceFee: $("assuranceFee").value,
      customTaxEnabled: $("customTaxEnabled").checked,
      customTaxRate: rateFromPercent($("customTaxRate").value)
    });
  }

  function setStatus(message) {
    $("status").textContent = message;
    setTimeout(() => {
      if ($("status").textContent === message) $("status").textContent = "";
    }, 2000);
  }

  function load() {
    storage().get(STORAGE_KEY, (result) => {
      fillForm(normalizeSettings(result && result[STORAGE_KEY]));
    });
  }

  $("save").addEventListener("click", () => {
    storage().set({ [STORAGE_KEY]: readForm() }, () => setStatus("Saved."));
  });

  $("reset").addEventListener("click", () => {
    const defaults = normalizeSettings(DEFAULT_SETTINGS);
    storage().set({ [STORAGE_KEY]: defaults }, () => {
      fillForm(defaults);
      setStatus("Defaults restored.");
    });
  });

  load();
})();
```

- [ ] **Step 3: Run tests**

Run: `npm test`

Expected: PASS.

## Task 7: Listing And Search Page Badges

**Files:**
- Modify: `extension/content.js`

- [ ] **Step 1: Add badge helpers to `extension/content.js` before `loadSettings().then(...)`**

```js
  function renderListingBadges() {
    const cards = Array.from(document.querySelectorAll("a, article, [class*='card'], [class*='lot'], [class*='item']"))
      .filter((node) => !node.closest(`#${ROOT_ID}`) && !node.querySelector(".macbid-tp-badge"))
      .filter((node) => /current bid|high bid|\$[0-9]/i.test(node.textContent || ""));

    for (const card of cards.slice(0, 80)) {
      const snapshot = globalThis.MacbidParser.parseSnapshotFromText(card.innerText || card.textContent || "");
      if (snapshot.currentBid === null) continue;
      const tax = selectTaxRate({
        stateCode: snapshot.stateCode,
        locationName: snapshot.locationName,
        settings
      });
      const result = calculateTotal(snapshot.currentBid, {
        ...settings,
        taxRate: tax.rate,
        assuranceEnabled: settings.assuranceEnabled || snapshot.assuranceFee !== null,
        assuranceFee: snapshot.assuranceFee !== null ? snapshot.assuranceFee : settings.assuranceFee
      });
      const badge = document.createElement("span");
      badge.className = "macbid-tp-badge";
      badge.textContent = `Est. ${formatMoney(result.total)}`;
      card.insertAdjacentElement("afterbegin", badge);
    }
  }
```

- [ ] **Step 2: Call listing badges from `update()`**

Modify the start of `update()`:

```js
  function update() {
    renderListingBadges();
    const root = getOrCreateRoot();
```

- [ ] **Step 3: Run tests**

Run: `npm test`

Expected: PASS.

## Task 8: Manual Verification And README Finish

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add manual verification checklist to README**

Append:

```markdown
### Extension manual verification checklist

- The unpacked extension loads without manifest errors.
- An item page shows an estimated total panel.
- The total matches: `(bid + bid * 0.15 + 3 + assurance) * (1 + taxRate)`.
- Updating the budget field updates the max safe bid.
- Changing extension options updates the item page after refresh or storage change.
- Editing the current bid text in DevTools updates the panel within about 150ms.
- Listing/search pages show compact `Est. $...` badges when bid text is visible.
```

- [ ] **Step 2: Run full tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 3: Load unpacked extension**

Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and choose:

```text
E:\WebDevStuff\claude\macbid-calc\extension
```

Expected: Chrome accepts the manifest and shows "MAC.BID True Price".

- [ ] **Step 4: Verify live update behavior**

On a MAC.BID item page, use DevTools to edit the visible current bid text from `$50.00` to `$60.00`.

Expected: the injected total changes without refreshing the page.

## Self-Review

- Spec coverage: item-page panel is covered by Task 5, live updates by Task 5, options by Task 6, listing badges by Task 7, tax selection by Task 3, parsing by Task 4, fee math by Task 2, README/manual verification by Task 8.
- Placeholder scan: no `TBD`, `TODO`, or unspecified "add tests" steps remain.
- Type consistency: shared globals are `MacbidFees`, `MacbidTaxes`, and `MacbidParser`; storage key is consistently `macbidTruePriceSettings`; settings fields match across modules.
