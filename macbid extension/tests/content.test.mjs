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
