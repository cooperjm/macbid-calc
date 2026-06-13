import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import '../shared/parser.js';

const parser = globalThis.MacbidParser;

test('parseCurrency parses dollar-like amounts and returns null without one', () => {
  assert.equal(parser.parseCurrency('$1,234.56'), 1234.56);
  assert.equal(parser.parseCurrency('Current Bid $42'), 42);
  assert.equal(parser.parseCurrency('No price'), null);
});

test('parseCurrency rejects malformed partial amounts', () => {
  assert.equal(parser.parseCurrency('$1,23'), null);
  assert.equal(parser.parseCurrency('$12abc'), null);
  assert.equal(parser.parseCurrency('$1,234.56'), 1234.56);
});

test('extractStateCode finds state codes and full state names', () => {
  assert.equal(parser.extractStateCode('Pittsburgh Mills, PA'), 'PA');
  assert.equal(parser.extractStateCode('Pickup in South Carolina'), 'SC');
  assert.equal(parser.extractStateCode('No state here'), null);
});

test('extractStateCode avoids lowercase word false positives', () => {
  assert.equal(parser.extractStateCode('Pickup in 3 days'), null);
  assert.equal(parser.extractStateCode('Pickup, in 3 days'), null);
  assert.equal(parser.extractStateCode('or best offer'), null);
  assert.equal(parser.extractStateCode('Pittsburgh Mills, PA'), 'PA');
  assert.equal(parser.extractStateCode('Pickup in South Carolina'), 'SC');
});

test('parseSnapshotFromText extracts visible auction values', () => {
  const snapshot = parser.parseSnapshotFromText(`
    Current Bid $55.00
    Retail Price $199.99
    Location Pittsburgh Mills, PA
    Buyer's Assurance $7
  `);

  assert.equal(snapshot.currentBid, 55);
  assert.equal(snapshot.retailPrice, 199.99);
  assert.equal(snapshot.assuranceFee, 7);
  assert.equal(snapshot.stateCode, 'PA');
  assert.match(snapshot.locationName, /Pittsburgh Mills/);
});

test('parseSnapshotFromText bounds values between labels on one line', () => {
  const snapshot = parser.parseSnapshotFromText('Retail Price $199 Current Bid $55 Location Pittsburgh Mills, PA');

  assert.equal(snapshot.currentBid, 55);
  assert.equal(snapshot.retailPrice, 199);
  assert.equal(snapshot.stateCode, 'PA');
  assert.equal(snapshot.locationName, 'Pittsburgh Mills, PA');
});

test('parseSnapshotFromText does not use the next label as a missing value', () => {
  const snapshot = parser.parseSnapshotFromText('Current Bid\nRetail Price $199\nLocation Pittsburgh Mills, PA');

  assert.equal(snapshot.currentBid, null);
  assert.equal(snapshot.retailPrice, 199);
  assert.equal(snapshot.stateCode, 'PA');
  assert.equal(snapshot.locationName, 'Pittsburgh Mills, PA');
});

test('parseSnapshotFromText extracts location after separators and stops before labels', () => {
  const colonSnapshot = parser.parseSnapshotFromText('Location: Pittsburgh Mills, PA Retail Price $199 Current Bid $55');
  const dashSnapshot = parser.parseSnapshotFromText('Location - Pittsburgh Mills, PA Current Bid $55 Retail Price $199');

  assert.equal(colonSnapshot.locationName, 'Pittsburgh Mills, PA');
  assert.equal(colonSnapshot.currentBid, 55);
  assert.equal(colonSnapshot.retailPrice, 199);
  assert.equal(dashSnapshot.locationName, 'Pittsburgh Mills, PA');
  assert.equal(dashSnapshot.currentBid, 55);
  assert.equal(dashSnapshot.retailPrice, 199);
});

test('parseSnapshotFromText treats location details headers as empty labels', () => {
  const snapshot = parser.parseSnapshotFromText('Location Details\nPittsburgh Mills, PA');

  assert.match(snapshot.locationName, /Pittsburgh Mills/);
  assert.equal(snapshot.stateCode, 'PA');
});

test('parseSnapshotFromText ignores non-label text containing location', () => {
  const snapshot = parser.parseSnapshotFromText('See pickup location details\nPittsburgh Mills, PA');

  assert.notEqual(snapshot.locationName, 'details');
  assert.match(snapshot.locationName, /Pittsburgh Mills/);
  assert.equal(snapshot.stateCode, 'PA');
});

test('parseSnapshotFromDocument extracts from document body text', () => {
  const snapshot = parser.parseSnapshotFromDocument({
    body: {
      innerText: `
        Current Bid $72.50
        Location Rock Hill, SC
      `,
    },
  });

  assert.equal(snapshot.currentBid, 72.5);
  assert.equal(snapshot.stateCode, 'SC');
  assert.match(snapshot.locationName, /Rock Hill/);

  const fallbackSnapshot = parser.parseSnapshotFromDocument({
    body: {
      textContent: `
        Current Bid $15
        Location Pittsburgh Mills, PA
      `,
    },
  });

  assert.equal(fallbackSnapshot.currentBid, 15);
  assert.equal(fallbackSnapshot.stateCode, 'PA');
  assert.match(fallbackSnapshot.locationName, /Pittsburgh Mills/);
});

test('parser supports CommonJS module exports when available', () => {
  const source = readFileSync(new URL('../shared/parser.js', import.meta.url), 'utf8');
  const sandbox = {
    module: { exports: {} },
  };
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  assert.equal(typeof sandbox.module.exports.parseCurrency, 'function');
  assert.equal(sandbox.module.exports.parseCurrency('$12.34'), 12.34);
});
