// The pinned Stronghold kits (ADR 0058 of the engine, its compat spec 兼容-6): where the server finds the pinned commit,
// the /k/ route that serves its content files to the page's Worker with their imports of Stronghold engine modules
// rewritten to the engine's compat modules (by the engine's own mapping table, so the browser never rewrites), and the
// kits loaded under Node for the arbiter.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { init, parse } from 'es-module-lexer';
import { KIT_SOURCE, loadKits, mappedUrl } from '@aue/content';
import { isRejection, locateFile, rawPathname, splitPath } from './paths.js';
import { allowReadOnly, etagOf, sendBody, sendRejection, sendText } from './respond.js';
import { relativeUrl } from './rewrite.js';

await init;

/** The URL prefix of the kits' content files. */
export const KIT_PREFIX = '/k/';
/** The content files of the pinned commit: only these are served. */
const CONTENT = 'server/sim/content/';
/** A made-up origin to resolve imports against; only the paths are kept. */
const ORIGIN = 'http://kit.invalid';
const JS = new Map([['.js', 'text/javascript; charset=utf-8']]);

/**
 * Where the pinned commit is: AUE_KITS_DIR, else the engine's oracle cache; null when it is not there.
 * @param {string} rootDir the platform repository root
 */
export function kitDir(rootDir) {
  const dir = process.env['AUE_KITS_DIR'] || join(rootDir, 'engine', '.cache', 'oracle', `stronghold-${KIT_SOURCE.sha.slice(0, 12)}`);
  return existsSync(join(dir, CONTENT)) ? dir : null;
}

/**
 * A content file's source with its imports of Stronghold engine modules pointed at the engine's compat modules under
 * /m/, relative to the file's own URL (站点-1); imports of other content files stay as they are.
 * @param {string} source @param {string} rel the file's path from the commit's root
 */
export function rewriteKitImports(source, rel) {
  const [imports] = parse(source);
  const root = `${ORIGIN}${KIT_PREFIX}`, compat = `${ORIGIN}/m/@aue/content/src/compat/`;
  let out = source;
  for (const imp of [...imports].reverse()) {
    const spec = imp.specifier;
    if (typeof spec !== 'string' || !(spec.startsWith('./') || spec.startsWith('../'))) continue;
    const to = mappedUrl(root, new URL(spec, root + rel).href, compat);
    if (to === null) continue;
    const path = relativeUrl(KIT_PREFIX + rel, to.slice(ORIGIN.length));
    out = out.slice(0, imp.start) + (imp.type === 'dynamic' ? JSON.stringify(path) : path) + out.slice(imp.end);
  }
  return out;
}

/**
 * The /k/ route: the pinned commit's content files, rewritten (cached by file while its mtime holds).
 * @param {string | null} dir the pinned commit, or null: every /k/ request is 404
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => boolean}
 */
export function createKitHandler(dir) {
  /** @type {Map<string, { mtimeMs: number, body: Buffer, etag: string }>} */
  const cache = new Map();
  const prefix = KIT_PREFIX + CONTENT;
  return (req, res) => {
    const path = rawPathname(req.url);
    if (!path.startsWith(KIT_PREFIX)) return false;
    if (dir === null || !path.startsWith(prefix)) { sendText(res, 404, 'not found'); return true; }
    serve(req, res, path.slice(prefix.length)).catch(() => sendText(res, 500, 'internal error'));
    return true;
  };

  /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {string} rest */
  async function serve(req, res, rest) {
    if (!allowReadOnly(req, res)) return;
    const segments = splitPath(rest);
    if (isRejection(segments)) return sendRejection(res, segments);
    const found = await locateFile(join(/** @type {string} */ (dir), CONTENT), segments, JS);
    if (isRejection(found)) return sendRejection(res, found);
    let hit = cache.get(found.file);
    if (hit?.mtimeMs !== found.mtimeMs) {
      const body = Buffer.from(rewriteKitImports(await readFile(found.file, 'utf8'), CONTENT + segments.join('/')));
      hit = { mtimeMs: found.mtimeMs, body, etag: etagOf(body) };
      cache.set(found.file, hit);
    }
    sendBody(req, res, { body: hit.body, type: found.type, etag: hit.etag });
  }
}

/** Whether the compat hook is registered in this process. */
let hooked = '';

/**
 * The kits of the given operators loaded under Node for the arbiter (兼容-6): the compat hook registered once for the
 * pinned commit, then the engine's loader.
 * @param {string} dir the pinned commit @param {Iterable<string>} charIds
 */
export async function nodeKits(dir, charIds) {
  const root = pathToFileURL(`${dir}/`).href;
  if (hooked !== root) {
    const compat = new URL('./compat/', import.meta.resolve('@aue/content')).href;
    register(new URL('hook.js', compat), { data: { root, compat } });
    hooked = root;
  }
  return loadKits(root, charIds);
}
