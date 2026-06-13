# MAC.BID Chrome Extension Design

## Summary

Build a Chrome Manifest V3 extension that estimates the actual out-the-door price on MAC.BID pages. The extension will inject an estimate panel into individual item pages, update the estimate when the live current bid changes, and later add compact estimate badges to listing/search pages.

The extension is not affiliated with MAC.BID. All totals are estimates because final tax and optional fees may vary by pickup location, item category, and MAC.BID rule changes.

## Goals

- Show the estimated total price directly on MAC.BID item pages.
- Include buyer's premium, lot fee, optional buyer's assurance, and sales tax.
- Select tax automatically from the item state or known warehouse when possible.
- Recalculate automatically when the page's current bid updates live.
- Let users override tax and fee assumptions when the automatic estimate is not enough.
- Keep shared fee logic separate so the current web calculator and extension can converge on the same calculations later.

## Non-Goals

- Do not place bids or automate bidding.
- Do not require a backend service for the first version.
- Do not guarantee exact local sales tax for every warehouse in the first version.
- Do not publish to the Chrome Web Store as part of the initial implementation.

## Recommended Approach

Use a separate `extension/` folder with a Manifest V3 Chrome extension:

```text
extension/
  manifest.json
  content.js
  content.css
  options.html
  options.js
  shared/
    fees.js
    parser.js
    taxes.js
```

This keeps the existing single-page calculator intact while adding extension-specific files. The extension can later share more code with `index.html`, but the first implementation should avoid a large refactor of the current app.

## Page Integration

The item-page content script will:

- Detect whether the current page looks like a MAC.BID item detail page.
- Parse the current bid from visible page text or embedded data.
- Parse location/state, retail price, and buyer's assurance when available.
- Inject a compact estimate panel near the main bid/price area.
- Re-render the panel whenever parsed data changes.
- Fall back to a clear "missing data" state if the current bid or location cannot be found.

The listing/search-page enhancement will be a second phase:

- Detect visible item cards.
- Parse each card's current bid, location/state, and retail price when available.
- Add a small total estimate badge to each card.
- Re-scan when infinite-scroll or live updates add new cards.

## Fee Rules

The first version will use these defaults:

- Buyer's premium: `15%` of bid.
- Lot fee: `$3`.
- Buyer's assurance: optional, default off unless parsed from the page or enabled by the user.
- Sales tax applies to the subtotal: bid + premium + lot fee + assurance.

The calculation should return a breakdown, not just a final total:

```text
bid
premium
lot fee
assurance
tax rate
tax amount
estimated total
overhead above bid
```

## Tax Estimation

Tax selection order:

1. User custom override for the current site or extension settings.
2. Known warehouse/location tax mapping when the page exposes a recognizable pickup location.
3. State base tax from the item state.
4. Unknown tax state with a prompt to choose or enter a custom tax rate.

The panel must label tax as estimated. If using state base tax instead of a warehouse-specific rate, the UI should say that local rates may be higher.

## Live Updates

MAC.BID item pages appear to update bids without a full refresh. The content script will use a debounced `MutationObserver` attached to the page body or the nearest stable item container.

When DOM text changes:

- Re-parse the current bid and related fields.
- Compare parsed values with the previous snapshot.
- Recalculate only when relevant values changed.
- Update the estimate panel in place.

The observer must avoid loops caused by the extension's own injected markup. It should ignore mutations inside the extension root element.

## User Controls

The item-page panel should include:

- Estimated total.
- Fee breakdown.
- Tax source label, such as "PA base tax" or "Pittsburgh Mills estimate".
- Optional assurance toggle or detected assurance amount.
- Max safe bid from budget.
- Link/button to extension options.

The options page should include:

- Custom tax rate.
- Use custom tax by default toggle.
- Buyer's assurance default and amount.
- Buyer premium percentage.
- Lot fee.
- Reset defaults.

Settings should be stored with `chrome.storage.sync` when available, with local fallback if needed.

## Parsing Strategy

MAC.BID markup may change, so parsing should be defensive:

- Prefer embedded JSON or stable data attributes if available.
- Otherwise, find nearby text labels such as "Current Bid", "Retail Price", "Location", and "Buyer's Assurance".
- Parse dollar amounts with a shared helper that handles commas and cents.
- Avoid brittle selectors as the only source of truth.
- If parsing fails, keep the page usable and explain which field is missing.

## Error Handling

The extension should handle:

- Missing bid: show "Current bid not found".
- Missing tax/location: show total without tax or prompt for a custom rate.
- Invalid custom settings: fall back to defaults.
- Unexpected page changes: keep the panel visible with a compact warning.

Errors should not throw uncaught exceptions into the page.

## Privacy And Permissions

Use the narrowest practical permissions:

- `storage` for user settings.
- Host permissions for `https://www.mac.bid/*` and `https://mac.bid/*`.

The first version should not send browsing data to any external service.

## Testing

Manual verification:

- Load the unpacked extension in Chrome.
- Open a MAC.BID item page.
- Confirm the panel appears near the bid area.
- Confirm the total matches the fee formula.
- Change settings and confirm recalculation.
- Simulate bid text changes in DevTools and confirm the panel updates live.

Focused code verification:

- Test fee calculations for normal, zero, and high bids.
- Test reverse max-bid calculation.
- Test tax source selection order.
- Test currency and state/location parsing helpers.

## Rollout Order

1. Create extension scaffold and shared fee/tax/parser modules.
2. Build item-page content script and estimate panel.
3. Add live bid observation with loop protection.
4. Add options page and persisted settings.
5. Add listing/search-page badges.
6. Revisit shared logic with the existing `index.html` calculator if duplication becomes painful.

