// Static files: the page's own files (index.html, css, images) and the asset directory.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isRejection, locateFile, rawPathname, splitPath } from './paths.js';
import { allowReadOnly, sendBody, sendRejection, sendText } from './respond.js';

/** @type {ReadonlyMap<string, string>} */
export const STATIC_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  // Asset packs also carry these (spine data, audio, fonts).
  ['.atlas', 'text/plain; charset=utf-8'],
  ['.skel', 'application/octet-stream'],
  ['.ogg', 'audio/ogg'],
  ['.mp3', 'audio/mpeg'],
  ['.woff2', 'font/woff2'],
]);

/**
 * Serves one file the caller already trusts (a fixed path, not taken from the request).
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} file
 * @param {string} type
 */
export async function serveFixedFile(req, res, file, type) {
  if (!allowReadOnly(req, res)) return;
  try {
    sendBody(req, res, { body: await readFile(file), type });
  } catch {
    sendText(res, 404, 'not found');
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} dir
 * @param {string} rest
 */
async function serveFrom(req, res, dir, rest) {
  if (!allowReadOnly(req, res)) return;
  const segments = splitPath(rest);
  if (isRejection(segments)) return sendRejection(res, segments);
  const found = await locateFile(dir, segments, STATIC_TYPES);
  if (isRejection(found)) return sendRejection(res, found);
  sendBody(req, res, { body: await readFile(found.file), type: found.type });
}

/**
 * Handler for the URLs under `prefix` (for example "/static/"), serving files from dir.
 * @param {string} dir
 * @param {string} prefix
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => boolean}
 */
export function createStaticHandler(dir, prefix) {
  return (req, res) => {
    const path = rawPathname(req.url);
    if (!path.startsWith(prefix)) return false;
    serveFrom(req, res, dir, path.slice(prefix.length)).catch(() => {
      if (!res.headersSent) sendText(res, 500, 'internal error');
      else res.destroy();
    });
    return true;
  };
}

/** Where the page's files live in a checkout. @param {string} rootDir */
export function publicDir(rootDir) {
  return join(rootDir, 'packages', 'client', 'public');
}
