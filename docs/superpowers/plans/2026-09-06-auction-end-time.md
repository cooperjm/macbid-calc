# Auction End Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the absolute auction end date and time, in the warehouse's timezone, as a header line above `ESTIMATED TOTAL` in the injected panel.

**Architecture:** Timezone resolution joins the existing warehouse table in `shared/taxes.js` (warehouse first, single-zone state second, `null` otherwise). Formatting lives in a new `shared/endtime.js` so it is unit-testable in Node. `content.js` caches the computed end instant to keep the panel signature stable.

**Tech Stack:** Plain browser JS (UMD-style shared modules), `Intl.DateTimeFormat`, Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-06-auction-end-time-design.md`

---

## File Structure

- Modify `extension/shared/taxes.js`: add `timeZone` to warehouse entries, add `STATE_TIME_ZONES`, extract `findWarehouseEntry`, add and export `selectTimeZone`.
- Create `extension/shared/endtime.js`: `formatAuctionEnd(endsAt, timeZone, now)`.
- Create `extension/tests/endtime.test.mjs`: formatting tests.
- Modify `extension/tests/taxes.test.mjs`: `selectTimeZone` tests.
- Modify `extension/manifest.json`: register `shared/endtime.js`.
- Modify `extension/content.js`: cached end instant, signature entry, header line.
- Modify `extension/tests/content.test.mjs`: caching and reset assertions.
- Modify `extension/content.css`: `.macbid-tp-ends` rule plus dark-mode variant.
- Modify `extension/tests/css.test.mjs`: assert the rule exists in both modes.

`scripts/package.mjs` walks `extension/` and needs no change.

---

## Task 1: Timezone resolution

**Files:**
- Modify: `extension/shared/taxes.js`
- Test: `extension/tests/taxes.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `extension/tests/taxes.test.mjs`:

```js
test('selectTimeZone uses the warehouse table first', () => {
  assert.equal(taxes.selectTimeZone({ locationName: 'Gastonia', stateCode: 'NC' }), 'America/New_York');
});

test('selectTimeZone puts El Paso on Mountain time, not Central', () => {
  assert.equal(taxes.selectTimeZone({ locationName: 'El Paso', stateCode: 'TX' }), 'America/Denver');
});

test('selectTimeZone falls back to the state for an unknown warehouse in a single-zone state', () => {
  assert.equal(taxes.selectTimeZone({ locationName: 'Charlotte Depot', stateCode: 'NC' }), 'America/New_York');
});

test('selectTimeZone refuses to guess in a multi-zone state', () => {
  assert.equal(taxes.selectTimeZone({ locationName: 'Dallas Depot', stateCode: 'TX' }), null);
  assert.equal(taxes.selectTimeZone({ locationName: 'Miami Depot', stateCode: 'FL' }), null);
});

test('selectTimeZone returns null without a usable location', () => {
  assert.equal(taxes.selectTimeZone({}), null);
  assert.equal(taxes.selectTimeZone({ locationName: '', stateCode: 'ZZ' }), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test "extension/tests/taxes.test.mjs"`
Expected: FAIL — `taxes.selectTimeZone is not a function`

- [ ] **Step 3: Add the timezone data**

In `extension/shared/taxes.js`, give every `WAREHOUSE_RATES` entry a `timeZone`:

```js
  const WAREHOUSE_RATES = Object.freeze([
    { name: 'Pittsburgh Mills', stateCode: 'PA', rate: 0.07, timeZone: 'America/New_York' },
    { name: 'Monroeville', stateCode: 'PA', rate: 0.07, timeZone: 'America/New_York' },
    { name: 'Robinson', stateCode: 'PA', rate: 0.07, timeZone: 'America/New_York' },
    { name: 'Beaver Falls', stateCode: 'PA', rate: 0.06, timeZone: 'America/New_York' },
    { name: 'Akron', stateCode: 'OH', rate: 0.0675, timeZone: 'America/New_York' },
    { name: 'Canton', stateCode: 'OH', rate: 0.065, timeZone: 'America/New_York' },
    { name: 'Rock Hill', stateCode: 'SC', rate: 0.07, timeZone: 'America/New_York' },
    { name: 'Spartanburg', stateCode: 'SC', rate: 0.07, timeZone: 'America/New_York' },
    { name: 'Gastonia', stateCode: 'NC', rate: 0.07, timeZone: 'America/New_York' },
    // El Paso is the one warehouse not on its state's dominant clock.
    { name: 'El Paso', stateCode: 'TX', rate: 0.0825, timeZone: 'America/Denver' },
  ]);
```

