// The original battle UI (the engine's docs/spec/ui.md 界面-10…14, ADR 0021): when the assets have the battle UI pack,
// @aue/ui draws it over the field — the deploy cards, the cost, the top bar (the co-op one in a match of two), the
// direction selector and the operator menu. What it shows is worked out here from each frame's view, the match status
// and the server's control state.
import { secondsToFrames } from '@aue/math';
import { ROSTER } from '@aue/content';
import { KIND, SKILL_STATE } from '@aue/schema';
import { costAsk } from '@aue/ui';

const FPS = 30;
/** How long a cost or pause request stays open (合作-5, 同步-8), in seconds. */
const OPEN = 15;
/** The most cost an accepted request moves when the level gives no cap (合作-5). */
const TRANSFER = 15;

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
 * What the page remembers between frames for the requests: the last answer to this seat's cost request (its frame),
 * and since when (page milliseconds) the current pause request has been open.
 * @typedef {{ answer: { accept: number, amount: number, frame: number } | null, pauseSince: number, now: number }} Requests
 */

/**
 * The requests remembered after a frame's events and the control state: an `answer` to this seat's request is kept;
 * a pause request's start is the first moment it was seen open.
 * @param {Requests} r
 * @param {{ events: Record<string, string | number>[], control: Control | null, seat: number, frame: number, now: number }} f
 * @returns {Requests}
 */
export function requestsAfter(r, f) {
  const { events, control, seat, frame, now } = f;
  let answer = r.answer;
  for (const e of events) if (e.type === 'answer' && Number(e.owner) === seat) answer = { accept: Number(e.accept), amount: Number(e.amount), frame };
  const open = control !== null && control.asker >= 0 && !control.held;
  return { answer, pauseSince: open ? (r.pauseSince >= 0 ? r.pauseSince : now) : -1, now };
}

/**
 * What the HUD shows of a frame.
 * @param {{ view: import('@aue/schema').View, status: Status, control: Control | null, seat: number, options: any, selected: string | null,
 *   stages?: any[], requests?: Requests, offline?: boolean }} o
 * @returns {import('@aue/ui').HudState}
 */
export function hudState(o) {
  const { view, status, control, seat } = o, p = view.players[seat], ps = status.players[seat], speed = battleSpeed(control), paused = !!control?.held;
  return {
    frame: view.frame, fps: FPS, cost: p.cost, cards: ps.cards, deployed: ps.deployed, slots: ps.slots,
    costTimer: ps.costTimer, costPeriod: secondsToFrames(o.options.costIncreaseTime), maxCost: o.options.maxCost, selected: o.selected,
    life: p.life, speed, paused, coop: view.players.length === 2 ? coopState(o, speed, paused) : undefined,
    states: { result: status.result, down: ps.revive >= 0, offline: !!o.offline },
  };
}

/**
 * The co-op top bar's and the cost request's state (界面-12, 界面-15–17).
 * @param {{ view: import('@aue/schema').View, status: Status, control: Control | null, seat: number, options: any, stages?: any[], requests?: Requests }} o
 * @param {number} speed @param {boolean} paused
 */
function coopState(o, speed, paused) {
  const side = (/** @type {number} */ i) => ({ life: o.view.players[i].life, fast: o.control?.fast[i] === 1, revive: o.status.players[i].revive >= 0 ? o.status.players[i].revive / FPS : -1 });
  const r = o.requests, c = o.control, mate = 1 - o.seat;
  const left = r && r.pauseSince >= 0 ? Math.max(0, 1 - (r.now - r.pauseSince) / (OPEN * 1000)) : 0;
  return { me: side(o.seat), mate: side(mate), speed, paused, asking: c?.asker === o.seat && r ? left : -1, confirm: c?.asker === mate && r ? left : -1,
    task: taskOf(o.status, o.stages ?? [], o.view.frame), cost: costAsk(costInput(o)) };
}

/**
 * The stage's task (界面-16, 合作-6): its number, objective, count, goals and the seconds left of its time — of its rest
 * while that runs; none before the first stage.
 * @param {Status} s @param {any[]} stages @param {number} frame @returns {import('@aue/ui').Task | null}
 */
export function taskOf(s, stages, frame) {
  const st = stages[s.stage];
  if (!st) return null;
  const left = frame < s.start ? (s.start - frame) / FPS : Math.max(0, (s.start + secondsToFrames(st.time) - frame) / FPS);
  return { stage: s.stage + 1, objective: st.objective, count: s.count, goal: st.goal, ...(st.advanced !== undefined ? { advanced: st.advanced } : {}), left };
}

/**
 * The cost request's inputs (合作-5): each side's open request, this seat's wait, whether it may ask (a mate, neither
 * side down, its cost under the cap, no open request), the last answer, the cap and what the mate's request would take.
 * @param {{ view: import('@aue/schema').View, status: Status, seat: number, options: any, requests?: Requests }} o
 * @returns {import('@aue/ui').CostAskInput}
 */
export function costInput(o) {
  const mate = 1 - o.seat, me = o.status.players[o.seat], them = o.status.players[mate], max = o.options.maxCost, cap = o.options.costTransfer ?? TRANSFER;
  const mine = o.view.players[o.seat], theirs = o.view.players[mate], a = o.requests?.answer ?? null;
  const canAsk = me.revive < 0 && them.revive < 0 && mine.cost < max && me.ask < 0 && them.ask < 0 && me.askCd <= 0;
  return { mine: me.ask, mates: them.ask, cooldown: me.askCd, canAsk, cap, give: Math.max(0, Math.min(cap, mine.cost, max - theirs.cost)),
    answer: a ? { accept: a.accept, amount: a.amount, ago: (o.view.frame - a.frame) / FPS } : null, fps: FPS, open: OPEN * FPS };
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
