(function initMacbidEndTime(root) {
  'use strict';

  function zonedDateParts(instant, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(instant));

    const read = (type) => {
      const part = parts.find((candidate) => candidate.type === type);
      return part ? Number(part.value) : Number.NaN;
    };

    return { year: read('year'), month: read('month'), day: read('day') };
  }

  // Compare calendar dates rather than adding 24 hours, so a DST transition -
  // a 23 or 25 hour day - cannot shift the answer.
  function dayOffset(target, reference) {
    return Math.round(
      (Date.UTC(target.year, target.month - 1, target.day)
        - Date.UTC(reference.year, reference.month - 1, reference.day)) / 86400000,
    );
  }

  function formatAuctionEnd(endsAt, timeZone, now) {
    if (!Number.isFinite(endsAt) || typeof timeZone !== 'string' || timeZone === '') {
      return null;
    }

    const reference = Number.isFinite(now) ? now : Date.now();
    const endDate = new Date(endsAt);
    let time;
    let offset;

    try {
      time = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(endDate);
      offset = dayOffset(zonedDateParts(endsAt, timeZone), zonedDateParts(reference, timeZone));
    } catch (error) {
      return null; // unknown time zone identifier
    }

    if (!Number.isFinite(offset)) {
      return null;
    }

    if (offset === 0) {
      return `Ends today, ${time}`;
    }

    if (offset === 1) {
      return `Ends tomorrow, ${time}`;
    }

    const date = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(endDate);

    return `Ends ${date}, ${time}`;
  }

  const api = { formatAuctionEnd };

  root.MacbidEndTime = Object.assign(root.MacbidEndTime || {}, api);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.MacbidEndTime;
  }
})(globalThis);
