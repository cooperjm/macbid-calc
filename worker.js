/**
 * Cloudflare Worker — CORS proxy for mac.bid's search API.
 *
 * Only needed if the GitHub Pages site shows a CORS error when searching.
 * Deploy (free):
 *   1. https://dash.cloudflare.com → Workers & Pages → Create Worker
 *   2. Paste this file, deploy, copy the worker URL
 *   3. In index.html, set:
 *      const API_BASE = 'https://<your-worker>.workers.dev/search';
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Only proxy the search endpoint
    if (url.pathname !== '/search') {
      return new Response('Not found', { status: 404 });
    }

    const upstream = 'https://api.macdiscount.com/search' + url.search;
    const resp = await fetch(upstream, {
      headers: { 'Accept': 'application/json' },
      cf: { cacheTtl: 30, cacheEverything: true },
    });

    return new Response(resp.body, {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=30',
      },
    });
  },
};
