import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const contentCss = readFileSync(new URL('../content.css', import.meta.url), 'utf8');

test('RGB glow uses continuous transform rotation instead of custom property angle animation', () => {
  assert.match(contentCss, /\.macbid-tp-panel-rgb::before/);
  assert.match(contentCss, /transform:\s*rotate\(360deg\)/);
  assert.doesNotMatch(contentCss, /@property\s+--macbid-rgb-angle/);
  assert.doesNotMatch(contentCss, /--macbid-rgb-angle/);
});
