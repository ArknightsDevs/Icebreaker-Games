// 阵地足球锦标's squad page (docs/spec/page.md 页面-11, room.md 房间-15): the cup's layout view — twelve slots in two rows,
// each the lineup's operator on the game's common card (the skill it takes and its module on it, 替补中 on a special
// operator) or empty; the support unit's slot (助战干员) beside them with its clear button; 开始行动; 快捷编队 — with the
// training effects' bar at its left (its 训练效果 dialog behind the magnifier) and the common top menu. A tap on a slot or
// on 快捷编队 opens the operator select page (页面-9) for the lineup — up to 12, the special operators lent at their own
// training, and in the detail the skill each takes —; a tap on the support unit's slot opens it for one operator of all
// at its full training. Operators new to the box join it at their full training, as the 常规队's do.
import { NodePart, openPart, closePart, place, fillList, placeTopMenu } from './lobbykit.js';
import { createCharSelect, fillCommonCard } from './lobbyselect.js';
import { CUP_SCREENS, slotsOf } from './cupmap.js';
import { openTrapDialog, relicsOf, chosenRelic, iconOf } from './lobbycupmap.js';
import { CUP_NPCS, CUP_LINEUP, cupNpcEntries } from '@icebreaker/mode-regular';
import { fullEntry } from './training.js';

/** @typedef {import('./lobbykit.js').Part} Part @typedef {import('./lobbycup.js').CupCtx} CupCtx @typedef {import('@icebreaker/mode-regular').CupStage} CupStage */
/** @typedef {import('@icebreaker/mode-regular').BoxEntry} BoxEntry @typedef {import('./cupsave.js').CupChoice} CupChoice @typedef {import('@aue/content').Training} Training */
/**
 * The page's state: its parts (the layout, the training effects' bar, the top view), what it works with, the stage,
 * the special operators' entries (once their skills are known), training data and full entries loaded, the select page
 * and the training effect dialog when open.
 * @typedef {{ p: Part, bar: Part, top: Part, X: CupCtx, s: CupStage, npcs: BoxEntry[], train: Map<string, Training>, full: Map<string, BoxEntry>,
 *   select: { close: () => void, back: () => boolean } | null, trap: Part | null }} Squad
 */

const MID = '@panel_squad_group/panel_middle_control';
const ASSIST = `${MID}/assist_button`;
const CARD = 'common/panel_char_card';
/** The common card's scale in a slot (the support unit's slot's `charCardScaler`, as the lineup's slots are as wide). */
const CARD_SCALE = 0.91;

/** An operator's entry for the lineup: a special operator's own, else the box's. @param {Squad} Q @param {string} id */
const entryOf = (Q, id) => Q.npcs.find((e) => e.id === id) ?? Q.X.entry(id);

/**
 * The module an operator takes when it joins the lineup (房间-15): its module of the highest level, the first of them;
 * none without one. @param {BoxEntry | null} e
 */
export function defaultModule(e) {
  const levels = e?.modules ?? [];
  const top = Math.max(0, ...levels);
  return top > 0 ? levels.indexOf(top) : -1;
}

/**
 * The skill an operator takes when it joins without one chosen: its last (its entry's, else its training data's once
 * in). @param {Squad} Q @param {string} id
 */
const lastSkill = (Q, id) => (entryOf(Q, id)?.skills.length ?? trainingOf(Q, id)?.skills.filter((x) => x !== null).length ?? 1) - 1;

/** An operator's training data, loaded once; the page is drawn again when it is in. @param {Squad} Q @param {string} id */
function trainingOf(Q, id) {
  const t = Q.train.get(id);
  if (t) return t;
  if (!Q.train.has(id)) {
    Q.train.set(id, /** @type {any} */ (undefined));
    Q.X.training(id).then((x) => { Q.train.set(id, x); if (!Q.p.scr.dead) draw(Q); }, () => Q.train.delete(id));
  }
  return null;
}