Add below it. States spanning two zones are deliberately absent, so an unrecognised warehouse there yields `null` rather than a confidently wrong time:

```js
  // Single-zone states only. AK, FL, ID, IN, KS, KY, MI, NE, NV, ND, OR, SD, TN
  // and TX span two zones and are omitted on purpose.
  const STATE_TIME_ZONES = Object.freeze({
    AL: 'America/Chicago', AR: 'America/Chicago', AZ: 'America/Phoenix',
    CA: 'America/Los_Angeles', CO: 'America/Denver', CT: 'America/New_York',
    DC: 'America/New_York', DE: 'America/New_York', GA: 'America/New_York',
    HI: 'Pacific/Honolulu', IA: 'America/Chicago', IL: 'America/Chicago',
    LA: 'America/Chicago', MA: 'America/New_York', MD: 'America/New_York',
    ME: 'America/New_York', MN: 'America/Chicago', MO: 'America/Chicago',
    MS: 'America/Chicago', MT: 'America/Denver', NC: 'America/New_York',
    NH: 'America/New_York', NJ: 'America/New_York', NM: 'America/Denver',
    NY: 'America/New_York', OH: 'America/New_York', OK: 'America/Chicago',
    PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York',
    UT: 'America/Denver', VA: 'America/New_York', VT: 'America/New_York',
    WA: 'America/Los_Angeles', WI: 'America/Chicago', WV: 'America/New_York',
    WY: 'America/Denver',
  });
```

- [ ] **Step 4: Extract the warehouse lookup and add `selectTimeZone`**

Replace the body of `findWarehouseRate` so both callers share one matcher. Add above it:

```js
  function findWarehouseEntry(locationName, stateCode) {
    const locationTokens = tokenizeLocation(locationName);

    if (locationTokens.length === 0) {
      return null;
    }

    const normalizedState = normalizeStateCode(stateCode);

    return WAREHOUSE_RATES.find((warehouse) => {
      const stateMatches = !normalizedState || warehouse.stateCode === normalizedState;
      return stateMatches && hasWarehouseTokenMatch(locationTokens, tokenizeLocation(warehouse.name), warehouse.stateCode);
    }) || null;
  }
```

Then `findWarehouseRate` becomes:

```js
  function findWarehouseRate(locationName, stateCode) {
    const match = findWarehouseEntry(locationName, stateCode);

    if (!match) {
      return null;
    }

    return {
      rate: match.rate,
      source: match.name,
      label: `${match.name} tax`,
      kind: 'warehouse',
      stateCode: match.stateCode,
    };
  }
```

Add `selectTimeZone` next to `selectTaxRate`:

```js
  function selectTimeZone({ locationName, stateCode } = {}) {
    const warehouse = findWarehouseEntry(locationName, stateCode);

    if (warehouse && warehouse.timeZone) {
      return warehouse.timeZone;
    }

    const normalizedState = normalizeStateCode(stateCode);

    if (normalizedState && Object.prototype.hasOwnProperty.call(STATE_TIME_ZONES, normalizedState)) {
      return STATE_TIME_ZONES[normalizedState];
    }

    return null;
  }
```

Add both to the exported `api` object:

```js
    STATE_TIME_ZONES,
    selectTimeZone,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test "extension/tests/taxes.test.mjs"`
Expected: PASS, including the pre-existing `selectTaxRate` tests — the `findWarehouseEntry` extraction must not change tax behaviour.

- [ ] **Step 6: Commit**

```bash
git add "extension/shared/taxes.js" "extension/tests/taxes.test.mjs"
git commit -m "feat: resolve a warehouse timezone from the location"
```

---

## Task 2: End-time formatting

**Files:**
- Create: `extension/shared/endtime.js`
- Create: `extension/tests/endtime.test.mjs`
- Modify: `extension/manifest.json`

- [ ] **Step 1: Write the failing tests**

