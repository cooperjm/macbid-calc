(function attachMacbidParser(root) {
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

  const LABEL_PATTERNS = Object.freeze({
    currentBid: /\bcurrent\s+bid\b/i,
    retailPrice: /\bretail\s+price\b/i,
    assuranceFee: /\bbuyer'?s\s+assurance\b/i,
    locationName: /\blocation\b/i,
  });

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeText(value) {
    return typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : '';
  }

  function parseCurrency(value) {
    if (typeof value !== 'string') {
      return null;
    }

    const match = value.match(/\$\s*((?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]{1,2})?)(?![0-9A-Za-z,.])/);

    if (!match) {
      return null;
    }

    const amount = Number(match[1].replace(/,/g, ''));
    return Number.isFinite(amount) ? amount : null;
  }

  function extractStateCode(value) {
    const text = normalizeText(value);

    if (!text.trim()) {
      return null;
    }

    for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
      const namePattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');

      if (namePattern.test(text)) {
        return code;
      }
    }

    const codePattern = /(^|[\s,;:()[\]{}-])([A-Z]{2})(?=$|[\s,.;:()[\]{}-])/g;
    let match = codePattern.exec(text);

    while (match) {
      const rawCode = match[2];
      const code = rawCode.toUpperCase();

      if (Object.prototype.hasOwnProperty.call(STATE_NAMES, code)) {
        return code;
      }

      match = codePattern.exec(text);
    }

    return null;
  }

  function getLines(text) {
    return normalizeText(text)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function stripLabel(line, labelPattern) {
    return line.replace(labelPattern, '').replace(/^[:\s-]+/, '').trim();
  }

  function cleanLabelValue(value) {
    return value.replace(/^[:\s-]+/, '').trim();
  }

  function findNextLabelIndex(value) {
    return Object.values(LABEL_PATTERNS).reduce((earliest, labelPattern) => {
      const match = labelPattern.exec(value);

      if (!match) {
        return earliest;
      }

      return earliest === -1 ? match.index : Math.min(earliest, match.index);
    }, -1);
  }

  function truncateAtNextLabel(value) {
    const nextLabelIndex = findNextLabelIndex(value);
    return nextLabelIndex === -1 ? value : value.slice(0, nextLabelIndex);
  }

  function hasKnownLabel(value) {
    return Object.values(LABEL_PATTERNS).some((labelPattern) => labelPattern.test(value));
  }

  function hasKnownLabelBefore(line, labelIndex) {
    const beforeLabel = line.slice(0, labelIndex);
    return Object.entries(LABEL_PATTERNS).some(([name, labelPattern]) => {
      return name !== 'locationName' && labelPattern.test(beforeLabel);
    });
  }

  function isLocationHeaderTail(value) {
    return /^(details?|info(?:rmation)?)$/i.test(value.trim());
  }

  function findLabeledValue(lines, labelPattern) {
    for (let index = 0; index < lines.length; index += 1) {
      const match = labelPattern.exec(lines[index]);

      if (!match) {
        continue;
      }

      const value = stripLabel(truncateAtNextLabel(lines[index].slice(match.index + match[0].length)), labelPattern);

      if (value) {
        return value;
      }

      if (index + 1 < lines.length && !hasKnownLabel(lines[index + 1])) {
        return lines[index + 1];
      }
    }

    return '';
  }

  function findFallbackLocationLine(lines) {
    return lines.find((line) => !hasKnownLabel(line) && extractStateCode(line)) || '';
  }

  function findLocationValue(lines) {
    const locationPattern = /\blocation\b/gi;

    for (let index = 0; index < lines.length; index += 1) {
      locationPattern.lastIndex = 0;
      let match = locationPattern.exec(lines[index]);

      while (match) {
        const isLineStartLabel = match.index === 0;
        const isMixedKnownLabel = hasKnownLabelBefore(lines[index], match.index);

        if (isLineStartLabel || isMixedKnownLabel) {
          const value = cleanLabelValue(truncateAtNextLabel(lines[index].slice(match.index + match[0].length)));

          if (value && !isLocationHeaderTail(value)) {
            return value;
          }

          if (index + 1 < lines.length && !hasKnownLabel(lines[index + 1]) && extractStateCode(lines[index + 1])) {
            return lines[index + 1];
          }
        }

        match = locationPattern.exec(lines[index]);
      }
    }

    return findFallbackLocationLine(lines);
  }

  function parseSnapshotFromText(text) {
    const lines = getLines(text);
    const locationName = findLocationValue(lines);

    return {
      currentBid: parseCurrency(findLabeledValue(lines, LABEL_PATTERNS.currentBid)),
      retailPrice: parseCurrency(findLabeledValue(lines, LABEL_PATTERNS.retailPrice)),
      assuranceFee: parseCurrency(findLabeledValue(lines, LABEL_PATTERNS.assuranceFee)),
      stateCode: extractStateCode(locationName || normalizeText(text)),
      locationName,
    };
  }

  function parseSnapshotFromDocument(doc) {
    const body = doc && doc.body;
    const text = body ? body.innerText || body.textContent || '' : '';
    return parseSnapshotFromText(text);
  }

  const api = {
    parseCurrency,
    extractStateCode,
    parseSnapshotFromText,
    parseSnapshotFromDocument,
  };

  root.MacbidParser = Object.assign(root.MacbidParser || {}, api);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.MacbidParser;
  }
})(globalThis);
