// The asset directory with a version (docs/spec/site.md 站点-3): the version is taken once from every file's path,
// size and modification time; assets/~<version>/… is the same file as assets/… but may be cached for a year, so a
// browser or a proxy keeps the large assets until the directory changes. A page names the versioned base in its
// <meta name="ig-assets">.
import { readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createStaticHandler } from './static.js';
import { rawPathname } from './paths.js';

/** How long a versioned asset may be kept: a year, never revalidated. */
export const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * The version of a directory: 12 hex digits of a hash over every file's path, size and modification time (sorted).
 * @param {string} dir
 */
export function assetVersion(dir) {
  const h = createHash('sha256');
  /** @param {string} rel */
  const walk = (rel) => {
    const entries = readdirSync(join(dir, rel), { withFileTypes: true }).map((e) => e.name).sort();
    for (const name of entries) {
      const path = rel ? `${rel}/${name}` : name, st = statSync(join(dir, path));
      if (st.isDirectory()) walk(path);
      else if (st.isFile()) h.update(`${path}\0${st.size}\0${Math.floor(st.mtimeMs)}\n`);
    }
  };
  walk('');
  return h.digest('hex').slice(0, 12);
}

/**
 * The handler of /assets/ (no-cache, as every static file) and /assets/~<version>/ (a year when the version is the
 * directory's, else no-cache: an old page's request gets today's file without it being kept).
 * @param {string} dir @param {string} version
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => boolean}
 */
export function createAssetHandler(dir, version) {
  const plain = createStaticHandler(dir, '/assets/'), kept = createStaticHandler(dir, '/assets/', IMMUTABLE);
  return (req, res) => {
    const path = rawPathname(req.url);
    const m = /^\/assets\/~([0-9a-f]{1,32})\//.exec(path);
    if (!m) return plain(req, res);
    req.url = `/assets/${path.slice(m[0].length)}`;
    return (m[1] === version ? kept : plain)(req, res);
  };
}

/** The pages' asset base: assets/~<version>/skeleton/, or assets/skeleton/ without assets. @param {string | null} version */
export const assetBase = (version) => (version ? `assets/~${version}/skeleton/` : 'assets/skeleton/');
