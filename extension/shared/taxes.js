(function attachMacbidTaxes(root) {
  'use strict';

  const STATE_NAMES = Object.freeze({
    AL: 'Alabama',
    AK: 'Alaska',
    AZ: 'Arizona',
    AR: 'Arkansas',
    CA: 'California',
    CO: 'Colorado',
    CT: 'Connecticut',
    DE: 'Delaware',
    FL: 'Florida',
    GA: 'Georgia',
    HI: 'Hawaii',
    ID: 'Idaho',
    IL: 'Illinois',
    IN: 'Indiana',
    IA: 'Iowa',
    KS: 'Kansas',
    KY: 'Kentucky',
    LA: 'Louisiana',
    ME: 'Maine',
    MD: 'Maryland',
    MA: 'Massachusetts',
    MI: 'Michigan',
    MN: 'Minnesota',
    MS: 'Mississippi',
    MO: 'Missouri',
    MT: 'Montana',
    NE: 'Nebraska',
    NV: 'Nevada',
    NH: 'New Hampshire',
    NJ: 'New Jersey',
    NM: 'New Mexico',
    NY: 'New York',
    NC: 'North Carolina',
    ND: 'North Dakota',
    OH: 'Ohio',
    OK: 'Oklahoma',
    OR: 'Oregon',
    PA: 'Pennsylvania',
    RI: 'Rhode Island',
    SC: 'South Carolina',
    SD: 'South Dakota',
    TN: 'Tennessee',
    TX: 'Texas',
    UT: 'Utah',
    VT: 'Vermont',
    VA: 'Virginia',
    WA: 'Washington',
    WV: 'West Virginia',
    WI: 'Wisconsin',
    WY: 'Wyoming',
    DC: 'District of Columbia',
  });

  const STATE_NAME_TO_CODE = Object.freeze(
    Object.entries(STATE_NAMES).reduce((lookup, [code, name]) => {
      lookup[name.toLowerCase()] = code;
      return lookup;
    }, {}),
  );

  const STATE_BASE_RATES = Object.freeze({
    AL: 0.04,
    AK: 0,
    AZ: 0.056,
    AR: 0.065,
    CA: 0.0725,
    CO: 0.029,
    CT: 0.0635,
    DE: 0,
    FL: 0.06,
    GA: 0.04,
    HI: 0.04,
    ID: 0.06,
    IL: 0.0625,
    IN: 0.07,
    IA: 0.06,
    KS: 0.065,
    KY: 0.06,
    LA: 0.0445,
    ME: 0.055,
    MD: 0.06,
    MA: 0.0625,
    MI: 0.06,
    MN: 0.06875,
    MS: 0.07,
    MO: 0.04225,
    MT: 0,
    NE: 0.055,
    NV: 0.0685,
    NH: 0,
    NJ: 0.06625,
    NM: 0.05125,
    NY: 0.04,
    NC: 0.0475,
    ND: 0.05,
    OH: 0.0575,
    OK: 0.045,
    OR: 0,
    PA: 0.06,
    RI: 0.07,
    SC: 0.06,
    SD: 0.042,
    TN: 0.07,
    TX: 0.0625,
    UT: 0.061,
    VT: 0.06,
    VA: 0.053,
    WA: 0.065,
    WV: 0.06,
    WI: 0.05,
    WY: 0.04,
    DC: 0.06,
  });

  const WAREHOUSE_RATES = Object.freeze([
    { name: 'Pittsburgh Mills', stateCode: 'PA', rate: 0.07, timeZone: 'America/New_York' },
    { name: 'Monroeville', stateCode: 'PA', rate: 0.07, timeZone: 'America/New_York' },
    { name: 'Robinson', stateCode: 'PA', rate: 0.07, timeZone: 'America/New_York' },
    { name: 'Beaver Falls', stateCode: 'PA', rate: 0.06, timeZone: 'America/New_York' },
    { name: 'Akron', stateCode: 'OH', rate: 0.0675, timeZone: 'America/New_York' },
    { name: 'Canton', stateCode: 'OH', rate: 0.065, timeZone: 'America/New_York' },
    { name: 'Rock Hill', stateCode: 'SC', rate: 0.07, timeZone: 'America/New_York' },
    { name: 'Spartanburg', stateCode: 'SC', rate: 0.07, timeZone: 'America/New_York' },
    { name: 'Gastonia', stateCode: 'NC', rate: 0.07, timeZone: 'America/New_York' },
    // El Paso is the one warehouse not on its state's dominant clock.
    { name: 'El Paso', stateCode: 'TX', rate: 0.0825, timeZone: 'America/Denver' },
  ]);

  // Single-zone states only. AK, FL, ID, IN, KS, KY, MI, NE, NV, ND, OR, SD, TN
  // and TX span two zones and are omitted on purpose - see selectTimeZone.
  const STATE_TIME_ZONES = Object.freeze({
    AL: 'America/Chicago', AR: 'America/Chicago', AZ: 'America/Phoenix',
    CA: 'America/Los_Angeles', CO: 'America/Denver', CT: 'America/New_York',
    DC: 'America/New_York', DE: 'America/New_York', GA: 'America/New_York',
    HI: 'Pacific/Honolulu', IA: 'America/Chicago', IL: 'America/Chicago',
    LA: 'America/Chicago', MA: 'America/New_York', MD: 'America/New_York',
    ME: 'America/New_York', MN: 'America/Chicago', MO: 'America/Chicago',
    MS: 'America/Chicago', MT: 'America/Denver', NC: 'America/New_York',
    NH: 'America/New_York', NJ: 'America/New_York', NM: 'America/Denver',
    NY: 'America/New_York', OH: 'America/New_York', OK: 'America/Chicago',
    PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York',
    UT: 'America/Denver', VA: 'America/New_York', VT: 'America/New_York',
    WA: 'America/Los_Angeles', WI: 'America/Chicago', WV: 'America/New_York',
    WY: 'America/Denver',
  });

  const WAREHOUSE_CONTEXT_WORDS = Object.freeze([
    'location',
    'pickup',
    'site',
    'store',
    'warehouse',
  ]);

  function trimEdgePunctuation(value) {
    return value.trim().replace(/^[\s.,;:()[\]{}]+|[\s.,;:()[\]{}]+$/g, '');
  }

  function normalizeStateCode(value) {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = trimEdgePunctuation(value);

    if (normalized === '') {
      return null;
    }

    const code = normalized.toUpperCase();

    if (Object.prototype.hasOwnProperty.call(STATE_NAMES, code)) {
      return code;
    }

    return STATE_NAME_TO_CODE[normalized.toLowerCase()] || null;
  }

  function normalizeText(value) {
    return typeof value === 'string' ? trimEdgePunctuation(value).toLowerCase() : '';
  }

  function tokenizeLocation(value) {
    const normalized = normalizeText(value);
    return normalized === '' ? [] : normalized.split(/[^a-z0-9]+/).filter(Boolean);
  }

  // A real pick-up location arrives as a full address - "1335 Isley Drive,
  // Gastonia, NC 28052" - with the warehouse name mid-string. Matching across the
  // whole token stream would reject it, because the street tokens are neither
  // context words nor state tokens. Match a segment at a time instead, which also
  // keeps "North Canton" from matching the Canton warehouse: they share a segment.
  function splitLocationSegments(value) {
    if (typeof value !== "string") {
      return [];
    }

    return value.split(/[,\n;]+/).map((segment) => segment.trim()).filter(Boolean);
  }

  function normalizeRate(value) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string' && value.trim() === '') {
      return null;
    }

    const rawRate = Number(value);

    if (!Number.isFinite(rawRate) || rawRate < 0) {
      return null;
    }

    const rate = rawRate > 1 ? rawRate / 100 : rawRate;

    return rate <= 1 ? rate : null;
  }

  function isWarehouseContext(token) {
    return WAREHOUSE_CONTEXT_WORDS.includes(token);
  }

  function getStateTokens(stateCode) {
    const normalizedState = normalizeStateCode(stateCode);

    if (!normalizedState) {
      return [];
    }

    return [normalizedState.toLowerCase(), ...tokenizeLocation(STATE_NAMES[normalizedState])];
  }

  function isAllowedSurroundingToken(token, stateTokens) {
    return isWarehouseContext(token) || stateTokens.includes(token);
  }

  function hasWarehouseTokenMatch(locationTokens, warehouseTokens, stateCode) {
    if (locationTokens.length === 0 || warehouseTokens.length === 0) {
      return false;
    }

    const stateTokens = getStateTokens(stateCode);

    for (let index = 0; index <= locationTokens.length - warehouseTokens.length; index += 1) {
      const matchesAtIndex = warehouseTokens.every((token, offset) => locationTokens[index + offset] === token);

      if (!matchesAtIndex) {
        continue;
      }

      const before = locationTokens.slice(0, index);
      const after = locationTokens.slice(index + warehouseTokens.length);
      const beforeAllowed = before.length === 0 || before.every((token) => isAllowedSurroundingToken(token, stateTokens));
      const afterAllowed = after.length === 0 || after.every((token) => isAllowedSurroundingToken(token, stateTokens));

      if (beforeAllowed && afterAllowed) {
        return true;
      }
    }

    return false;
  }

  function findWarehouseEntry(locationName, stateCode) {
    const segments = splitLocationSegments(locationName);

    if (segments.length === 0) {
      return null;
    }

    const normalizedState = normalizeStateCode(stateCode);

    return WAREHOUSE_RATES.find((warehouse) => {
      if (normalizedState && warehouse.stateCode !== normalizedState) {
        return false;
      }

      const warehouseTokens = tokenizeLocation(warehouse.name);

      return segments.some((segment) => hasWarehouseTokenMatch(
        tokenizeLocation(segment),
        warehouseTokens,
        warehouse.stateCode,
      ));
    }) || null;
  }

  function findWarehouseRate(locationName, stateCode) {
    const match = findWarehouseEntry(locationName, stateCode);

    if (!match) {
      return null;
    }

    return {
      rate: match.rate,
      source: match.name,
      label: `${match.name} tax`,
      kind: 'warehouse',
      stateCode: match.stateCode,
    };
  }

  function selectTaxRate({ settings, locationName, stateCode } = {}) {
    const inputSettings = settings && typeof settings === 'object' ? settings : {};
    const customRate = normalizeRate(inputSettings.customTaxRate);

    if (inputSettings.customTaxEnabled && customRate !== null) {
      return {
        rate: customRate,
        source: 'Custom tax',
        label: 'Custom tax',
        kind: 'custom',
      };
    }

    const warehouseRate = findWarehouseRate(locationName, stateCode);

    if (warehouseRate) {
      return warehouseRate;
    }

    const normalizedState = normalizeStateCode(stateCode);

    if (normalizedState) {
      const rate = Object.prototype.hasOwnProperty.call(STATE_BASE_RATES, normalizedState)
        ? STATE_BASE_RATES[normalizedState]
        : 0.06;

      return {
        rate,
        source: `${normalizedState} base tax`,
        label: `${normalizedState} base tax`,
        kind: 'state',
        stateCode: normalizedState,
      };
    }

    return {
      rate: 0,
      source: 'Tax unknown',
      label: 'Tax unknown',
      kind: 'unknown',
    };
  }

  function selectTimeZone({ locationName, stateCode } = {}) {
    const warehouse = findWarehouseEntry(locationName, stateCode);

    if (warehouse && warehouse.timeZone) {
      return warehouse.timeZone;
    }

    const normalizedState = normalizeStateCode(stateCode);

    if (normalizedState && Object.prototype.hasOwnProperty.call(STATE_TIME_ZONES, normalizedState)) {
      return STATE_TIME_ZONES[normalizedState];
    }

    return null;
  }

  const api = {
    STATE_NAMES,
    STATE_BASE_RATES,
    WAREHOUSE_RATES,
    STATE_TIME_ZONES,
    normalizeStateCode,
    findWarehouseRate,
    selectTaxRate,
    selectTimeZone,
  };

  root.MacbidTaxes = Object.assign(root.MacbidTaxes || {}, api);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.MacbidTaxes;
  }
})(globalThis);
