// What the original battle UI shows, worked out from a frame (the engine's docs/spec/ui.md 界面-10…14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KIND, SKILL_STATE } from '@aue/schema';
import { deckCards, battleSpeed, hudState, menuSkill, ownUnitAt } from '../src/battlehud.js';

/** A view unit. @param {Record<string, number>} v @returns {import('@aue/schema').ViewUnit} */
const unit = (v) => ({ id: 1, kind: KIND.OPERATOR, owner: 0, x: 2, y: 3, z: 0, dir: 0, hp: 10, maxHp: 10, anim: 0, sp: 5, spCost: 20, skill: SKILL_STATE.CHARGING, skillLeft: -1, status: 0, ...v });

test('the deck as cards: avatar, profession, rarity from the roster, elite phase from the build, 再部署时间', () => {
  const match = /** @type {any} */ ({ decks: [[{ id: 'char_122_beagle#0', build: { elite: 2 } }, { id: 'x#0', build: { elite: 0 } }]] });
  const content = { decks: [['char_122_beagle#0', 'x#0']], operators: { 'char_122_beagle#0': { char: 'char_122_beagle', profession: 'TANK', respawnTime: 70 }, 'x#0': {} } };
  const cards = deckCards(match, content, 0, (c) => (c === 'char_122_beagle' ? `/avatar/${c}.png` : null));
  assert.deepEqual(cards[0], { id: 'char_122_beagle#0', avatar: '/avatar/char_122_beagle.png', profession: 'TANK', rarity: 3, phase: 2, respawn: 70 });
  assert.deepEqual(cards[1], { id: 'x#0', avatar: null, profession: '', rarity: 1, phase: 0, respawn: 60 });
  assert.deepEqual(deckCards(match, { operators: {} }, 1, () => null), []);
});

test('the speed: 2× only when every seat has its switch on (同步-7)', () => {
  assert.equal(battleSpeed(null), 1);
  assert.equal(battleSpeed({ fast: [1, 0], held: 0, asker: -1, resuming: 0 }), 1);
  assert.equal(battleSpeed({ fast: [1, 1], held: 0, asker: -1, resuming: 0 }), 2);
  assert.equal(battleSpeed({ fast: [], held: 0, asker: -1, resuming: 0 }), 1);
});

test('the HUD\'s state of a frame: the deck, the cost and its next point, lives, speed, pause; the co-op sides', () => {
  const view = { frame: 90, players: [{ life: 3, cost: 12 }, { life: 2, cost: 4 }], units: [] };
  const ps = (/** @type {number} */ revive) => ({ costTimer: 10, deployed: ['a'], slots: 7, cards: { a: { cost: 9, ready: 0 } }, revive, ask: -1, askCd: 0 });
  const status = /** @type {any} */ ({ players: [ps(-1), ps(45)] });
  const s = hudState({ view, status, control: { fast: [1, 0], held: 1, asker: -1, resuming: 0 }, seat: 0, options: { costIncreaseTime: 1, maxCost: 99 }, selected: 'b' });
  assert.deepEqual({ ...s, coop: undefined }, { frame: 90, fps: 30, cost: 12, cards: { a: { cost: 9, ready: 0 } }, deployed: ['a'], slots: 7, costTimer: 10, costPeriod: 30,
    maxCost: 99, selected: 'b', life: 3, speed: 1, paused: true, coop: undefined });
  assert.deepEqual(s.coop, { me: { life: 3, fast: true, revive: -1 }, mate: { life: 2, fast: false, revive: 1.5 }, speed: 1, paused: true, asking: -1 });
  const alone = hudState({ view: { ...view, players: [view.players[0]] }, status, control: null, seat: 0, options: { costIncreaseTime: 2, maxCost: 10 }, selected: null });
  assert.equal(alone.coop, undefined);
  assert.equal(alone.costPeriod, 60);
});

test('the operator menu\'s skill: icon, charging, ready, running with the time left, stoppable; none without a skill', () => {
  const op = { skill: { id: 'skchr_beagle_1', type: 'MANUAL', duration: 10, stoppable: false } }, icons = { skchr_beagle_1: 'skchr_beagle_1.webp' }, base = 'http://h/skills/';
  assert.deepEqual(menuSkill(unit({}), op, icons, base), { icon: 'http://h/skills/skchr_beagle_1.webp', manual: true, state: 'charging', share: 0.25, stoppable: false });
  assert.equal(menuSkill(unit({ skill: SKILL_STATE.READY }), op, icons, base)?.state, 'ready');
  assert.equal(menuSkill(unit({ skill: SKILL_STATE.READY }), op, icons, base)?.share, 1);
  const run = menuSkill(unit({ skill: SKILL_STATE.RUNNING, skillLeft: 150 }), { skill: { ...op.skill, type: 'AUTO', stoppable: true } }, icons, base);
  assert.deepEqual([run?.state, run?.share, run?.manual, run?.stoppable], ['running', 0.5, false, true]);
  assert.equal(menuSkill(unit({ skill: SKILL_STATE.RUNNING, skillLeft: -1 }), { skill: { ...op.skill, duration: 0 } }, icons, base)?.share, 1, 'no duration: full');
  assert.equal(menuSkill(unit({}), { skill: { ...op.skill, id: 'other' } }, icons, base)?.icon, null, 'no icon in the assets');
  assert.equal(menuSkill(unit({ spCost: 0 }), op, icons, base)?.share, 0);
  assert.equal(menuSkill(unit({ skill: SKILL_STATE.NONE }), op, icons, base), null);
  assert.equal(menuSkill(unit({}), {}, icons, base), null);
});

test('this seat\'s operator on a tile', () => {
  const view = { frame: 0, players: [], units: [unit({ id: 4, x: 2.04, y: 2.98 }), unit({ id: 5, owner: 1, x: 5, y: 5 }), unit({ id: 6, kind: KIND.ENEMY, x: 1, y: 1 })] };
  assert.equal(ownUnitAt(view, 0, { row: 3, col: 2 })?.id, 4);
  assert.equal(ownUnitAt(view, 0, { row: 5, col: 5 }), null, 'the mate\'s');
  assert.equal(ownUnitAt(view, 0, { row: 1, col: 1 }), null, 'an enemy');
});
