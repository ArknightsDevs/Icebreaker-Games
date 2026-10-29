// 阵地足球锦标 (docs/spec/room.md 房间-15) in the browser: the header's 阵地足球锦标 opens the panel; PF-1 is locked until
// PF-TR-1 is cleared; with it cleared, PF-1 with the six special operators starts alone, and the battle page shows the
// stadium and, with the battle UI pack, the event's top bar with both sides and the support unit's marked card;
// PF-TR-1 brings no lineup and its tutorial speaks. Run with `pnpm run e2e`; E2E_SHOTS=<dir> keeps screenshots.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { collectErrors, launch, startLobby, until } from './helpers.js';

const ASSETS = process.env['AUE_ASSETS_DIR'] ?? '', SHOTS = process.env['E2E_SHOTS'];
// the tutorial plays over the drawn field, which needs the assets (as the training's, 房间-11)
const HAS_UI = ASSETS !== '' && existsSync(join(ASSETS, 'skeleton', 'ui', 'battle.json'));

/** @typedef {import('playwright').Page} Page */
/** The tutorial's line now shown, or ''. @param {Page} page */
const line = (page) => page.evaluate(() => { const d = document.querySelector('.tut-dialog'); return d && !(/** @type {HTMLElement} */ (d)).hidden && !(/** @type {HTMLElement} */ (d.parentElement)).hidden ? d.textContent ?? '' : ''; });

describe('阵地足球锦标', () => {
  /** @type {Awaited<ReturnType<typeof startLobby>>} */ let stack;
  /** @type {import('playwright').Browser} */ let browser;
  before(async () => { stack = await startLobby(); browser = await launch(); });
  after(async () => { await browser?.close(); await stack?.stop(); });

  /** A page of the room with the cup's progress set first. @param {object} cup */
  async function roomWith(cup) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addInitScript((c) => { localStorage.setItem('ice.cup', JSON.stringify(c)); }, cup);
    const page = await context.newPage(), errors = /** @type {string[]} */ ([]);
    collectErrors(page, errors);
    await page.goto(`http://127.0.0.1:${stack.port}/`);
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