/** An operator's row for the common card: its roster's name, rarity, profession and branch, its entry's training. @param {Squad} Q @param {string} id @param {BoxEntry} e */
function rowOf(Q, id, e) {
  const r = Q.X.roster[id];
  return { id, name: r?.name ?? id, rarity: r?.rarity ?? 1, profession: r?.profession ?? '', branch: r?.branch ?? '', elite: e.elite, level: e.level, potential: e.potential, inBox: true };
}

/** The skill and module an operator takes, their icons on its card (once its training data is in). @param {Squad} Q @param {Part} card @param {CupChoice} c */
function markChoice(Q, card, c) {
  const t = trainingOf(Q, c.id), skill = t && c.skill >= 0 ? t.skills[c.skill]?.id ?? null : null;
  const mod = t && c.module >= 0 ? /** @type {any} */ (t.modules[c.module])?.type ?? null : null, equip = mod ? Q.X.cards.equip(mod) : null;
  card.show('@panel_front/panel_skill', !!skill);
  card.show('@panel_front/panel_no_skill', !skill);
  if (skill) card.picture('@panel_front/panel_skill/image_skill', Q.X.cards.skill(skill));
  card.show('@panel_front/panel_uniequip', !!equip);
  if (equip) card.picture('@panel_front/panel_uniequip/uniequip_image', equip);
}

/**
 * An operator on the common card in a slot: its training, the skill it takes and its module.
 * @param {Squad} Q @param {Part} at the slot's part @param {string} node @param {CupChoice} c @param {BoxEntry} e
 */
function cardIn(Q, at, node, c, e) {
  const card = place(at, node, CARD);
  if (!card) return;
  card.root.rt.scale = [CARD_SCALE, CARD_SCALE];
  fillCommonCard(card, rowOf(Q, c.id, e), { art: Q.X.art, cards: Q.X.cards });
  markChoice(Q, card, c);
}

/** The lineup's twelve slots: each its operator's card (替补中 on a special operator) or empty. @param {Squad} Q */
function drawSlots(Q) {
  const picks = Q.X.get().picks;
  fillList(Q.p, `${MID}/panel_card_grid_group`, CUP_LINEUP, (slot, i) => {
    const c = slotsOf(picks)[i], e = c ? entryOf(Q, c.id) : null;
    slot.show('@panel_lock', false);
    slot.show('@panel_empty', !e);
    slot.show('@panel_active', !!e);
    slot.show('@tag_trying_out', !!e && CUP_NPCS.includes(c?.id ?? ''));
    if (c && e) cardIn(Q, slot, '@panel_active', c, e);
    slot.tap('@click_area', () => openSelect(Q));
  });
}

/** The support unit's slot: its card (at its full training) or empty, its clear button. @param {Squad} Q */
function drawAssist(Q) {
  const a = Q.X.get().assist, e = a ? Q.full.get(a.id) ?? null : null;
  if (a && !e) loadFull(Q, a.id);
  Q.p.show(`${ASSIST}/active_part`, true);
  Q.p.show(`${ASSIST}/unactive_part`, false);
  Q.p.show(`${ASSIST}/panel_locked`, false);
  Q.p.show(`${ASSIST}/active_part/image_empty_slot`, !e);
  Q.p.show(`${ASSIST}/active_part/panel_card_container`, !!e);
  Q.p.show(`${ASSIST}/active_part/cancel_button`, !!a);
  if (a && e) cardIn(Q, Q.p, `${ASSIST}/active_part/panel_card_container`, a, e);
  Q.p.tap(`${ASSIST}/active_part/hotspot_assist`, () => openAssist(Q));
  Q.p.tap(`${ASSIST}/active_part/cancel_button`, () => { Q.X.set({ ...Q.X.get(), assist: null }); draw(Q); });
}

/** An operator's full training (as one new to the box), loaded once. @param {Squad} Q @param {string} id */
function loadFull(Q, id) {
  if (Q.full.has(id)) return Promise.resolve(Q.full.get(id));
  return Q.X.training(id).then((t) => { const e = fullEntry(id, t); Q.full.set(id, e); if (!Q.p.scr.dead) draw(Q); return e; },
    (err) => { Q.X.toast(`读不到 ${Q.X.roster[id]?.name ?? id} 的数据：${err.message}`); return undefined; });
}

