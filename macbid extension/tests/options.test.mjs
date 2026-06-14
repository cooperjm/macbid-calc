import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const optionsHtml = readFileSync(new URL('../options.html', import.meta.url), 'utf8');
const optionsJs = readFileSync(new URL('../options.js', import.meta.url), 'utf8');

test('options expose RGB glow but not page-driven assurance controls', () => {
  assert.match(optionsHtml, /id="rgbGlowEnabled"/);
  assert.match(optionsJs, /rgbGlowEnabled/);

  assert.doesNotMatch(optionsHtml, /id="assuranceEnabled"/);
  assert.doesNotMatch(optionsHtml, /id="assuranceFee"/);
  assert.doesNotMatch(optionsJs, /assuranceEnabled/);
  assert.doesNotMatch(optionsJs, /assuranceFee/);
});
