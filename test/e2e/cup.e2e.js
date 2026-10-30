// 阵地足球锦标 (docs/spec/room.md 房间-15) in the browser: on the page's own room (?html) the header's 阵地足球锦标 opens
// the panel; PF-1 is locked until PF-TR-1 is cleared; with it cleared, PF-1 with the six special operators starts
// alone, and the battle page shows the stadium and, with the battle UI pack, the event's top bar with both sides and
// the support unit's marked card; PF-TR-1 brings no lineup and its tutorial speaks. With the cup UI pack (页面-11) the
// event's own pages: the entry page, the qualifier's map, PF-1's detail, the squad page with two operators chosen on
// the select page, the start; a stage's result on the event's view, then its zone's map. Run with `pnpm run e2e`;
// E2E_SHOTS=<dir> keeps screenshots.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { collectErrors, launch, startLobby, until } from './helpers.js';

const ASSETS = process.env['AUE_ASSETS_DIR'] ?? '', SHOTS = process.env['E2E_SHOTS'];
// the tutorial plays over the drawn field, which needs the assets (as the training's, 房间-11)
const HAS_UI = ASSETS !== '' && existsSync(join(ASSETS, 'skeleton', 'ui', 'battle.json'));
// the event's own pages need the lobby UI pack and the cup's (页面-11)
const HAS_CUP_UI = ASSETS !== '' && existsSync(join(ASSETS, 'skeleton', 'ui', 'lobby.json')) && existsSync(join(ASSETS, 'skeleton', 'ui', 'cup.json'));

/** @typedef {import('playwright').Page} Page */
/** The tutorial's line now shown, or ''. @param {Page} page */
const line = (page) => page.evaluate(() => { const d = document.querySelector('.tut-dialog'); return d && !(/** @type {HTMLElement} */ (d)).hidden && !(/** @type {HTMLElement} */ (d.parentElement)).hidden ? d.textContent ?? '' : ''; });

describe('阵地足球锦标', () => {
  /** @type {Awaited<ReturnType<typeof startLobby>>} */ let stack;
  /** @type {import('playwright').Browser} */ let browser;
  before(async () => { stack = await startLobby(); browser = await launch(); });
  after(async () => { await browser?.close(); await stack?.stop(); });

  /** A page of the room — its own HTML room (?html) — with the cup's progress set first, its panel open. @param {object} cup */
  async function roomWith(cup) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript((c) => { localStorage.setItem('ice.cup', JSON.stringify(c)); }, cup);
    const page = await context.newPage(), errors = /** @type {string[]} */ ([]);
    collectErrors(page, errors);
    await page.goto(`http://127.0.0.1:${stack.port}/?html`);
    await page.locator('#conn', { hasText: '已连接' }).waitFor();
    await page.locator('#cupbtn').click();
    await page.locator('#cup').waitFor({ state: 'visible' });
    return { page, errors };
  }

  test('[房间-15] the panel: PF-1 locked until PF-TR-1 is cleared; then PF-1 with the special operators starts alone, its stadium shown', { timeout: 240000 }, async () => {
    const fresh = await roomWith({ v: 1, cleared: [], picks: [], relic: '' });
    await fresh.page.locator('#cup [data-stage="act1football_01"]').click();
    assert.equal(await fresh.page.locator('#cup .cup-stage .bad', { hasText: '完成 PF-TR-1 后开放' }).count(), 1);
    assert.equal(await fresh.page.locator('#cup button', { hasText: '开始比赛' }).isDisabled(), true);
    assert.equal(await fresh.page.locator('#cup [data-relic]').count(), 2, 'the two training effects');
    assert.equal(await fresh.page.locator('#cup [data-relic]:disabled').count(), 2, 'both locked');
    await fresh.page.context().close();

    const { page, errors } = await roomWith({ v: 1, cleared: ['act1football_tr01', 'act1football_s01'], picks: [], relic: '' });
    await page.locator('#cup [data-stage="act1football_01"]').click();
    for (const b of await page.locator('#cup [data-npc]').all()) await b.click();
    assert.equal(await page.locator('#cup .lineup tr').count(), 6, 'the six special operators in the lineup');
    await page.locator('#cup [data-relic="act1football_relic_01"]').click();
    assert.equal(await page.locator('#cup [data-relic="act1football_relic_01"][aria-pressed="true"]').count(), 1, '体能充沛 chosen');
    // a support unit from every operator, fully trained
    await page.locator('#cup select[aria-label="助战干员"]').selectOption('char_017_huang');
    await page.locator('#cup button', { hasText: '选为助战' }).click();
    await page.locator('#cup .assist tr[data-id="char_017_huang"]', { hasText: '精2 90级' }).waitFor({ timeout: 15000 });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cup-panel.png` });
    await page.locator('#cup button', { hasText: '开始比赛' }).click();
    await page.waitForURL(/\/play\?match=[0-9a-f]+&seat=0/, { timeout: 15000 });
    await until('the battle page', () => page.evaluate(() => (/** @type {any} */ (globalThis).__battle?.ready() ? true : undefined)), 90000);
    await until('the stadium shown', async () => ((await page.locator('#cupinfo').innerText().catch(() => '')).includes('常规球场') ? true : undefined), 20000);
    // the event's own top bar (the engine's 界面-42), drawn from the battle UI pack
    if (HAS_UI) await until('the sides on the top bar', async () => ((await page.locator('.aue-n[data-name="text_team_name"]').allInnerTexts()).join('|') === '罗德岛队|业余组' ? true : undefined), 20000);
    // the support unit's card, last of the operators, with the assist mark
    if (HAS_UI) await until('one card marked assist', async () => ((await page.locator('.aue-n[data-name="icon_assist_char"]:visible').count()) === 1 ? true : undefined), 20000);
    assert.equal(await page.locator('#testing').isVisible(), false, 'every ability of PF-1 is read');
    if (SHOTS) { await page.waitForTimeout(3000); await page.screenshot({ path: `${SHOTS}/cup-pf1.png` }); }
    assert.deepEqual(errors, []);
  });

  test('[房间-15] PF-TR-1 brings no lineup; its tutorial speaks', { skip: HAS_UI ? false : 'no battle UI pack in AUE_ASSETS_DIR', timeout: 240000 }, async () => {
    const { page, errors } = await roomWith({ v: 1, cleared: [], picks: [], relic: '' });
    await page.locator('#cup [data-stage="act1football_tr01"]').click();
    assert.equal(await page.locator('#cup .lineup').count(), 0, 'no lineup to choose');
    await page.locator('#cup button', { hasText: '开始比赛' }).click();
    await page.waitForURL(/\/play\?match=[0-9a-f]+&seat=0/, { timeout: 15000 });
    await until('the battle page', () => page.evaluate(() => (/** @type {any} */ (globalThis).__battle?.ready() ? true : undefined)), 90000);
    await until('the first line', async () => ((await line(page)).includes('阵地足球锦标') ? true : undefined), 40000);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cup-tr1.png` });
    assert.deepEqual(errors, []);
  });
});

