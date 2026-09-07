import assert from 'node:assert/strict';
import test from 'node:test';

import '../shared/endtime.js';

const endtime = globalThis.MacbidEndTime;

const ZONE = 'America/New_York';
// 2026-08-31T01:15Z is Sunday 30 August, 9:15 PM in New York.
const SUNDAY_EVENING = Date.UTC(2026, 7, 31, 1, 15);
const HOUR = 3600000;
const DAY = 24 * HOUR;

test('formatAuctionEnd says today when the auction ends on the current day there', () => {
  const label = endtime.formatAuctionEnd(SUNDAY_EVENING, ZONE, SUNDAY_EVENING - HOUR);

  assert.match(label, /^Ends today, /);
  // Asserted in pieces: the space before PM is a narrow no-break space in some
  // ICU builds, so an exact "9:15 PM" literal is not portable across Node versions.
  assert.match(label, /9:15/);
  assert.match(label, /PM/);
  assert.match(label, /EDT$/);
});

test('formatAuctionEnd says tomorrow for the next calendar day there', () => {
  const label = endtime.formatAuctionEnd(SUNDAY_EVENING, ZONE, SUNDAY_EVENING - DAY);

  assert.match(label, /^Ends tomorrow, /);
});

test('formatAuctionEnd falls back to weekday and date further out', () => {
  const label = endtime.formatAuctionEnd(SUNDAY_EVENING, ZONE, SUNDAY_EVENING - 5 * DAY);

  assert.match(label, /^Ends Sun, Aug 30, /);
});

test('formatAuctionEnd decides the day word in the target zone, not the host zone', () => {
  // The same instant is 30 August in New York but 31 August in London, so a
  // London reference an hour earlier is still the same calendar day there.
  // Asserted on the time, not the zone name: en-US renders Europe/London as
  // "GMT+1", not "BST".
  const label = endtime.formatAuctionEnd(SUNDAY_EVENING, 'Europe/London', SUNDAY_EVENING - HOUR);

  assert.match(label, /^Ends today, /);
  assert.match(label, /2:15/);
});

test('formatAuctionEnd returns null for unusable input', () => {
  assert.equal(endtime.formatAuctionEnd(null, ZONE, Date.now()), null);
  assert.equal(endtime.formatAuctionEnd(SUNDAY_EVENING, null, Date.now()), null);
  assert.equal(endtime.formatAuctionEnd(Number.NaN, ZONE, Date.now()), null);
  assert.equal(endtime.formatAuctionEnd(SUNDAY_EVENING, 'Not/AZone', Date.now()), null);
});
