// 训练场 (docs/spec/room.md 房间-11): on the lobby screens the room panel's 训练场 opens the training room page; a tap on
// the chosen mode starts IG-TR-1 alone, and on the battle page its first tutorials play — the battle paused, Amiya's
// lines, a tap going on, the part a line is about lit.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { collectErrors, launch, startLobby, until } from './helpers.js';

const ASSETS = process.env['AUE_ASSETS_DIR'] ?? '';
const HAS_LOBBY = ASSETS !== '' && existsSync(join(ASSETS, 'skeleton', 'ui', 'lobby.json'));

/** @typedef {import('playwright').Page} Page */
/** @param {Page} page */
const lobby = (page) => page.evaluate(() => /** @type {any} */ (globalThis).__room?.lobby());
/** A shown node named `name` under one named `parent`. @param {Page} page @param {string} parent @param {string} [name] */
const hot = (page, parent, name = 'hotspot') => page.locator(`#lobby .aue-n[data-name="${parent}"] .aue-n[data-name="${name}"]:visible`).first();
/** The tutorial's line now shown, or ''. @param {Page} page */
const line = (page) => page.evaluate(() => { const d = document.querySelector('.tut-dialog'); return d && !(/** @type {HTMLElement} */ (d)).hidden && !(/** @type {HTMLElement} */ (d.parentElement)).hidden ? d.textContent ?? '' : ''; });

describe('训练场', () => {
  /** @type {Awaited<ReturnType<typeof startLobby>>} */ let stack;
  /** @type {import('playwright').Browser} */ let browser;
  before(async () => { stack = await startLobby(); browser = await launch(); });
  after(async () => { await browser?.close(); await stack?.stop(); });

  test('[房间-11] the training room page, IG-TR-1 alone, its first tutorials on the battle page', { skip: HAS_LOBBY ? false : 'no lobby UI pack in AUE_ASSETS_DIR' }, async () => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage(), errors = /** @type {string[]} */ ([]);
    collectErrors(page, errors);
    await page.goto(`http://127.0.0.1:${stack.port}/`);
    await page.locator('#conn', { hasText: '已连接' }).waitFor();
    await until('the entry page', async () => ((await lobby(page))?.page === 'entry' ? true : undefined), 30000);
    await hot(page, 'btn_team_up').click();
    await hot(page, 'btn_train').click();
    await until('the training room page', async () => ((await lobby(page))?.page === 'train' ? true : undefined), 10000);
    assert.equal(await page.locator('#lobby .aue-n[data-name="mode_item"]:visible').count(), 3, 'the three training modes');
    assert.equal(await page.locator('#lobby .aue-n[data-name="text_code"]:visible', { hasText: 'IG-TR-1' }).count(), 1, 'the chosen mode\'s level in its detail');
    await hot(page, 'nomal').click();
    await page.waitForURL(/\/play\?match=[0-9a-f]+&seat=0/, { timeout: 15000 });
    await until('the battle page', () => page.evaluate(() => (/** @type {any} */ (globalThis).__battle?.ready() ? true : undefined)), 60000);
    // 6 seconds in: the first story, Amiya's welcome, the battle held
    const first = await until('the first line', async () => ((await line(page)).includes('欢迎再次来到促融共竞') ? true : undefined), 30000);
    assert.equal(first, true);
    await page.waitForTimeout(600);
    await page.mouse.click(640, 360);
    await until('the second line', async () => ((await line(page)).includes('一位协作者') ? true : undefined), 5000);
    await page.waitForTimeout(600);
    await page.mouse.click(640, 360);
    // the second story's second line lights the co-op top bar's stage panel
    await until('the second story', async () => ((await line(page)).includes('每场比赛分为两个阶段') ? true : undefined), 20000);
    await page.waitForTimeout(600);
    await page.mouse.click(640, 360);
    await until('its lit part', async () => ((await line(page)).includes('生存') && (await page.locator('.tut-hole:visible').count()) === 1 ? true : undefined), 5000);
    assert.deepEqual(errors, []);
  });

  test('[房间-11] 阵地足球\'s IG-TR-2: its tutorials through the three waves, the caught ball put down by a drag', { skip: HAS_LOBBY ? false : 'no lobby UI pack in AUE_ASSETS_DIR', timeout: 300000 }, async () => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage(), errors = /** @type {string[]} */ ([]);
    collectErrors(page, errors);
    await page.goto(`http://127.0.0.1:${stack.port}/`);
    await page.locator('#conn', { hasText: '已连接' }).waitFor();
    await until('the entry page', async () => ((await lobby(page))?.page === 'entry' ? true : undefined), 30000);
    await hot(page, 'btn_team_up').click();
    await hot(page, 'btn_train').click();
    await until('the training room page', async () => ((await lobby(page))?.page === 'train' ? true : undefined), 10000);
    // 阵地足球, the second mode: a tap chooses it, its level in the detail; another starts it
    const football = page.locator('#lobby .aue-n[data-name="mode_item"]:visible').nth(1).locator('.aue-n[data-name="hotspot"]').first();
    await football.click();
    await until('IG-TR-2 in the detail', async () => ((await page.locator('#lobby .aue-n[data-name="text_code"]:visible', { hasText: 'IG-TR-2' }).count()) === 1 ? true : undefined), 5000);
    await football.click();
    await page.waitForURL(/\/play\?match=[0-9a-f]+&seat=0/, { timeout: 15000 });
    await until('the battle page', () => page.evaluate(() => (/** @type {any} */ (globalThis).__battle?.ready() ? true : undefined)), 60000);
    const seen = await tutorialRun(page);
    for (const words of ['阵地足球的赛场', '累计造成一定伤害', '红色目标点就是', '守门位', '进入待部署区', '重新开球', '攻击敌方球员', '破坏阵地屏障']) {
      assert.ok(seen.lines.some((l) => l.includes(words)), `a line with ${words}: ${seen.lines.join(' | ')}`);
    }
    assert.equal(seen.dragged, true, 'the caught ball put down');
    // the third wave comes with a goal in the second, which the field does not always give (the forward may put the
    // ball out of everyone's reach): when it has come, its story told, the fixed lineup is in the hand
    if (seen.lines.some((l) => l.includes('剩下的时间'))) assert.ok(seen.cards >= 6, `the lineup shown: ${seen.cards} cards`);
    assert.deepEqual(errors, []);
  });
});