/**
 * A page of the room on the lobby screens with the cup's progress and session entries set first (once).
 * @param {import('playwright').Browser} browser @param {number} port @param {object} cup @param {Record<string, string>} [session]
 */
async function lobbyWith(browser, port, cup, session = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(([c, s]) => {
    if (sessionStorage.getItem('e2e.set')) return;
    sessionStorage.setItem('e2e.set', '1');
    localStorage.setItem('ice.cup', JSON.stringify(c));
    for (const [k, v] of Object.entries(/** @type {Record<string, string>} */ (s))) sessionStorage.setItem(k, v);
  }, [cup, session]);
  const page = await context.newPage(), errors = /** @type {string[]} */ ([]);
  collectErrors(page, errors);
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.locator('#conn', { hasText: '已连接' }).waitFor();
  return { page, errors };
}

/** The cup's pages as the lobby shows them. @param {Page} page */
const cupOf = (page) => page.evaluate(() => /** @type {any} */ (globalThis).__room.lobby()?.cup ?? null);
/** A shown node named `name` under one named `parent`. @param {Page} page @param {string} parent @param {string} name */
const hot = (page, parent, name) => page.locator(`#lobby .aue-n[data-name="${parent}"] .aue-n[data-name="${name}"]:visible`).first();

describe('阵地足球锦标的原版界面', { skip: HAS_CUP_UI ? false : 'no lobby and cup UI packs in AUE_ASSETS_DIR' }, () => {
  /** @type {Awaited<ReturnType<typeof startLobby>>} */ let stack;
  /** @type {import('playwright').Browser} */ let browser;
  before(async () => { stack = await startLobby(); browser = await launch(); });
  after(async () => { await browser?.close(); await stack?.stop(); });

  test('[页面-11] the event’s own pages: entry, the qualifier’s map, PF-1’s detail, the squad page, two operators chosen, the start', { timeout: 240000 }, async () => {
    const { page, errors } = await lobbyWith(browser, stack.port, { v: 1, cleared: ['act1football_tr01', 'act1football_s01'], picks: [], relic: 'act1football_relic_01' });
    await until('the lobby screens', async () => ((await page.evaluate(() => /** @type {any} */ (globalThis).__room.lobby()))?.page === 'entry' ? true : undefined), 60000);
    await page.locator('#cupbtn').click();
    await until('the entry page', async () => ((await cupOf(page))?.page === 'entry' ? true : undefined), 30000);
    // 淘汰赛 is locked with what opens it; 晋级赛 opens its map
    assert.equal(await page.locator('#lobby .aue-n[data-name="panel_zone_2"] .aue-n[data-name="panel_locked"]:visible').count(), 1);
    await hot(page, 'panel_zone_1', 'hot_spot').click();
    await until('the qualifier’s map', async () => { const c = await cupOf(page); return c?.page === 'map' && c.map.zone === 0 && c.map.chosen === null ? true : undefined; });
    await hot(page, 'act1football_01', 'hot_spot').click();
    await until('PF-1 chosen', async () => ((await cupOf(page))?.map.chosen === 'act1football_01' ? true : undefined));
    assert.equal(await page.locator('#lobby .aue-n[data-name="text_team_enermy"]:visible').innerText(), '业余组');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cup-map.png` });
    await hot(page, 'btn_start', 'hotspot').click();
    await until('the squad page', async () => ((await cupOf(page))?.page === 'squad' ? true : undefined));
    await hot(page, 'btn_mutli_format', 'panel_hotspot').click();
    const cards = page.locator('#lobby .aue-n[data-name="panel_char_card"]:visible');
    await cards.first().waitFor({ timeout: 15000 });
    for (const k of [0, 1]) { await cards.nth(k).click(); await page.waitForTimeout(200); }
    await hot(page, 'btn_confirm', 'panel_hotspot').click();
    const squad = await until('two operators in the lineup', async () => { const c = await cupOf(page); return c?.squad?.picks.length === 2 && !c.squad.select ? c.squad : undefined; }, 30000);
    assert.ok(squad.picks.every((/** @type {any} */ p) => p.skill >= 0), 'each takes a skill');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cup-squad.png` });
    await hot(page, 'start_image', 'hotspot_startbtn').click();
    await page.waitForURL(/\/play\?match=[0-9a-f]+&seat=0/, { timeout: 30000 });
    await until('the battle page', () => page.evaluate(() => (/** @type {any} */ (globalThis).__battle?.ready() ? true : undefined)), 90000);
    if (HAS_UI) await until('the sides on the top bar', async () => ((await page.locator('.aue-n[data-name="text_team_name"]').allInnerTexts()).join('|') === '罗德岛队|业余组' ? true : undefined), 20000);
    assert.deepEqual(errors, []);
  });

  test('[页面-11] a stage’s result on the event’s view, then its zone’s map', { timeout: 120000 }, async () => {
    const result = { match: 'm1', result: 1, level: 'act1football_02', difficulty: 'NORMAL', stamps: [3], cup: { score: [5, 2], gained: 100, points: 200, best: true }, at: Date.now() };
    const { page, errors } = await lobbyWith(browser, stack.port, { v: 1, cleared: ['act1football_tr01', 'act1football_01', 'act1football_02'], picks: [], relic: '', points: 200, best: { act1football_02: [5, 2] } },
      { 'ice.match': JSON.stringify({ match: 'm1', seat: 0, cup: 'act1football_02' }), 'ice.result': JSON.stringify(result) });
    await until('the result', async () => ((await page.evaluate(() => /** @type {any} */ (globalThis).__room.lobby()))?.page === 'finish' ? true : undefined), 60000);
    await page.locator('#lobby .aue-n[data-name="group_victory"]:visible').first().waitFor({ timeout: 15000 });
    assert.equal(await page.locator('#lobby .aue-n[data-name="text_score_minus"]:visible').first().innerText(), '+3');
    assert.equal(await page.locator('#lobby .aue-n[data-name="text_reward"]:visible').first().innerText(), '+100');
    if (SHOTS) { await page.waitForTimeout(3500); await page.screenshot({ path: `${SHOTS}/cup-result.png` }); }
    await page.locator('#lobby .aue-n[data-name="click_area"]:visible').first().click();
    await until('the qualifier’s map', async () => { const c = await cupOf(page); return c?.page === 'map' && c.map.zone === 0 ? true : undefined; }, 15000);
    assert.deepEqual(errors, []);
  });
});