Create `extension/tests/endtime.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import endtime from '../shared/endtime.js';

const ZONE = 'America/New_York';
// 2026-08-31T01:15Z is Sunday 30 August, 9:15 PM in New York.
const SUNDAY_EVENING = Date.UTC(2026, 7, 31, 1, 15);
const HOUR = 3600000;
const DAY = 24 * HOUR;

test('formatAuctionEnd says today when the auction ends on the current day there', () => {
  const label = endtime.formatAuctionEnd(SUNDAY_EVENING, ZONE, SUNDAY_EVENING - HOUR);

  assert.match(label, /^Ends today, /);
  // Asserted in pieces: the space before PM is a narrow no-break space in some
  // ICU builds, so an exact "9:15 PM" literal is not portable across Node versions.
  assert.match(label, /9:15/);
  assert.match(label, /PM/);
  assert.match(label, /EDT$/);
});

test('formatAuctionEnd says tomorrow for the next calendar day there', () => {
  const label = endtime.formatAuctionEnd(SUNDAY_EVENING, ZONE, SUNDAY_EVENING - DAY);

  assert.match(label, /^Ends tomorrow, /);
});

test('formatAuctionEnd falls back to weekday and date further out', () => {
  const label = endtime.formatAuctionEnd(SUNDAY_EVENING, ZONE, SUNDAY_EVENING - 5 * DAY);

  assert.match(label, /^Ends Sun, Aug 30, /);
});

test('formatAuctionEnd decides the day word in the target zone, not the host zone', () => {
  // The same instant is 30 August in New York but 31 August in London, so a
  // London reference an hour earlier is still the same calendar day there.
  // Asserted on the time, not the zone name: en-US renders Europe/London as
  // "GMT+1", not "BST".
  const label = endtime.formatAuctionEnd(SUNDAY_EVENING, 'Europe/London', SUNDAY_EVENING - HOUR);

  assert.match(label, /^Ends today, /);
  assert.match(label, /2:15/);
});

test('formatAuctionEnd returns null for unusable input', () => {
  assert.equal(endtime.formatAuctionEnd(null, ZONE, Date.now()), null);
  assert.equal(endtime.formatAuctionEnd(SUNDAY_EVENING, null, Date.now()), null);
  assert.equal(endtime.formatAuctionEnd(Number.NaN, ZONE, Date.now()), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test "extension/tests/endtime.test.mjs"`
Expected: FAIL — cannot find module `../shared/endtime.js`

- [ ] **Step 3: Write the implementation**

Create `extension/shared/endtime.js`, following the UMD pattern used by the other shared modules:

```js
(function initMacbidEndTime(root) {
  'use strict';

  function zonedDateKey(instant, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(instant));

    const read = (type) => {
      const part = parts.find((candidate) => candidate.type === type);
      return part ? Number(part.value) : Number.NaN;
    };

    return { year: read('year'), month: read('month'), day: read('day') };
  }

  // Compare calendar dates rather than adding 24h, so a DST transition (a 23 or
  // 25 hour day) cannot shift the answer.
  function dayOffset(target, reference) {
    return Math.round(
      (Date.UTC(target.year, target.month - 1, target.day)
        - Date.UTC(reference.year, reference.month - 1, reference.day)) / 86400000,
    );
  }

  function formatAuctionEnd(endsAt, timeZone, now) {
    if (!Number.isFinite(endsAt) || typeof timeZone !== 'string' || timeZone === '') {
      return null;
    }

    const reference = Number.isFinite(now) ? now : Date.now();
    let time;
    let offset;
    let endDate;

    try {
      endDate = new Date(endsAt);
      time = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(endDate);
      offset = dayOffset(zonedDateKey(endsAt, timeZone), zonedDateKey(reference, timeZone));
    } catch (error) {
      return null; // unknown time zone identifier
    }

    if (offset === 0) {
      return `Ends today, ${time}`;
    }

    if (offset === 1) {
      return `Ends tomorrow, ${time}`;
    }

    const date = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(endDate);

    return `Ends ${date}, ${time}`;
  }

  const api = { formatAuctionEnd };

  root.MacbidEndTime = Object.assign(root.MacbidEndTime || {}, api);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.MacbidEndTime;
  }
})(globalThis);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test "extension/tests/endtime.test.mjs"`
Expected: PASS (5 tests)

- [ ] **Step 5: Register the module**

In `extension/manifest.json`, add `shared/endtime.js` to the content script list, before `content.js`:

```json
      "js": [
        "shared/fees.js",
        "shared/taxes.js",
        "shared/parser.js",
        "shared/endtime.js",
        "content.js"
      ],
```

- [ ] **Step 6: Commit**

```bash
git add "extension/shared/endtime.js" "extension/tests/endtime.test.mjs" "extension/manifest.json"
git commit -m "feat: format an auction end time in a given zone"
```

