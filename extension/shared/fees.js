(function attachMacbidFees(root) {
  'use strict';

  const DEFAULT_SETTINGS = Object.freeze({
    premiumRate: 0.15,
    lotFee: 3,
    assuranceEnabled: false,
    assuranceFee: 7,
    customTaxEnabled: false,
    customTaxRate: null,
    budget: '',
    rgbGlowEnabled: false,
  });

  function roundCurrency(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
      return 0;
    }

    const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  function floorCurrency(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
      return 0;
    }

    const floored = Math.floor((amount + Number.EPSILON) * 100) / 100;
    return Object.is(floored, -0) ? 0 : floored;
  }

  function isBlankNumeric(value) {
    return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
  }

  function normalizeRate(value, fallback) {
    if (isBlankNumeric(value)) {
      return fallback;
    }

    const rate = Number(value);

    if (!Number.isFinite(rate) || rate < 0) {
      return fallback;
    }

    return rate > 1 ? rate / 100 : rate;
  }

  function normalizeMoney(value, fallback) {
    if (isBlankNumeric(value)) {
      return fallback;
    }

    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
      return fallback;
    }

    return roundCurrency(amount);
  }

  function normalizeSettings(settings) {
    const input = settings && typeof settings === 'object' ? settings : {};
    const normalized = {
      premiumRate: normalizeRate(input.premiumRate, DEFAULT_SETTINGS.premiumRate),
      lotFee: normalizeMoney(input.lotFee, DEFAULT_SETTINGS.lotFee),
      assuranceEnabled: Boolean(input.assuranceEnabled ?? DEFAULT_SETTINGS.assuranceEnabled),
      assuranceFee: normalizeMoney(input.assuranceFee, DEFAULT_SETTINGS.assuranceFee),
      customTaxEnabled: Boolean(input.customTaxEnabled ?? DEFAULT_SETTINGS.customTaxEnabled),
      customTaxRate: normalizeRate(input.customTaxRate, DEFAULT_SETTINGS.customTaxRate),
      budget: input.budget ?? DEFAULT_SETTINGS.budget,
      rgbGlowEnabled: Boolean(input.rgbGlowEnabled ?? DEFAULT_SETTINGS.rgbGlowEnabled),
    };

    if ('taxRate' in input) {
      normalized.taxRate = normalizeRate(input.taxRate, 0);
    }

    return normalized;
  }

  function isBudgetOnlySettingsChange(oldSettings, newSettings) {
    const before = normalizeSettings(oldSettings);
    const after = normalizeSettings(newSettings);
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

    if (Object.is(before.budget, after.budget)) {
      return false;
    }

    keys.delete('budget');

    for (const key of keys) {
      if (!Object.is(before[key], after[key])) {
        return false;
      }
    }

    return true;
  }

  function getTaxRate(settings, normalized) {
    if (Object.prototype.hasOwnProperty.call(settings, 'taxRate')) {
      return normalized.taxRate;
    }

    if (normalized.customTaxEnabled && normalized.customTaxRate !== null) {
      return normalized.customTaxRate;
    }

    return 0;
  }

  function calculateTotal(bid, settings) {
    const normalized = normalizeSettings(settings);
    const bidAmount = normalizeMoney(bid, 0);
    const premium = roundCurrency(bidAmount * normalized.premiumRate);
    const lotFee = normalized.lotFee;
    const assurance = normalized.assuranceEnabled ? normalized.assuranceFee : 0;
    const subtotal = roundCurrency(bidAmount + premium + lotFee + assurance);
    const taxRate = getTaxRate(settings || {}, normalized);
    const taxAmount = roundCurrency(subtotal * taxRate);
    const total = roundCurrency(subtotal + taxAmount);

    return {
      bid: bidAmount,
      premium,
      lotFee,
      assurance,
      subtotal,
      taxRate,
      taxAmount,
      total,
      overhead: roundCurrency(total - bidAmount),
    };
  }

  function maxBidFromBudget(budget, settings) {
    const normalized = normalizeSettings(settings);
    const budgetAmount = normalizeMoney(budget, 0);
    const taxRate = getTaxRate(settings || {}, normalized);
    const fixedFees = normalized.lotFee + (normalized.assuranceEnabled ? normalized.assuranceFee : 0);
    const untaxedBudget = taxRate > 0 ? budgetAmount / (1 + taxRate) : budgetAmount;
    const maxBid = (untaxedBudget - fixedFees) / (1 + normalized.premiumRate);
    const effectiveSettings = {
      premiumRate: normalized.premiumRate,
      lotFee: normalized.lotFee,
      assuranceEnabled: normalized.assuranceEnabled,
      assuranceFee: normalized.assuranceFee,
      taxRate,
    };
    let candidate = floorCurrency(Math.max(0, maxBid));

    while (candidate > 0 && calculateTotal(candidate, effectiveSettings).total > budgetAmount) {
      candidate = roundCurrency(candidate - 0.01);
    }

    return candidate;
  }

  const api = {
    DEFAULT_SETTINGS,
    calculateTotal,
    isBudgetOnlySettingsChange,
    maxBidFromBudget,
    normalizeSettings,
    roundCurrency,
  };

  root.MacbidFees = Object.assign(root.MacbidFees || {}, api);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.MacbidFees;
  }
})(globalThis);
