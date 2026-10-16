// The site's own URLs (docs/spec/site.md 站点-1): the pages sit side by side (/, play, room) and everything else is
// next to them, so every URL is made from the page's own address — the site may be served under any path behind a
// proxy (https://host/icebreaker/), never only at the root.

/** A URL of the site, from a path relative to its pages (no leading slash). @param {string} path @param {string} [page] */
export const siteUrl = (path, page = location.href) => new URL(path, page);

/** The WebSocket URL of a path of the site: ws: beside http:, wss: beside https:. @param {string} path @param {string} [page] */
export function socketUrl(path, page = location.href) {
  const u = siteUrl(path, page);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.href;
}

/**
 * The asset directory's URL (a local directory the server serves, AUE_ASSETS_DIR): the page's <meta name="ig-assets">
 * names it with the directory's version (站点-3), else assets/skeleton/.
 * @param {{ querySelector: (s: string) => { getAttribute: (n: string) => string | null } | null } | undefined} [doc] @param {string} [page]
 */
export function assetsUrl(doc = globalThis.document, page = location.href) {
  return siteUrl(doc?.querySelector('meta[name="ig-assets"]')?.getAttribute('content') || 'assets/skeleton/', page);
}
