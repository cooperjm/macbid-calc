# Auction End Time — Design

**Date:** 2026-09-06
**Status:** Approved, ready for implementation planning

## Goal

Show the absolute date and time an auction ends at the top of the estimated-total panel, so a bidder knows immediately when a lot closes instead of mentally adding a countdown to the current time.

The time is shown in the **warehouse's** timezone. MAC.BID requires local pickup, so a bidder is nearly always in the warehouse's region — warehouse time is their time, and it is the clock that matters for planning a pickup.

## User-facing behaviour

The panel gains a header line above the `ESTIMATED TOTAL` kicker, separated from it by a hairline rule:

```
[clock] Ends today, 9:15 PM EDT
─────────────────────────────────────
ESTIMATED TOTAL
$204.32
DC base tax: 6% estimate. Local taxes may vary.
8.52% of $2,399.00 retail
```

### Format

| Case | Output |
|---|---|
| Ends on the warehouse's current day | `Ends today, 9:15 PM EDT` |
| Ends on the following day | `Ends tomorrow, 9:15 PM EDT` |
| Anything further out | `Ends Sat, Aug 30, 9:15 PM EDT` |

`today` / `tomorrow` are evaluated **in the warehouse's timezone**, never the viewer's, so the day word can never contradict the time beside it.

The timezone abbreviation is always printed. It costs four characters and makes the reference frame explicit for the minority of viewers whose own clock differs.

### When the line is hidden

The line is omitted entirely — no gap, no placeholder, panel starts with the kicker exactly as today — when:

- No countdown is present on the page, or it has expired (`parseAuctionEndTime()` returns `null`).
- The warehouse timezone cannot be determined (see below).

## Timezone resolution

New `selectTimeZone({ locationName, stateCode })` in `extension/shared/taxes.js`, mirroring the shape of the existing `selectTaxRate`. Resolution order:

1. **Warehouse match.** Each `WAREHOUSE_RATES` entry gains a `timeZone` field. Nine are `America/New_York`; **El Paso is `America/Denver`** — it is the one MAC.BID warehouse not on the same clock as the rest of its state, which is why this lookup is warehouse-granular rather than state-granular.
2. **Single-zone state fallback.** A `STATE_TIME_ZONES` map covering only states that lie entirely in one zone. Used when a warehouse is not recognised — a newly opened location, or a parse miss.
3. **Otherwise `null`,** and the line hides.

Multi-zone states are deliberately **absent** from `STATE_TIME_ZONES`: `AK`, `FL`, `ID`, `IN`, `KS`, `KY`, `MI`, `NE`, `NV`, `ND`, `OR`, `SD`, `TN`, `TX`. Guessing in those states would be an hour wrong somewhere in the state, and a confidently wrong time is worse than no time. This costs almost nothing in practice: the warehouse table is the primary path and covers every real warehouse, so a new warehouse in a multi-zone state simply needs a table entry.

DST is handled by using IANA zone identifiers with `Intl.DateTimeFormat`, which resolves `EDT` vs `EST` correctly for the instant in question.

## Deriving the end instant

`parseAuctionEndTime()` already exists in `extension/content.js` (added for per-lot budget expiry). It returns `Date.now() + parseCountdownMs(countdownText)`.

### The stability hazard

Using that value directly would re-introduce the panel-rebuild bug fixed in `0e32d3f`. The countdown text has one-second granularity while `Date.now()` advances continuously, so the computed end instant oscillates within a ~1 second band on every render. Any timestamp derived from it enters the panel signature, the signature changes, and `renderPanel` rebuilds the panel — restarting its CSS animations several times a second.

Rounding alone does not fix this. A true end instant near a minute boundary would flip the rounded value back and forth across that boundary.

### Resolution

Cache the computed end instant at module scope:

- Recompute on each render, but **keep the cached value unless the new computation differs by more than 5 seconds.**
- 5 seconds is comfortably above the ~1 second jitter band and comfortably below a soft-close extension, so genuine extensions are still picked up.
- Clear the cache when `productKey` changes, alongside the existing per-lot budget reset, so SPA navigation to another lot does not inherit a stale end time.
- Clear the cache when `parseAuctionEndTime()` returns `null`.

Both the rendered string and the panel signature derive from the **cached** value, so the signature is stable between genuine changes. The signature carries the minute-rounded instant, matching display precision.

## Rendering

In `renderPanel`, the header line is prepended before the kicker when a formatted string is available.

One new CSS rule in `extension/content.css`. `.macbid-tp-note` cannot be reused as-is: its `margin: 3px 0 0` is top-only, designed for notes that hang below something, so first in the panel it would sit flush against the kicker. `.macbid-tp-ends` carries the bottom margin, padding and hairline `border-bottom`, with a dark-mode variant alongside the existing dark-mode block.

The clock glyph is an inline SVG. The extension ships no icon font and must not acquire a network request — it currently declares no `host_permissions` and makes no requests at all, a property worth keeping.

## Testing

**`extension/tests/taxes.test.mjs`** — `selectTimeZone`:
- warehouse match returns the warehouse zone
- El Paso specifically returns `America/Denver`, not Central
- unrecognised warehouse in a single-zone state falls back to that state's zone
- unrecognised warehouse in a multi-zone state returns `null`
- no location and no state returns `null`

**Formatting** — a fixed instant in a fixed zone, asserted on its parts (weekday, time, zone abbreviation) rather than one exact string, since ICU output varies between Node versions:
- an instant on the warehouse's current day renders `today`
- the next day renders `tomorrow`
- a further-out instant renders the weekday and date
- the day word is derived in the target zone, not the host's — verified with an instant that falls on different days in two zones

**`extension/tests/content.test.mjs`** — source assertions, matching the file's existing style:
- the end instant is cached rather than recomputed into the signature each render
- the cache is cleared on `productKey` change

## Out of scope

- Relative phrasing beyond today/tomorrow ("in 3 days") — the countdown directly above the panel already carries urgency.
- Showing the viewer's local time alongside the warehouse time. Considered and rejected: with local pickup the two nearly always coincide, so it would add a redundant line in almost every case.
- Listing-page badges. The badges are compact by design and have no room for a timestamp.
