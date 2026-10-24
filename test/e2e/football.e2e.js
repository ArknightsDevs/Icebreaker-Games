// 阵地足球 in two browsers with the original battle UI (房间-14, the engine's 足球-1…足球-16, 界面-41 and 渲染-26; runs only
// when AUE_ASSETS_DIR has the battle UI pack): IG-FT-1 and IG-S-4 with the elite-2 decks; no note of abilities missing, the
// football panel on the top bar in place of the status panel, its start banner, the score at 0 : 0 and the match time; an operator put
// behind the ball kicks it toward their goal; the pages stay in step (no desync on the server), without errors. Run
// with `pnpm run e2e`; E2E_SHOTS=<dir> keeps screenshots.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { command, launch, openSeat, sleep, startStack, until } from './helpers.js';
import { STRONG_DECKS } from '../../packages/server/test/bots.js';

const ASSETS = process.env['AUE_ASSETS_DIR'] ?? '', SHOTS = process.env['E2E_SHOTS'];
const HAS_UI = ASSETS !== '' && existsSync(join(ASSETS, 'skeleton', 'ui', 'battle.json'));
/** IG-FT-1 and IG-S-4 (特级赛: elite players, its own level) with the elite-2 decks. */
const MATCHES = /** @type {const} */ ([
  ['IG-FT-1', { level: 'act1multi_football', difficulty: 'NORMAL', seed: 5, decks: STRONG_DECKS }],
  ['IG-S-4', { level: 'act1multi_football_hard-01', difficulty: 'NORMAL', seed: 5, decks: STRONG_DECKS }],
]);

for (const [code, MATCH] of MATCHES) describe(`阵地足球 ${code} in the browser`, { skip: HAS_UI ? false : 'no battle UI pack in AUE_ASSETS_DIR' }, () => {
  /** @type {Awaited<ReturnType<typeof startStack>>} */ let stack;
  /** @type {import('playwright').Browser} */ let browser;
  /** @type {Awaited<ReturnType<typeof openSeat>>[]} */ const seats = [];

  before(async () => { stack = await startStack(MATCH); browser = await launch(); });
  after(async () => {
    await Promise.all(seats.map((s) => s.context.close().catch(() => {})));
    await browser?.close();
    await stack?.stop();
  });

  /** A UI node of a page by its name. @param {import('playwright').Page} page @param {string} name */
  const node = (page, name) => page.locator(`.aue-n[data-name="${name}"]`).first();

  test('the football panel with the score and the time; an operator behind the ball kicks it', { timeout: 300000 }, async () => {
    seats.push(await openSeat(browser, stack.port, 0), await openSeat(browser, stack.port, 1));
    const [a] = seats, host = /** @type {any} */ (stack.room.host);
    // every ability of both is read now: no note that some are not
    assert.equal(await a.page.locator('#testing').isVisible(), false, 'no note of abilities missing');
    await until('the football panel', async () => ((await node(a.page, 'panel_cooperate_football_status').isVisible()) ? true : undefined), 20000);
    // the match's own start banner as it begins (the engine's 界面-41)
    await until('the football start banner', async () => ((await node(a.page, 'container_soccer_mode').isVisible()) ? true : undefined), 10000);
    if (SHOTS) { await sleep(1200); await a.page.screenshot({ path: `${SHOTS}/football-${code}-banner.png` }); }
    assert.equal((await node(a.page, 'text_score_ally').innerText()).trim(), '0');
    assert.equal((await node(a.page, 'text_score_enemy').innerText()).trim(), '0');
    assert.match((await node(a.page, 'text_footbal_timer').innerText()).trim(), /^0[45]:\d\d$/);
    await until('the ball on the field', () => (host.world.units.some((/** @type {any} */ u) => u.ball && !u.hidden) ? true : undefined), 20000);
    if (SHOTS) await a.page.screenshot({ path: `${SHOTS}/football-${code}-kickoff.png` });
    // 煌 (a guard: the tile in front is in her range)
    const ball = host.world.units.find((/** @type {any} */ u) => u.ball && !u.hidden), op = 'char_017_huang#0';
    await command(a.page, { type: 'deploy', op, row: Math.round(ball.y), col: Math.round(ball.x) - 1, dir: 0 });
    await until('the ball kicked', () => (ball.slide || ball.x > Math.round(ball.x) + 0.5 ? true : undefined), 30000);
    await sleep(600);
    if (SHOTS) await a.page.screenshot({ path: `${SHOTS}/football-${code}-kick.png` });
    // IG-S-4's players are the drawn team's elite ones, never the standard team's (its 阵地队 is not drawn there)
    if (code === 'IG-S-4') {
      const keys = host.world.units.filter((/** @type {any} */ u) => /_mu(mssi|bufn|gnfu|sht|hry|kfu)/.test(u.key)).map((/** @type {any} */ u) => u.key);
      assert.ok(keys.every((/** @type {string} */ k) => k.endsWith('_2') && !/_mu(mssi|bufn|gnfu)/.test(k)), keys.join());
    }
    // the seats report their hashes as they go (同步-5): a page out of step would be a desync on the server
    assert.deepEqual(stack.lines.filter((l) => l.startsWith('desync')), []);
    for (const s of seats) assert.deepEqual(s.errors, [], 'no page errors');
  });
});