---

## Task 3: Panel styling

**Files:**
- Modify: `extension/content.css`
- Test: `extension/tests/css.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `extension/tests/css.test.mjs`:

```js
test('the end-time header is separated from the total and themed for dark mode', () => {
  const rule = contentCss.match(/\.macbid-tp-ends\s*\{([^}]*)\}/);

  assert.ok(rule, '.macbid-tp-ends rule should exist');
  assert.match(rule[1], /border-bottom:/, 'a divider separates it from the total');
  assert.match(rule[1], /margin:/, 'it carries its own bottom spacing');

  const dark = contentCss.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(dark, 'a dark-mode block should exist');
  assert.match(dark[1], /\.macbid-tp-ends\b/, 'the header should be themed for dark mode');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test "extension/tests/css.test.mjs"`
Expected: FAIL — `.macbid-tp-ends rule should exist`

- [ ] **Step 3: Add the rules**

In `extension/content.css`, immediately before the `.macbid-tp-kicker` rule:

```css
.macbid-tp-ends {
  align-items: center;
  border-bottom: 1px solid rgba(124, 176, 45, 0.22);
  color: #24122f;
  display: flex;
  font-size: 15px;
  font-weight: 800;
  gap: 7px;
  margin: 0 0 10px;
  padding: 0 0 10px;
}

.macbid-tp-ends svg {
  color: #6f8f21;
  flex: none;
}
```

Inside the existing `@media (prefers-color-scheme: dark)` block, next to the `.macbid-tp-kicker` override:

```css
  .macbid-tp-ends {
    border-bottom-color: rgba(124, 176, 45, 0.3);
    color: #f3f4f6;
  }

  .macbid-tp-ends svg { color: #a3c74f; }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test "extension/tests/css.test.mjs"`
Expected: PASS (4 tests — the three existing RGB glow tests plus this one)

- [ ] **Step 5: Commit**

```bash
git add "extension/content.css" "extension/tests/css.test.mjs"
git commit -m "feat: style the auction end time header"
```

---

## Task 4: Wire it into the panel

**Files:**
- Modify: `extension/content.js`
- Test: `extension/tests/content.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to `extension/tests/content.test.mjs`:

```js
test('the end instant is cached so the panel signature cannot oscillate', () => {
  assert.match(contentJs, /function getAuctionEndsAt/);
  assert.match(contentJs, /END_TIME_DRIFT_MS/);

  const block = contentJs.match(/function getAuctionEndsAt\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(block, 'getAuctionEndsAt should be present');
  assert.match(block[1], /cachedEndsAt/, 'it should read and write a cached value');
  assert.match(block[1], /END_TIME_DRIFT_MS/, 'it should only refresh past the drift threshold');
});

test('the cached end instant is cleared when the lot changes', () => {
  const block = contentJs.match(/const currentKey = getProductKey\(\);([\s\S]*?)\n    \}/);

  assert.ok(block, 'the SPA navigation branch should be present');
  assert.match(block[1], /cachedEndsAt = null/);
});

test('the panel signature tracks the rendered end-time label', () => {
  const block = contentJs.match(/const signature = JSON\.stringify\(\{([\s\S]*?)\n    \}\);/);

  assert.ok(block, 'the signature block should be present');
  assert.match(block[1], /ends:/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test "extension/tests/content.test.mjs"`
Expected: FAIL — `getAuctionEndsAt` not found

- [ ] **Step 3: Add the cache**

In `extension/content.js`, next to the other module constants (near `DEBOUNCE_MS`):

```js
  const END_TIME_DRIFT_MS = 5000;
```

Next to the other module state (near `let productBudget = '';`):

```js
  let cachedEndsAt = null;
```

Add after `parseAuctionEndTime`:

```js
  // parseAuctionEndTime() recomputes Date.now() + remaining, and the countdown
  // only ticks in whole seconds, so the raw value drifts about a second between
  // renders. Feeding that into the panel signature would rebuild the panel
  // several times a second. Hold the first value and only accept a new one once
  // it moves further than the drift band - far enough to catch a soft-close
  // extension, close enough to ignore the jitter.
  function getAuctionEndsAt() {
    const computed = parseAuctionEndTime();

    if (computed === null) {
      cachedEndsAt = null;
      return null;
    }

    if (cachedEndsAt === null || Math.abs(computed - cachedEndsAt) > END_TIME_DRIFT_MS) {
      cachedEndsAt = computed;
    }

    return cachedEndsAt;
  }
```

In `render()`, inside the `currentKey !== productKey` branch, alongside `productBudget = '';`:

```js
      cachedEndsAt = null;
```

- [ ] **Step 4: Build the header line**

Add near `createRow`:

```js
  function createEndsLine(text) {
    const line = createElement('p', 'macbid-tp-ends');
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    const face = document.createElementNS(namespace, 'circle');
    const hands = document.createElementNS(namespace, 'path');

    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '15');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('aria-hidden', 'true');

    face.setAttribute('cx', '12');
    face.setAttribute('cy', '12');
    face.setAttribute('r', '9');

    hands.setAttribute('d', 'M12 7v5l3 2');
    hands.setAttribute('stroke-linecap', 'round');
    hands.setAttribute('stroke-linejoin', 'round');

    svg.append(face, hands);
    line.append(svg, document.createTextNode(text));

    return line;
  }
```

- [ ] **Step 5: Render it**

In `renderPanel`, after `const quality = ...` and before the signature:

```js
    const endsAt = getAuctionEndsAt();
    const timeZone = taxes.selectTimeZone({
      locationName: snapshot.locationName,
      stateCode: snapshot.stateCode,
    });
    const endsLabel = endsAt !== null && timeZone
      ? endtime.formatAuctionEnd(endsAt, timeZone, Date.now())
      : null;
```

Add to the signature object, after `quality`:

```js
      ends: endsLabel,
```

Prepend the line to the panel. Replace the existing `panel.append(...)` call with:

```js
    if (endsLabel) {
      panel.append(createEndsLine(endsLabel));
    }

    panel.append(
      createElement('p', 'macbid-tp-kicker', 'Estimated total'),
      totalEl,
      createElement('p', 'macbid-tp-note', taxNote),
    );
```

Bind the new module alongside the existing `fees`, `taxes` and `parser` bindings at the top of the IIFE:

```js
  const endtime = root.MacbidEndTime;
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — 47 existing plus the new tests, 0 failing.

- [ ] **Step 7: Commit**

```bash
git add "extension/content.js" "extension/tests/content.test.mjs"
git commit -m "feat: show the auction end time above the estimated total"
```

---

## Task 5: Verify and document

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rebuild the package and confirm the new module ships**

Run: `npm run package`
Expected: the file list includes `shared/endtime.js`.

- [ ] **Step 2: Load and check in Chrome**

Reload the extension at `chrome://extensions`, then open a live lot page and confirm:

- The header line appears above `ESTIMATED TOTAL`, with a divider beneath it.
- The time matches the countdown — add the countdown to the current time and compare.
- The label reads `Ends today, ...` for a lot closing today.
- The line does not flicker. With `localStorage.setItem('macbidDebug', '1')` set, no `rebuild:` lines appear while the page sits idle.
- On a closed lot with no countdown, the panel starts at `ESTIMATED TOTAL` with no gap.

- [ ] **Step 3: Document the feature**

In `README.md`, in the "What it does" paragraph, after the first sentence:

```markdown
The panel header shows the exact date and time the lot closes, in the pickup warehouse's timezone, so you do not have to add the countdown to the current time.
```

Add to the manual verification checklist:

```markdown
- The panel header shows the lot's end time, and it matches the countdown.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: note the auction end time header"
```

---

## Self-Review

- **Spec coverage:** warehouse-first resolution (Task 1), El Paso on Mountain (Task 1), single-zone fallback and multi-zone `null` (Task 1), today/tomorrow in the target zone (Task 2), zone abbreviation always shown (Task 2), hidden when unknown or expired (Task 4), cached instant with drift threshold (Task 4), cache cleared on lot change (Task 4), header above the kicker with a divider (Tasks 3 and 4), inline SVG clock with no network request (Task 4).
- **Deviation from the spec:** the signature carries the formatted label rather than a minute-rounded instant. The label is exactly what is rendered, so it is strictly tighter than rounding — it changes only when the visible text changes, which is the property the spec was reaching for.
- **Placeholders:** none.
- **Naming:** `findWarehouseEntry`, `selectTimeZone`, `formatAuctionEnd`, `getAuctionEndsAt`, `createEndsLine`, `cachedEndsAt`, `END_TIME_DRIFT_MS` are used consistently across tasks.
