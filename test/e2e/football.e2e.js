// 阵地足球 in two browsers with the original battle UI (房间-14, the engine's 足球-1…足球-16, 界面-41 and 渲染-26; runs only
// when AUE_ASSETS_DIR has the battle UI pack): IG-FT-1 with the elite-2 decks; no note of abilities missing, the
// football panel on the top bar in place of the status panel, the score at 0 : 0 and the match time; an operator put
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
/** IG-FT-1 with the elite-2 decks. */
const MATCH = { level: 'act1multi_football', difficulty: /** @type {const} */ ('NORMAL'), seed: 5, decks: STRONG_DECKS };

describe('阵地足球 in the browser', { skip: HAS_UI ? false : 'no battle UI pack in AUE_ASSETS_DIR' }, () => {
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
    // every ability of IG-FT-1 is read now: no note that some are not (IG-FT-2 still has one)
    assert.equal(await a.page.locator('#testing').isVisible(), false, 'no note of abilities missing');
    await until('the football panel', async () => ((await node(a.page, 'panel_cooperate_football_status').isVisible()) ? true : undefined), 20000);
    assert.equal((await node(a.page, 'text_score_ally').innerText()).trim(), '0');
    assert.equal((await node(a.page, 'text_score_enemy').innerText()).trim(), '0');
    assert.match((await node(a.page, 'text_footbal_timer').innerText()).trim(), /^0[45]:\d\d$/);
    await until('the ball on the field', () => (host.world.units.some((/** @type {any} */ u) => u.ball && !u.hidden) ? true : undefined), 20000);
    if (SHOTS) await a.page.screenshot({ path: `${SHOTS}/football-kickoff.png` });
    // 煌 (a guard: the tile in front is in her range)
    const ball = host.world.units.find((/** @type {any} */ u) => u.ball && !u.hidden), op = 'char_017_huang#0';
    await command(a.page, { type: 'deploy', op, row: Math.round(ball.y), col: Math.round(ball.x) - 1, dir: 0 });
    await until('the ball kicked', () => (ball.slide || ball.x > Math.round(ball.x) + 0.5 ? true : undefined), 30000);
    await sleep(600);
    if (SHOTS) await a.page.screenshot({ path: `${SHOTS}/football-kick.png` });
    // the seats report their hashes as they go (同步-5): a page out of step would be a desync on the server
    assert.deepEqual(stack.lines.filter((l) => l.startsWith('desync')), []);
    for (const s of seats) assert.deepEqual(s.errors, [], 'no page errors');
  });
});
