import assert from 'node:assert/strict';
import test from 'node:test';

import '../shared/taxes.js';

const taxes = globalThis.MacbidTaxes;

test('selectTaxRate prefers custom tax when enabled', () => {
  const result = taxes.selectTaxRate({
    settings: {
      customTaxEnabled: true,
      customTaxRate: 0.0725,
    },
    locationName: 'Pittsburgh Mills',
    stateCode: 'PA',
  });

  assert.equal(result.rate, 0.0725);
  assert.equal(result.source, 'Custom tax');
  assert.equal(result.kind, 'custom');
});

test('selectTaxRate ignores negative custom tax and falls through', () => {
  const result = taxes.selectTaxRate({
    settings: {
      customTaxEnabled: true,
      customTaxRate: -0.01,
    },
    locationName: 'Pittsburgh Mills',
    stateCode: 'PA',
  });

  assert.equal(result.kind, 'warehouse');
  assert.match(result.label, /Pittsburgh Mills/);
});

test('selectTaxRate ignores blank custom tax and falls through', () => {
  const result = taxes.selectTaxRate({
    settings: {
      customTaxEnabled: true,
      customTaxRate: '   ',
    },
    locationName: 'Unknown Warehouse',
    stateCode: 'SC',
  });

  assert.equal(result.rate, 0.06);
  assert.equal(result.kind, 'state');
});

test('selectTaxRate ignores oversized custom tax and falls through', () => {
  const result = taxes.selectTaxRate({
    settings: {
      customTaxEnabled: true,
      customTaxRate: 150,
    },
    locationName: '',
    stateCode: 'not real',
  });

  assert.equal(result.rate, 0);
  assert.equal(result.kind, 'unknown');
});

test('selectTaxRate uses known warehouse before state base tax', () => {
  const result = taxes.selectTaxRate({
    settings: {},
    locationName: 'Pittsburgh Mills',
    stateCode: 'PA',
  });

  assert.equal(result.kind, 'warehouse');
  assert.match(result.label, /Pittsburgh Mills/);
});

test('selectTaxRate matches warehouse labels followed by comma state code', () => {
  const result = taxes.selectTaxRate({
    settings: {},
    locationName: 'Pittsburgh Mills, PA',
    stateCode: 'PA',
  });

  assert.equal(result.kind, 'warehouse');
  assert.match(result.label, /Pittsburgh Mills/);
});

test('selectTaxRate matches warehouse labels followed by space state code', () => {
  const result = taxes.selectTaxRate({
    settings: {},
    locationName: 'Pittsburgh Mills PA',
    stateCode: 'PA',
  });

  assert.equal(result.kind, 'warehouse');
  assert.match(result.label, /Pittsburgh Mills/);
});

test('selectTaxRate matches warehouse labels followed by hyphen state code', () => {
  const result = taxes.selectTaxRate({
    settings: {},
    locationName: 'Pittsburgh Mills - PA',
    stateCode: 'PA',
  });

  assert.equal(result.kind, 'warehouse');
  assert.match(result.label, /Pittsburgh Mills/);
});

test('selectTaxRate does not match warehouse names embedded in arbitrary words', () => {
  const result = taxes.selectTaxRate({
    settings: {},
    locationName: 'North Canton',
    stateCode: 'OH',
  });

  assert.equal(result.rate, 0.0575);
  assert.equal(result.kind, 'state');
  assert.equal(result.label, 'OH base tax');
});

test('selectTaxRate falls back to state base tax for unknown warehouse', () => {
  const result = taxes.selectTaxRate({
    settings: {},
    locationName: 'Unknown Warehouse',
    stateCode: 'SC',
  });

  assert.equal(result.rate, 0.06);
  assert.equal(result.kind, 'state');
  assert.equal(result.label, 'SC base tax');
});

test('normalizeStateCode handles names, codes, and unknown values', () => {
  assert.equal(taxes.normalizeStateCode('Pennsylvania'), 'PA');
  assert.equal(taxes.normalizeStateCode('pa'), 'PA');
  assert.equal(taxes.normalizeStateCode('not real'), null);
});

test('normalizeStateCode handles punctuation and whitespace', () => {
  assert.equal(taxes.normalizeStateCode('  Pennsylvania,  '), 'PA');
  assert.equal(taxes.normalizeStateCode('  pa.  '), 'PA');
});

test('selectTaxRate returns unknown when state and location are unknown', () => {
  const result = taxes.selectTaxRate({
    settings: {},
    locationName: '',
    stateCode: 'not real',
  });

  assert.equal(result.rate, 0);
  assert.equal(result.source, 'Tax unknown');
  assert.equal(result.kind, 'unknown');
});
