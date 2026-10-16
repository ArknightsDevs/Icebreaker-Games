// The HTTP server: the pages, their static files, the modules, the pinned kits, the asset directory and a health check.
// The pages: the battle at /play, the lobby and its rooms at /room (docs/spec/room.md), and one of them at / .
import { createServer } from 'node:http';
import { join } from 'node:path';
import { createModuleHandler } from './modules.js';
import { createKitHandler, kitDir } from './kits.js';
import { rawPathname } from './paths.js';
import { allowReadOnly, sendBody, sendText } from './respond.js';
import { createStaticHandler, publicDir, serveFixedFile } from './static.js';
import { readWorkspace } from './workspace.js';

/**
 * @typedef {object} HttpOptions
 * @property {string} rootDir the repository root
 * @property {string} [host] bind address for startHttpServer, default 127.0.0.1 (never 0.0.0.0 unless asked)
 * @property {number} [port] port for startHttpServer (0 picks a free one)
 * @property {string} [assetsDir] the asset directory; default env AUE_ASSETS_DIR, none means /assets/* is 404
 * @property {string[]} [browserPackages] workspace packages the browser runs; default the client
 * @property {string | null} [kitsDir] the pinned kits' commit (engine ADR 0058); default kitDir(rootDir), null: /k/ is 404
 * @property {(req: import('node:http').IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => void} [onUpgrade]
 *   WEBSOCKET_UPGRADE_HOOK: the WebSocket upgrades (the lobby's /lobby, the battles' /battle)
 * @property {'play' | 'room'} [home] the page at / : the battle (default: a server of one match) or the lobby
 */

/** @typedef {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => boolean} Handler */

/** @param {string} rootDir @param {string | undefined} assetsDir @returns {Handler[]} */
function staticHandlers(rootDir, assetsDir) {
  const handlers = [createStaticHandler(join(publicDir(rootDir)), '/static/')];
  if (assetsDir !== undefined && assetsDir !== '') handlers.push(createStaticHandler(assetsDir, '/assets/'));
  return handlers;
}

/**
 * Creates the server without listening.
 * @param {HttpOptions} options
 * @returns {import('node:http').Server}
 */
export function createHttpServer(options) {
  const { rootDir } = options;
  const browserPackages = options.browserPackages ?? ['@icebreaker/client'];
  const modules = createModuleHandler({ workspace: readWorkspace(rootDir, browserPackages), browserPackages });
  const kits = createKitHandler(options.kitsDir === undefined ? kitDir(rootDir) : options.kitsDir);
  const handlers = [modules, kits, ...staticHandlers(rootDir, options.assetsDir ?? process.env['AUE_ASSETS_DIR'])];
  const pages = { '/play': join(publicDir(rootDir), 'index.html'), '/room': join(publicDir(rootDir), 'room.html') };
  const home = pages[`/${options.home ?? 'play'}`];

  const server = createServer((req, res) => {
    const path = rawPathname(req.url);
    const page = path === '/' ? home : Object.hasOwn(pages, path) ? pages[/** @type {keyof typeof pages} */ (path)] : null;
    if (page) {
      serveFixedFile(req, res, page, 'text/html; charset=utf-8').catch(() => sendText(res, 500, 'internal error'));
    } else if (path === '/healthz') {
      if (allowReadOnly(req, res)) sendBody(req, res, { body: Buffer.from('{"ok":true}'), type: 'application/json; charset=utf-8' });
    } else if (!handlers.some((h) => h(req, res))) {
      sendText(res, 404, 'not found');
    }
  });
  if (options.onUpgrade !== undefined) server.on('upgrade', options.onUpgrade); // WEBSOCKET_UPGRADE_HOOK
  return server;
}

/**
 * Creates the server and listens on host:port (default 127.0.0.1).
 * @param {HttpOptions} options
 * @returns {Promise<import('node:http').Server>}
 */
export function startHttpServer(options) {
  const server = createHttpServer(options);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', () => resolve(server));
  });
}
