// /m/<pkg>/<path>: files of the workspace and third-party packages for the page and its module Worker, with bare
// import specifiers rewritten to /m/ URLs.
import { readFile } from 'node:fs/promises';
import { isRejection, locateFile, rawPathname, splitPath } from './paths.js';
import { resolveSpecifier, splitSpecifier } from './resolve.js';
import { allowReadOnly, etagOf, sendBody, sendRejection, sendText } from './respond.js';
import { rewriteImports } from './rewrite.js';
import { reachablePackages } from './workspace.js';

const PREFIX = '/m/';

/** @type {ReadonlyMap<string, string>} */
const MODULE_TYPES = new Map([
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
]);

/** @param {string} path @returns {string} the URL of a package file */
export function moduleUrl(path) {
  return PREFIX + path.split('/').map((s, i) => (s.startsWith('@') && i === 0 ? s : encodeURIComponent(s))).join('/');
}

/**
 * @param {ReadonlyMap<string, string>} workspace
 * @returns {(spec: string) => string | null}
 */
function urlResolver(workspace) {
  return (spec) => {
    const r = resolveSpecifier(spec, workspace);
    return r === null ? null : moduleUrl(`${r.pkg}/${r.subpath}`);
  };
}

/**
 * Splits "@aue/sim/src/x.js" into the package and the path inside it.
 * @param {string[]} segments
 * @returns {{ pkg: string, inner: string[] } | null}
 */
function splitPackage(segments) {
  const s = splitSpecifier(segments.join('/'));
  if (s === null || s.rest === '') return null;
  return { pkg: s.name, inner: segments.slice(s.name.split('/').length) };
}

/**
 * @param {{ workspace: ReadonlyMap<string, string>, browserPackages: Iterable<string> }} o
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => boolean}
 */
export function createModuleHandler({ workspace, browserPackages }) {
  const servable = reachablePackages(new Map(workspace), browserPackages);
  const resolveUrl = urlResolver(workspace);
  /** Rewritten bodies by real file path; valid while the mtime matches. @type {Map<string, { mtimeMs: number, body: Buffer, etag: string }>} */
  const cache = new Map();

  /** @param {string} file @param {number} mtimeMs @param {string} type */
  async function load(file, mtimeMs, type) {
    const hit = cache.get(file);
    if (hit?.mtimeMs === mtimeMs) return hit;
    const raw = await readFile(file);
    const body = type.startsWith('text/javascript') ? Buffer.from(rewriteImports(raw.toString('utf8'), resolveUrl)) : raw;
    const entry = { mtimeMs, body, etag: etagOf(body) };
    cache.set(file, entry);
    return entry;
  }

  /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {string} rest */
  async function serve(req, res, rest) {
    if (!allowReadOnly(req, res)) return;
    const segments = splitPath(rest);
    if (isRejection(segments)) return sendRejection(res, segments);
    const target = splitPackage(segments);
    const dir = target === null ? undefined : workspace.get(target.pkg);
    if (target === null || dir === undefined || !servable.has(target.pkg)) return sendText(res, 404, 'not found');
    const found = await locateFile(dir, target.inner, MODULE_TYPES);
    if (isRejection(found)) return sendRejection(res, found);
    const { body, etag } = await load(found.file, found.mtimeMs, found.type);
    sendBody(req, res, { body, type: found.type, etag });
  }

  return (req, res) => {
    const path = rawPathname(req.url);
    if (!path.startsWith(PREFIX)) return false;
    serve(req, res, path.slice(PREFIX.length)).catch((err) => {
      if (res.headersSent) return res.destroy();
      sendText(res, 500, err instanceof Error ? err.message : 'internal error');
    });
    return true;
  };
}
