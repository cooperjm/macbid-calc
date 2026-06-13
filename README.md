# MAC.BID Fee Calculator

A single-page web app that shows exactly what you'll pay before you bid on [MAC.BID](https://www.mac.bid) — buyer's premium (15%), lot fee ($3), and sales tax — with live lot search, a "vs retail" comparison, and a reverse calculator that turns a budget into a max safe bid.

Not affiliated with MAC.BID.

## Files

| File | Purpose |
|---|---|
| `index.html` | The whole app — HTML, CSS, and JS in one file |
| `manifest.json` | Lets phones "Add to Home Screen" like a native app |
| `icon.svg` | App icon |
| `worker.js` | Optional Cloudflare Worker CORS proxy (only if search is blocked, see below) |

## Deploy to GitHub Pages

1. Create a new repository on GitHub (e.g. `macbid-calc`). Public repos get free Pages hosting.
2. Upload all files in this folder (or push with git):
   ```
   git init
   git add .
   git commit -m "MAC.BID fee calculator"
   git branch -M main
   git remote add origin https://github.com/<your-username>/macbid-calc.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / root → Save**.
4. After a minute, your app is live at `https://<your-username>.github.io/macbid-calc/`.

On your phone, open that URL and use **Add to Home Screen** to install it like an app.

## If search shows a CORS error

The app calls mac.bid's public search API directly from your browser. If mac.bid blocks cross-origin requests, you'll see a CORS message under the search box. Fix (free, ~2 minutes):

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Worker**.
2. Replace the default code with the contents of `worker.js` and click **Deploy**.
3. Copy your worker URL (looks like `https://macbid-proxy.<you>.workers.dev`).
4. In `index.html`, find the `API_BASE` constant near the top of the `<script>` section and change it to:
   ```js
   const API_BASE = 'https://macbid-proxy.<you>.workers.dev/search';
   ```
5. Commit and push — done.

## Notes

- Tax uses each state's **base** rate; local rates at your pickup warehouse may be slightly higher. Use "Custom rate…" for an exact figure.
- Search loads the **current** bid — adjust it to what you actually plan to bid.
- Your tax state, assurance setting, and budget are remembered in your browser (localStorage).
- Fee structure per [mac.bid's terms of use](https://www.mac.bid/terms-of-use). If their fees change, update `LOT` and `PREM` at the top of the script in `index.html`.

## Chrome extension development

This repo also contains an unpacked Chrome extension in `extension/`.

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension/` folder.
5. Visit a MAC.BID item page and confirm the estimated total panel appears.

Run focused shared-logic tests with `npm test`.

### Extension manual verification checklist

- The unpacked extension loads without manifest errors.
- An item page shows an estimated total panel.
- The total matches: `(bid + bid * 0.15 + 3 + assurance) * (1 + taxRate)`.
- Updating the budget field updates the max safe bid.
- Changing extension options updates the item page after refresh or storage change.
- Editing the current bid text in DevTools updates the panel within about 150ms.
- Listing/search pages show compact `Est. $...` badges when bid text is visible.
