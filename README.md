# MAC.BID True Price

A Chrome extension that shows what a [MAC.BID](https://www.mac.bid) lot actually costs — buyer's premium, lot fee and sales tax — before you bid.

![The estimated total panel injected into a MAC.BID lot page](assets/screenshot.png)

Not affiliated with MAC.BID.

## The math

```
total = (bid + bid × 15% + $3 lot fee + optional assurance) × (1 + tax rate)
```

Fee structure per [mac.bid's terms of use](https://www.mac.bid/terms-of-use). Tax uses each state's **base** rate — the local rate at your pickup warehouse may be slightly higher, so set a custom rate when you need an exact figure.

## What it does

Adds an estimated-total panel to lot pages showing the all-in price, what percentage of retail you're paying, a collapsible fee breakdown, and a budget field that works backwards to a max safe bid. Budgets are saved per lot and expire when the auction ends. Listing and search pages get compact `Est. $…` badges.

Premium rate, lot fee, a custom tax rate and the RGB panel glow are configurable on the options page. Buyer's Assurance is not — it follows the checkbox on the lot page itself.

Everything runs locally in your browser. The extension makes no network requests and collects nothing; the only permission it declares is `storage`, for your settings and per-lot budgets.

## Install from source

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the `extension/` folder.
3. Visit a MAC.BID lot page — the estimated total panel appears under the countdown.

After editing any extension file, click **Reload** on the extension card, then refresh the page. Content scripts do not hot-reload.

> Only load one copy at a time. Two installs both inject into the page, fight over the same panel element, and produce a visible flicker.

## Development

```bash
npm test
```

Runs the fee, tax, parser and content-script suites on Node's built-in test runner. No dependencies, no build step.

```
extension/shared/    fee, tax and parsing logic, shared by the content
                     script, the options page and the tests
extension/tests/     Node test-runner suites
```

### Debugging

The content script carries flag-gated logging, off unless you turn it on from the page console:

```js
localStorage.setItem('macbidDebug', '1')
```

Refresh, and every panel rebuild logs which fields changed, which DOM mutation triggered the render, and a per-instance id that makes duplicate injections obvious. Turn it off with `localStorage.removeItem('macbidDebug')`.

### Manual verification checklist

- The unpacked extension loads without manifest errors.
- A lot page shows an estimated total panel.
- The total matches `(bid + bid × 0.15 + 3 + assurance) × (1 + taxRate)`.
- Updating the budget field updates the max safe bid.
- Changing options updates the lot page after a refresh or storage change.
- Editing the current bid text in DevTools updates the panel within ~150ms.
- Listing and search pages show compact `Est. $…` badges where bid text is visible.

## Publishing

```bash
npm run package
```

Writes `macbid-true-price-<version>.zip` at the repo root, containing only the runtime files — the `tests/` folder is excluded, and archive paths use forward slashes so the `shared/` folder survives unpacking. Bump `version` in `extension/manifest.json` first; the store rejects an upload that isn't newer than the published one.

The listing also needs a privacy policy URL. `privacy.html` is that page — host it with GitHub Pages (**Settings → Pages → Source: Deploy from a branch → Branch: `main` / root**) and give the dashboard `https://<your-username>.github.io/<repo>/privacy.html`.

## Repository layout

| Path | What it is |
|---|---|
| `extension/` | The extension (Manifest V3) — load this folder unpacked |
| `extension/shared/` | Fee, tax and parsing logic shared by the content script, options page and tests |
| `extension/tests/` | Node test-runner suites |
| `scripts/package.mjs` | Builds the Chrome Web Store zip |
| `privacy.html` | Privacy policy, required for the Web Store listing |
| `docs/` | Design spec and implementation plan |
| `assets/` | Screenshot and source artwork |

## Notes

- Your settings are stored with `chrome.storage.sync`, so they follow your Chrome profile. Per-lot budgets use `chrome.storage.local` and are cleaned up once the auction ends.
- If mac.bid changes their fees, update `DEFAULT_SETTINGS` at the top of `extension/shared/fees.js`.