/** The training effects' bar: each effect locked until its stage is cleared, else its icon, the chosen one marked. @param {Squad} Q */
function drawBar(Q) {
  const relics = relicsOf(Q.X), cleared = Q.X.get().cleared, chosen = chosenRelic(Q.X)?.id ?? '', list = Q.bar.node('@trap_list');
  (list?.kids ?? []).forEach((node, i) => {
    const r = relics[i], item = new NodePart(Q.bar.ui, Q.bar.scr, node, Q.bar.key), open = !!r && cleared.includes(r.unlockedBy), on = open && r?.id === chosen;
    node.active = !!r;
    if (!r) return;
    item.show('@panel_locked', !open);
    item.show('@panel_unselected', open && !on);
    item.show('@panel_selected', on);
    item.show('@panel_unselected/trackpoint', false);
    for (const at of ['@panel_unselected/icon', '@panel_selected/icon']) item.sprite(at, iconOf(Q.X, r));
    item.tap('@hotspots', () => openTraps(Q));
  });
  Q.bar.tap('@btn_detail/hot_spot', () => openTraps(Q));
}

/** The training effect dialog over the squad page. @param {Squad} Q */
function openTraps(Q) {
  if (!Q.trap) Q.trap = openTrapDialog(Q.p.ui, Q.X, () => { Q.trap = null; draw(Q); });
}

/** @param {Squad} Q */
function draw(Q) { drawSlots(Q); drawAssist(Q); drawBar(Q); }

/** The select page closed, the page drawn again. @param {Squad} Q */
const closeSelect = (Q) => { Q.select?.close(); Q.select = null; draw(Q); };

/**
 * The operator select page for the lineup (页面-9): every operator, the special operators at their own training; up to
 * 12 in order; the detail chooses the skill each takes. 确认 keeps them (those new to the box joining it at their full
 * training; each keeps its skill and module, a newcomer takes its last skill and its top module). @param {Squad} Q
 */
function openSelect(Q) {
  if (Q.select) return;
  /** @type {Map<string, number>} */
  const skills = new Map(Q.X.get().picks.map((c) => [c.id, c.skill]));
  const assist = Q.X.get().assist?.id;
  Q.select = createCharSelect(Q.p.ui, {
    list: 'high', max: CUP_LINEUP, chosen: Q.X.get().picks.map((c) => c.id), other: [],
    roster: Object.fromEntries(Object.entries(Q.X.roster).filter(([id]) => id !== assist)), entry: (id) => entryOf(Q, id), training: Q.X.training,
    cards: Q.X.cards, art: Q.X.art, toast: Q.X.toast, back: () => closeSelect(Q), home: () => { closeSelect(Q); Q.X.leave(); },
    skill: { of: (id) => skills.get(id) ?? lastSkill(Q, id), set: (id, k) => { skills.set(id, k); } },
    confirm: (ids) => {
      Q.X.toBox(ids.filter((id) => !CUP_NPCS.includes(id))).then(() => {
        const was = new Map(Q.X.get().picks.map((c) => [c.id, c]));
        const picks = ids.map((id) => { const w = was.get(id); return { id, skill: skills.get(id) ?? w?.skill ?? lastSkill(Q, id), module: w?.module ?? defaultModule(entryOf(Q, id)) }; });
        Q.X.set({ ...Q.X.get(), picks });
        closeSelect(Q);
      }, (e) => Q.X.toast(`保存失败：${e.message}`));
    },
  });
}

/**
 * The select page for the support unit (房间-15): one operator of all but the lineup's, at its full training; the
 * detail chooses its skill. @param {Squad} Q
 */
