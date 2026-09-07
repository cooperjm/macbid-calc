import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const contentCss = readFileSync(new URL('../content.css', import.meta.url), 'utf8');

const RGB_RULE = /\.macbid-tp-panel-rgb\s*\{([^}]*)\}/;
const RGB_BEFORE_RULE = /\.macbid-tp-panel-rgb::before\s*\{([^}]*)\}/;

test('RGB glow animates the panel and paints a gradient ring behind it', () => {
  const panel = contentCss.match(RGB_RULE);
  const ring = contentCss.match(RGB_BEFORE_RULE);

  assert.ok(panel, '.macbid-tp-panel-rgb rule should exist');
  assert.ok(ring, '.macbid-tp-panel-rgb::before rule should exist');

  assert.match(panel[1], /animation:\s*\S+/, 'the panel itself should animate');
  assert.match(ring[1], /conic-gradient\(/, 'the ring should be a conic gradient');
  assert.match(ring[1], /animation:\s*\S+/, 'the ring should animate');
});

test('every animation the RGB glow references has keyframes defined', () => {
  const names = new Set();

  for (const rule of contentCss.matchAll(/\.macbid-tp-panel-rgb(?:::before)?\s*\{([^}]*)\}/g)) {
    const animation = rule[1].match(/animation:\s*([A-Za-z][\w-]*)/);

    if (animation && animation[1] !== 'none') {
      names.add(animation[1]);
    }
  }

  assert.ok(names.size >= 2, 'the panel and its ring should each drive an animation');

  for (const name of names) {
    // Not \b - a word boundary sits between "rotate" and "-renamed", so \b would
    // match a differently-named keyframes rule that merely starts the same.
    assert.match(
      contentCss,
      new RegExp(`@keyframes\\s+${name}(?![\\w-])`),
      `@keyframes ${name} should be defined`,
    );
  }
});

test('reduced-motion users get the glow without the animation', () => {
  const reduced = contentCss.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/);

  assert.ok(reduced, 'a prefers-reduced-motion block should exist');
  assert.match(reduced[1], /\.macbid-tp-panel-rgb\b/, 'the panel should be covered');
  assert.match(reduced[1], /\.macbid-tp-panel-rgb::before\b/, 'the ring should be covered too');
  assert.match(reduced[1], /animation:\s*none/, 'the animations should be switched off');
});
