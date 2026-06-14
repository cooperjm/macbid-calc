(function initMacbidTruePriceOptions(root) {
  'use strict';

  const STORAGE_KEY = 'macbidTruePriceSettings';
  const fees = root.MacbidFees;

  if (!fees || !root.chrome || !root.chrome.storage || !root.chrome.storage.sync) {
    return;
  }

  function getElement(id) {
    return document.getElementById(id);
  }

  function percentFromRate(rate) {
    return rate === null || rate === undefined ? '' : String(Number(rate) * 100);
  }

  function rateFromPercent(value) {
    if (value === '') {
      return null;
    }

    return Number(value) / 100;
  }

  function fillForm(settings) {
    getElement('premiumRate').value = percentFromRate(settings.premiumRate);
    getElement('lotFee').value = settings.lotFee;
    getElement('rgbGlowEnabled').checked = settings.rgbGlowEnabled;
    getElement('customTaxEnabled').checked = settings.customTaxEnabled;
    getElement('customTaxRate').value = percentFromRate(settings.customTaxRate);
  }

  function readForm() {
    return fees.normalizeSettings({
      premiumRate: rateFromPercent(getElement('premiumRate').value),
      lotFee: getElement('lotFee').value,
      rgbGlowEnabled: getElement('rgbGlowEnabled').checked,
      customTaxEnabled: getElement('customTaxEnabled').checked,
      customTaxRate: rateFromPercent(getElement('customTaxRate').value),
    });
  }

  function setStatus(message) {
    const status = getElement('status');
    status.textContent = message;
    root.setTimeout(() => {
      if (status.textContent === message) {
        status.textContent = '';
      }
    }, 2000);
  }

  function load() {
    root.chrome.storage.sync.get(STORAGE_KEY, (result) => {
      fillForm(fees.normalizeSettings(result && result[STORAGE_KEY]));
    });
  }

  getElement('save').addEventListener('click', () => {
    root.chrome.storage.sync.set({ [STORAGE_KEY]: readForm() }, () => setStatus('Saved.'));
  });

  getElement('reset').addEventListener('click', () => {
    const defaults = fees.normalizeSettings(fees.DEFAULT_SETTINGS);
    root.chrome.storage.sync.set({ [STORAGE_KEY]: defaults }, () => {
      fillForm(defaults);
      setStatus('Defaults restored.');
    });
  });

  load();
})(globalThis);