function openAssist(Q) {
  if (Q.select) return;
  const c = Q.X.get(), inLineup = new Set(c.picks.map((p) => p.id)), was = c.assist;
  /** @type {Map<string, number>} */
  const skills = new Map(was ? [[was.id, was.skill]] : []);
  Q.select = createCharSelect(Q.p.ui, {
    list: 'high', max: 1, chosen: was ? [was.id] : [], other: [],
    roster: Object.fromEntries(Object.entries(Q.X.roster).filter(([id]) => !inLineup.has(id) && !CUP_NPCS.includes(id))), entry: () => null, training: Q.X.training,
    cards: Q.X.cards, art: Q.X.art, toast: Q.X.toast, back: () => closeSelect(Q), home: () => { closeSelect(Q); Q.X.leave(); },
    skill: { of: (id) => skills.get(id) ?? (trainingOf(Q, id)?.skills.filter((x) => x !== null).length ?? 1) - 1, set: (id, k) => { skills.set(id, k); } },
    confirm: (ids) => {
      const id = ids[0];
      if (!id) { Q.X.set({ ...Q.X.get(), assist: null }); closeSelect(Q); return; }
      void loadFull(Q, id).then((e) => {
        if (!e) return;
        Q.X.set({ ...Q.X.get(), assist: { id, skill: skills.get(id) ?? e.skills.length - 1, module: was?.id === id ? was.module : defaultModule(e) } });
        closeSelect(Q);
      });
    },
  });
}

/**
 * 开始行动 (房间-15): the lineup with its entries (the special operators' own), the support unit at its full training, the
 * training effect chosen; none chosen: a toast. @param {Squad} Q
 */
function start(Q) {
  const c = Q.X.get(), picks = c.picks.flatMap((p) => { const e = entryOf(Q, p.id); return e ? [{ e, skill: p.skill, module: p.module }] : []; });
  if (picks.length === 0) { Q.X.toast('先选上场干员'); return; }
  const a = c.assist, ae = a ? Q.full.get(a.id) : null;
  if (a && !ae) { Q.X.toast('正在读取助战干员的数据'); return; }
  Q.X.start(Q.s.level, picks, chosenRelic(Q.X)?.id ?? '', a && ae ? { e: ae, skill: a.skill, module: a.module } : null);
}

/** The squad page for a stage, over its zone's map. @param {any} ui @param {CupCtx} X @param {CupStage} s @param {{ back: () => void, home: () => void }} go */
export function createCupSquad(ui, X, s, go) {
  const p = openPart(ui, CUP_SCREENS.squad, 20), bar = openPart(ui, CUP_SCREENS.squadTraps, 21), top = openPart(ui, CUP_SCREENS.squadTop, 22);
  /** @type {Squad} */
  const Q = { p, bar, top, X, s, npcs: [], train: new Map(), full: new Map(), select: null, trap: null };
  placeTopMenu(top, '@panel_topmenu_holder', { back: go.back, home: go.home });
  if (X.cupArt?.start) p.sprite(`${MID}/start_button/start_image`, X.cupArt.start);
  p.tap(`${MID}/start_button/start_image/hotspot_startbtn`, () => start(Q));
  p.tap('@panel_squad_group/btn_mutli_format/image_btn_bkg/panel_hotspot', () => openSelect(Q));
  const counts = new Map();
  void Promise.all(CUP_NPCS.map(async (id) => counts.set(id, (await X.training(id)).skills.length)))
    .then(() => { Q.npcs = cupNpcEntries((id) => counts.get(id) ?? 0); if (!p.scr.dead) draw(Q); }, (e) => X.toast(`读不到特派干员的数据：${e.message}`));
  draw(Q);
  return {
    part: p,
    /** The page's back: the select page (its own back first) or the training effect dialog; false when there is nothing to close. */
    back: () => {
      if (Q.select) { if (!Q.select.back()) closeSelect(Q); return true; }
      if (Q.trap) { closePart(Q.trap); Q.trap = null; draw(Q); return true; }
      return false;
    },
    close: () => { Q.select?.close(); if (Q.trap) closePart(Q.trap); closePart(top); closePart(bar); closePart(p); },
    /** What the page shows, for tests. */
    state: () => ({ stage: s.stage, select: !!Q.select, trap: !!Q.trap, picks: X.get().picks.map((c) => ({ ...c })), assist: X.get().assist }),
  };
}
