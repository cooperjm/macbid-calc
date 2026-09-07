import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const contentJs = readFileSync(new URL('../content.js', import.meta.url), 'utf8');

test('budget changes update existing controls without forcing panel replacement', () => {
  const renderPanelBlock = contentJs.match(/function renderPanel\(overlayRoot, snapshot\) \{([\s\S]*?)\n  \}/);
  const signatureBlock = renderPanelBlock && renderPanelBlock[1].match(/const signature = JSON\.stringify\(\{([\s\S]*?)\n    \}\);/);

  assert.ok(renderPanelBlock, 'renderPanel should be present');
  assert.ok(signatureBlock, 'renderPanel signature block should be present');
  assert.doesNotMatch(signatureBlock[1], /\bbudget:/);
  assert.match(contentJs, /function syncBudgetControls/);
  assert.match(contentJs, /syncBudgetControls\(existingPanel, effectiveSettings, total\.total\);\s+return;/);
});

test('dollar pattern loses an amount glued to following digits, and separation restores it', () => {
  const literal = contentJs.match(/const DOLLAR_PATTERN = \/(.+)\/([a-z]*);/);
  assert.ok(literal, 'DOLLAR_PATTERN literal should be present');

  const scan = (text) => Array.from(text.matchAll(new RegExp(literal[1], literal[2])))
    .map((match) => Number(match[1].replace(/,/g, '')));

  // Real detail-card text: the retail price runs straight into the countdown.
  assert.deepEqual(scan('$165-93%$2399.000Days21Hours13Mins20Sec'), [165]);
  // Separating text nodes keeps the retail price parseable.
  assert.deepEqual(scan('$165\n-93%\n$2399.00\n0\nDays\n21\nHours'), [165, 2399]);
});

test('detail price text separates text nodes so adjacent numbers do not merge', () => {
  const block = contentJs.match(/function getDetailPriceText\(card\) \{([\s\S]*?)\n  \}/);

  assert.ok(block, 'getDetailPriceText should be present');
  assert.match(block[1], /createTreeWalker/);
  assert.doesNotMatch(block[1], /return getText\(clone\)/);
});

test('the end instant is cached so the panel signature cannot oscillate', () => {
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
  // Scoped to renderPanel: renderListingBadges builds its own signature, and an
  // unscoped match finds that one first.
  const renderPanelBlock = contentJs.match(/function renderPanel\(overlayRoot, snapshot\) \{([\s\S]*?)\n  \}/);
  const signatureBlock = renderPanelBlock
    && renderPanelBlock[1].match(/const signature = JSON\.stringify\(\{([\s\S]*?)\n    \}\);/);

  assert.ok(renderPanelBlock, 'renderPanel should be present');
  assert.ok(signatureBlock, 'the renderPanel signature block should be present');
  assert.match(signatureBlock[1], /ends:/);
  assert.match(renderPanelBlock[1], /createEndsLine\(endsLabel\)/, 'the header line should be rendered');
});
