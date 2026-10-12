// End to end in a real browser with the original battle UI (the engine's 界面-10…14; runs only when AUE_ASSETS_DIR has
// the battle UI pack): a card dragged onto a tile opens the direction selector, a drag north deploys the operator
// facing up through the server; a tap on it opens its menu and the retreat button takes it off the field. Run with
// `pnpm run e2e`.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { launch, openSeat, sleep, startStack, until } from './helpers.js';

const ASSETS = process.env['AUE_ASSETS_DIR'] ?? '';
const HAS_UI = ASSETS !== '' && existsSync(join(ASSETS, 'skeleton', 'ui', 'battle.json'));

describe('the original battle UI in the browser', { skip: HAS_UI ? false : 'no battle UI pack in AUE_ASSETS_DIR' }, () => {
  /** @type {Awaited<ReturnType<typeof startStack>>} */ let stack;
  /** @type {import('playwright').Browser} */ let browser;
  /** @type {Awaited<ReturnType<typeof openSeat>> | undefined} */ let seat;

  before(async () => { stack = await startStack(); browser = await launch(); });
  after(async () => {
    await seat?.context.close().catch(() => {});
    await browser?.close();
    await stack?.stop();
  });

  test('drag a card, point north, deploy; tap the operator, retreat it', { timeout: 120000 }, async () => {
    seat = await openSeat(browser, stack.port, 0);
    const { page } = seat;
    assert.equal(await page.evaluate(() => /** @type {any} */ (globalThis).__battle.ui()), 'original');
    const c = /** @type {any} */ (stack.room.host.o.content), deck = /** @type {string[]} */ (c.decks[0]);
    const op = deck.slice().sort((a, b) => c.operators[a].cost - c.operators[b].cost)[0], d = c.operators[op];
    const want = d.position === 'MELEE' ? ['MELEE', 'ALL'] : ['RANGED', 'ALL'];
    /** @type {{ row: number, col: number, h: number } | null} */
    let tile = null;
    c.level.tiles.forEach((/** @type {any[]} */ cells, /** @type {number} */ row) => cells.forEach((t, col) => {
      if (!tile && want.includes(t.buildable) && row >= 3 && row <= 4) tile = { row, col, h: t.height === 'HIGHLAND' ? 1 : 0 };
    }));
    assert.ok(tile, 'a tile the operator fits');
    const t = /** @type {{ row: number, col: number, h: number }} */ (tile);
    await until('cost for it', () => (stack.room.host.world.players[0].cost > d.cost ? true : undefined), 40000);
    /** @param {number} col @param {number} row */
    const pageOf = (col, row) => page.evaluate(([x, y, h]) => /** @type {number[]} */ (/** @type {any} */ (globalThis).__battle.pageOf(x, y, h)), [col, row, t.h]);

    // the cards in the deck's order: the operator's is its index among them
    const cards = page.locator('.aue-n[data-name="card_character"] .aue-n[data-name="image_underframe"]');
    await until('the cards', async () => ((await cards.count()) === deck.length ? true : undefined));
    const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await cards.nth(deck.indexOf(op)).boundingBox());
    const at = await pageOf(t.col, t.row);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(at[0], at[1], { steps: 8 });
    await sleep(300);
    await page.mouse.up();
    // the battle screen holds a hidden copy of the perspective canvas: the menus are the last ones
    const selector = page.locator('.aue-n[data-name="panel_direction_selector"]').last();
    await until('the direction selector', async () => ((await selector.isVisible()) ? true : undefined));

    const north = await pageOf(t.col, t.row + 1.5);
    await page.mouse.move(at[0], at[1]);
    await page.mouse.down();
    await page.mouse.move(north[0], north[1], { steps: 6 });
    await sleep(200);
    await page.mouse.up();
    await until('deployed facing up', () => (stack.room.host.world.units.find((u) => u.key === op)?.dir === 'UP' ? true : undefined), 10000);
    await until('the selector gone', async () => ((await selector.isVisible()) ? undefined : true));

    // its menu, then retreat
    await sleep(1000);
    const u = /** @type {any} */ (stack.room.host.world.units.find((x) => x.key === op));
    const feet = await pageOf(u.x, u.y);
    await page.mouse.click(feet[0], feet[1] - 10);
    const withdraw = page.locator('.aue-n[data-name="btn_withdraw"]').last();
    await until('the operator menu', async () => ((await withdraw.isVisible()) ? true : undefined));
    await withdraw.click();
    await until('retreated', () => (stack.room.host.world.units.some((x) => x.key === op) ? undefined : true), 10000);
    assert.deepEqual(seat.errors, []);
  });
});
