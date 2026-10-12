// The original battle UI (the engine's docs/spec/ui.md 界面-10…14, ADR 0021): when the assets have the battle UI pack,
// @aue/ui draws it over the field — the deploy cards, the cost, the top bar (the co-op one in a match of two), the
// direction selector and the operator menu. What it shows is worked out here from each frame's view, the match status
// and the server's control state.
import { secondsToFrames } from '@aue/math';
import { ROSTER } from '@aue/content';
import { KIND, SKILL_STATE } from '@aue/schema';

const FPS = 30;

/** @typedef {{ fast: number[], held: number, asker: number, resuming: number }} Control */
/** @typedef {import('@aue/worker').Status} Status */

/**
 * The battle UI pack and the skill icons of the assets (ui/battle.json, ui/skills/index.json), or null without them.
 * @param {URL} assets the assets' base URL
 */
export async function loadUiPack(assets) {
  const res = await fetch(new URL('ui/battle.json', assets)).catch(() => null);
  if (!res?.ok) return null;
  const icons = await fetch(new URL('ui/skills/index.json', assets)).then((r) => (r.ok ? r.json() : null), () => null);
  return { pack: await res.json(), icons: /** @type {Record<string, string>} */ (icons?.icons ?? {}) };
}

/**
 * The seat's deck as cards: avatar, profession, rarity, elite phase and 再部署时间 of each operator.
 * @param {import('@aue/schema').Match} match @param {any} content @param {number} seat @param {(char: string) => string | null} avatar
 * @returns {import('@aue/ui').DeckCard[]}
 */
export function deckCards(match, content, seat, avatar) {
  const builds = new Map((match.decks?.[seat] ?? []).map((d) => [d.id, d.build]));
  return (content.decks?.[seat] ?? []).map((/** @type {string} */ k) => {
    const op = content.operators[k], char = op.char ?? k, r = ROSTER[char];
    return { id: k, avatar: avatar(char), profession: op.profession ?? r?.profession ?? '', rarity: r?.rarity ?? 1, phase: builds.get(k)?.elite ?? 0, respawn: op.respawnTime ?? 60 };
  });
}

/** The speed the battle runs at (同步-7): 2× only when every seat has its switch on. @param {Control | null} c */
export const battleSpeed = (c) => (c && c.fast.length > 0 && c.fast.every((f) => f === 1) ? 2 : 1);

/**
 * What the HUD shows of a frame.
 * @param {{ view: import('@aue/schema').View, status: Status, control: Control | null, seat: number, options: any, selected: string | null }} o
 * @returns {import('@aue/ui').HudState}
 */
export function hudState(o) {
  const { view, status, control, seat } = o, p = view.players[seat], ps = status.players[seat], speed = battleSpeed(control), paused = !!control?.held;
  return {
    frame: view.frame, fps: FPS, cost: p.cost, cards: ps.cards, deployed: ps.deployed, slots: ps.slots,
    costTimer: ps.costTimer, costPeriod: secondsToFrames(o.options.costIncreaseTime), maxCost: o.options.maxCost, selected: o.selected,
    life: p.life, speed, paused, coop: view.players.length === 2 ? coopState(o, speed, paused) : undefined,
  };
}

/** @param {{ view: import('@aue/schema').View, status: Status, control: Control | null, seat: number }} o @param {number} speed @param {boolean} paused */
function coopState(o, speed, paused) {
  const side = (/** @type {number} */ i) => ({ life: o.view.players[i].life, fast: o.control?.fast[i] === 1, revive: o.status.players[i].revive >= 0 ? o.status.players[i].revive / FPS : -1 });
  return { me: side(o.seat), mate: side(1 - o.seat), speed, paused, asking: -1 };
}

/**
 * The operator menu's skill of a unit: its icon, how it starts, its state and share (SP gathered, or time left of its
 * run), whether it may be stopped; null without a skill.
 * @param {import('@aue/schema').ViewUnit} u @param {any} op the operator's content @param {Record<string, string>} icons @param {string} base the icons' URL
 * @returns {import('@aue/ui').MenuSkill | null}
 */
export function menuSkill(u, op, icons, base) {
  const sk = op?.skill;
  if (!sk || u.skill === SKILL_STATE.NONE) return null;
  const icon = icons[sk.id] ? new URL(icons[sk.id], base).href : null, run = sk.duration > 0 ? secondsToFrames(sk.duration) : 0;
  const state = u.skill === SKILL_STATE.RUNNING ? 'running' : u.skill === SKILL_STATE.READY ? 'ready' : 'charging';
  const share = state === 'running' ? (run > 0 && u.skillLeft >= 0 ? Math.min(1, u.skillLeft / run) : 1) : state === 'ready' ? 1 : u.spCost > 0 ? Math.min(1, u.sp / u.spCost) : 0;
  return { icon, manual: sk.type === 'MANUAL', state, share, stoppable: !!sk.stoppable };
}

/** This seat's operator standing on a tile, or null. @param {import('@aue/schema').View} view @param {number} seat @param {{ row: number, col: number }} t */
export const ownUnitAt = (view, seat, t) => view.units.find((u) => u.kind === KIND.OPERATOR && u.owner === seat && Math.round(u.x) === t.col && Math.round(u.y) === t.row) ?? null;