/** The hand's cards shown. @param {Page} page */
const handCards = (page) => page.locator('.aue-n[data-name="image_underframe"]:visible').count();
/** Whether the battle has ended (its notice). @param {Page} page */
const over = async (page) => (await page.locator('#notice', { hasText: '比赛结束' }).count()) > 0;

/**
 * Plays a training's tutorials as a player does: a tap on each line after its protect time; for a drag, the first
 * card of the hand dragged to the tile (5, 6) — its row and column — and turned up should it ask; between the lines, a
 * caught ball (阵地足球's second wave: the only card shown) put down there again. Until the last story's last line, or
 * the battle's end. What it saw: the lines, the drag, how many cards the hand showed at the end.
 * @param {Page} page
 */
async function tutorialRun(page) {
  const seen = { lines: /** @type {string[]} */ ([]), dragged: false, cards: 0 };
  const end = Date.now() + 240000;
  while (Date.now() < end && !(await over(page))) {
    const text = await line(page);
    if (!text) {
      if (seen.dragged && (await handCards(page)) === 1) await dragCard(page, 6, 5);
      await page.waitForTimeout(250);
      continue;
    }
    if (seen.lines.at(-1) !== text) seen.lines.push(text);
    if (await page.locator('.tut-hand:visible').count()) { await dragCard(page, 6, 5); seen.dragged = true; await page.waitForTimeout(800); continue; }
    await page.waitForTimeout(700);
    await page.mouse.click(640, 360);
    await page.waitForTimeout(300);
    if (text.includes('设法攻破敌方的球门')) { await page.waitForTimeout(1500); seen.cards = await handCards(page); break; }
  }
  return seen;
}

/**
 * The hand's first card dragged onto a tile of ground; turned up when it asks for a direction. Nothing when the card has
 * gone meanwhile: a story's line can hide the hand right after it was counted, and that line waits for a tap.
 * @param {Page} page @param {number} col @param {number} row
 */
async function dragCard(page, col, row) {
  const pageOf = (/** @type {number} */ x, /** @type {number} */ y) => page.evaluate(([a, b]) => /** @type {number[]} */ (/** @type {any} */ (globalThis).__battle.pageOf(a, b, 0)), [x, y]);
  const card = page.locator('.aue-n[data-name="image_underframe"]:visible').first();
  const box = await card.boundingBox({ timeout: 2000 }).catch(() => null);
  if (!box) return;
  const at = await pageOf(col, row);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(at[0], at[1], { steps: 8 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(500);
  const selector = page.locator('.aue-n[data-name="panel_direction_selector"]').last();
  if (!(await selector.isVisible())) return;
  const north = await pageOf(col, row + 1.5);
  await page.mouse.move(at[0], at[1]);
  await page.mouse.down();
  await page.mouse.move(north[0], north[1], { steps: 6 });
  await page.waitForTimeout(200);
  await page.mouse.up();
}
