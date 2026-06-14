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

test('options header uses the extension PNG icon instead of a dollar sign marker', () => {
  const headerIconCss = optionsHtml.match(/\.header-icon\s*\{([\s\S]*?)\n    \}/);

  assert.ok(headerIconCss, 'header icon CSS block should exist');
  assert.match(optionsHtml, /<img[^>]+class="header-icon"[^>]+src="icon128\.png"[^>]+alt="MAC\.BID True Price"/);
  assert.doesNotMatch(optionsHtml, /src="icon\.svg"/);
  assert.doesNotMatch(optionsHtml, /<div class="header-icon">\$<\/div>/);
  assert.doesNotMatch(headerIconCss[1], /padding:/);
});
