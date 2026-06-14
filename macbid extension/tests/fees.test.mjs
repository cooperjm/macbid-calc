import assert from 'node:assert/strict';
import test from 'node:test';

import '../shared/fees.js';

const fees = globalThis.MacbidFees;

const settings = {
  premiumRate: 0.15,
  lotFee: 3,
  assuranceEnabled: true,
  assuranceFee: 7,
  taxRate: 0.06,
};

test('calculateTotal includes premium, lot fee, assurance, tax, and overhead', () => {
  const result = fees.calculateTotal(100, settings);

  assert.equal(result.taxRate, 0.06);
  assert.deepEqual(result, {
    bid: 100,
    premium: 15,
    lotFee: 3,
    assurance: 7,
    subtotal: 125,
    taxRate: 0.06,
    taxAmount: 7.5,
    total: 132.5,
    overhead: 32.5,
  });
});

test('maxBidFromBudget reverses the total calculation', () => {
  assert.equal(Number(fees.maxBidFromBudget(132.5, settings).toFixed(2)), 100);
});

test('maxBidFromBudget does not exceed tight budgets after rounded fee calculations', () => {
  const bidFor1072 = fees.maxBidFromBudget(10.72, settings);
  const totalFor1072 = fees.calculateTotal(bidFor1072, settings).total;

  assert.equal(bidFor1072, 0.09);
  assert.ok(totalFor1072 <= 10.72, `${totalFor1072} exceeds budget 10.72`);

  const bidFor1073 = fees.maxBidFromBudget(10.73, settings);
  const totalFor1073 = fees.calculateTotal(bidFor1073, settings).total;

  assert.equal(bidFor1073, 0.1);
  assert.ok(totalFor1073 <= 10.73, `${totalFor1073} exceeds budget 10.73`);
});

test('maxBidFromBudget never returns a bid with a total over budget from 0 to 200', () => {
  const propertySettings = {
    premiumRate: 0.15,
    lotFee: 0,
    assuranceEnabled: false,
    assuranceFee: 7,
    taxRate: 0.06,
  };

  for (let cents = 0; cents <= 20000; cents += 1) {
    const budget = cents / 100;
    const bid = fees.maxBidFromBudget(budget, propertySettings);
    const total = fees.calculateTotal(bid, propertySettings).total;

    assert.ok(total <= budget, `bid ${bid} totals ${total} for budget ${budget}`);
  }
});

test('normalizeSettings falls back for bad values and parses string inputs', () => {
  const normalized = fees.normalizeSettings({
    premiumRate: 'bad',
    lotFee: -3,
    assuranceFee: '7',
    customTaxRate: '6.5',
  });

  assert.equal(normalized.premiumRate, fees.DEFAULT_SETTINGS.premiumRate);
  assert.equal(normalized.lotFee, fees.DEFAULT_SETTINGS.lotFee);
  assert.equal(normalized.assuranceFee, 7);
  assert.equal(normalized.customTaxRate, 0.065);
});

test('normalizeSettings treats blank and null numeric inputs as invalid fallbacks', () => {
  assert.equal(fees.normalizeSettings({ lotFee: '' }).lotFee, fees.DEFAULT_SETTINGS.lotFee);
  assert.equal(fees.normalizeSettings({ lotFee: '   ' }).lotFee, fees.DEFAULT_SETTINGS.lotFee);
  assert.equal(fees.normalizeSettings({ lotFee: null }).lotFee, fees.DEFAULT_SETTINGS.lotFee);
  assert.equal(fees.normalizeSettings({ customTaxRate: '' }).customTaxRate, fees.DEFAULT_SETTINGS.customTaxRate);
  assert.equal(fees.normalizeSettings({ customTaxRate: '   ' }).customTaxRate, fees.DEFAULT_SETTINGS.customTaxRate);
  assert.equal(fees.normalizeSettings({ customTaxRate: null }).customTaxRate, fees.DEFAULT_SETTINGS.customTaxRate);
});

test('normalizeSettings preserves explicit zero numeric inputs', () => {
  assert.equal(fees.normalizeSettings({ lotFee: 0 }).lotFee, 0);
  assert.equal(fees.normalizeSettings({ lotFee: '0' }).lotFee, 0);
  assert.equal(fees.normalizeSettings({ customTaxRate: 0 }).customTaxRate, 0);
  assert.equal(fees.normalizeSettings({ customTaxRate: '0' }).customTaxRate, 0);
});

test('normalizeSettings stores the optional RGB glow setting', () => {
  assert.equal(fees.DEFAULT_SETTINGS.rgbGlowEnabled, false);
  assert.equal(fees.normalizeSettings({ rgbGlowEnabled: true }).rgbGlowEnabled, true);
  assert.equal(fees.normalizeSettings({ rgbGlowEnabled: false }).rgbGlowEnabled, false);
});

test('isBudgetOnlySettingsChange detects storage changes limited to budget', () => {
  const before = fees.normalizeSettings({
    premiumRate: 0.15,
    lotFee: 3,
    assuranceEnabled: false,
    assuranceFee: 7,
    customTaxEnabled: false,
    customTaxRate: null,
    budget: '3',
    rgbGlowEnabled: false,
  });

  assert.equal(
    fees.isBudgetOnlySettingsChange(before, { ...before, budget: '30' }),
    true,
  );
  assert.equal(
    fees.isBudgetOnlySettingsChange(before, { ...before, budget: '30', rgbGlowEnabled: true }),
    false,
  );
  assert.equal(
    fees.isBudgetOnlySettingsChange(before, { ...before }),
    false,
  );
});
