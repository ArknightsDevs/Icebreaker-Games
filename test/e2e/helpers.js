// Shared pieces of the end-to-end tests: the in-process server with one battle room, the browser, seat pages that
// collect their errors, and polling.
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createMatchRoom, createHttpServer, DEFAULT_MATCH } from '@icebreaker/server';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Two deploys of the default match, each from its seat's deck: a ranged tile for seat 0, a melee tile for seat 1. */
export const DEPLOY = [
  { type: 'deploy', op: 'char_503_rang#0', row: 3, col: 2, dir: 0 },
  { type: 'deploy', op: 'char_123_fang#1', row: 4, col: 5, dir: 2 },
];

/** @typedef {{ frame: number, hash: number, sealed: number, stats: { restamps: number, resyncs: number, errors: number } }} Debug */

/** @param {number} ms */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls `fn` until it returns something other than undefined (errors count as not yet), or throws after the timeout.
 * @template T
 * @param {string} what @param {() => T | undefined | Promise<T | undefined>} fn @param {number} [timeout]
 * @returns {Promise<T>}
 */
export async function until(what, fn, timeout = 15000) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await Promise.resolve().then(fn).catch(() => undefined);
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(50);
  }
}

/** The server with a room of a match (default: the default match), on a free port of 127.0.0.1. @param {Parameters<typeof createMatchRoom>[0]} [match] */
export async function startStack(match = DEFAULT_MATCH) {
  /** @type {string[]} */
  const lines = [];
  const room = await createMatchRoom(match, { log: (l) => lines.push(l) });
  const server = createHttpServer({ rootDir: ROOT, assetsDir: process.env['AUE_ASSETS_DIR'] ?? '', onUpgrade: room.upgrade });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
  const stop = async () => {
    room.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  };
  return { room, port, lines, stop };
}

/** Chromium: E2E_CHROME when set, else Playwright's own. */
export function launch() {
  const executablePath = process.env['E2E_CHROME'];
  return chromium.launch(executablePath ? { executablePath } : {});
}

/** Collects page errors and console errors, except the 404 of the optional assets. @param {import('playwright').Page} page @param {string[]} errors */
function collectErrors(page, errors) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (m.text().includes('Failed to load resource') && m.location().url.includes('/assets/')) return;
    errors.push(`console: ${m.text()}`);
  });
}

/**
 * A seat page in its own context (a fresh session key); `errors` fills as the page misbehaves. It waits until the
 * match's content is ready, or with `started` only until the page has started (a refused seat never gets a match).
 * @param {import('playwright').Browser} browser @param {number} port @param {number} seat @param {{ started?: boolean }} [o]
 */
export async function openSeat(browser, port, seat, o = {}) {
  const context = await browser.newContext(), page = await context.newPage();
  /** @type {string[]} */
  const errors = [];
  collectErrors(page, errors);
  await page.goto(`http://127.0.0.1:${port}/?seat=${seat}`);
  if (o.started) await page.waitForFunction(() => '__battle' in globalThis, null, { timeout: 15000 });
  else await page.waitForFunction(() => /** @type {any} */ (globalThis).__battle?.ready(), null, { timeout: 20000 });
  return { context, page, errors };
}

/** What the page's battle reports. @param {import('playwright').Page} page @returns {Promise<Debug>} */
export const debugOf = (page) => page.evaluate(() => /** @type {any} */ (globalThis).__battle.debug());

/** Sends a command from the page. @param {import('playwright').Page} page @param {object} cmd */
export const command = (page, cmd) => page.evaluate((c) => /** @type {any} */ (globalThis).__battle.command(c), cmd);

/** Waits until the page's frame is past `frame`. @param {import('playwright').Page} page @param {number} frame */
export const pastFrame = (page, frame) => until(`frame > ${frame}`, async () => {
  const d = await debugOf(page);
  return d.frame > frame ? d : undefined;
});

/**
 * Waits until the arbiter's history has the page's frame; returns both hashes.
 * @param {import('playwright').Page} page @param {Awaited<ReturnType<typeof import('@icebreaker/server').createMatchRoom>>} room
 */
export function matchesArbiter(page, room) {
  return until('the arbiter to know the page frame', async () => {
    const d = await debugOf(page), theirs = room.host.hashes.get(d.frame);
    return theirs === undefined ? undefined : { d, theirs };
  });
}
