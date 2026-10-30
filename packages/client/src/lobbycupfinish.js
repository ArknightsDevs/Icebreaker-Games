// 阵地足球锦标's result (docs/spec/page.md 页面-11, room.md 房间-15): the cup UI pack's battle finish view after a stage's
// match — VICTORY or 比赛失败 with its clip, the two teams with their icons, names and scores, the net goals (NEW when the
// stage's best score is beaten), the 锦标积分券 the match gave with the 锦标奖杯's level and how far the next one is, the
// lineup that played on the event's cards (the support unit's and the special operators' marked), the player and the
// time, the stage's code, name and zone. A tap anywhere goes back to the stage's zone map.
import { NodePart, openPart, closePart } from './lobbykit.js';
import { CUP_SCREENS, trophyOf } from './cupmap.js';
import { CUP_ZONES, CUP_NPCS, cupStage, cupNpcEntries } from '@icebreaker/mode-regular';
import { fullEntry } from './training.js';

/** @typedef {import('./lobbykit.js').Part} Part @typedef {import('./lobbycup.js').CupCtx} CupCtx @typedef {import('@icebreaker/mode-regular').BoxEntry} BoxEntry */
/**
 * A stage's match as its result shows it: won, the level, its score (ours, theirs), the 锦标积分券 it gave and the points
 * now, whether its score is the stage's new best, when it ended.
 * @typedef {{ result: number, level: string, score: [number, number], gained: number, points: number, best: boolean, at?: number }} CupEnd
 */
/** An operator on a card: its id, its entry, the skill slot and module it took, the support unit or a special operator. @typedef {{ id: string, e: BoxEntry, skill: number, module: number, assist: boolean }} CardOp */

const PRE = '@group_victory/part_victory_pre/before';
const INFO = '@group_info_common';
/** The cards' places in order: four, four and five. */
const SLOTS = [...[1, 2, 3, 4].map((i) => `part_01/item_0${i}`), ...[1, 2, 3, 4].map((i) => `part_02/item_0${i}`), ...[1, 2, 3, 4, 5].map((i) => `part_03/item_0${i}`)];

/** A time as the view writes it: year/month/day hour:minute. @param {number} at */
export function timeText(at) {
  const d = new Date(at), p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The net goals as the view writes them: a sign before a lead. @param {[number, number]} score */
export const netText = (score) => { const n = score[0] - score[1]; return n > 0 ? `+${n}` : String(n); };

/** The two teams: icons, names and scores, in the opening part and the strip. @param {Part} p @param {CupCtx} X @param {CupEnd} r */
function drawTeams(p, X, r) {
  const s = cupStage(r.level), icon = (/** @type {string | undefined} */ k) => (k ? X.cupArt?.teamIcon?.[k] ?? null : null);
  for (const [side, team, goals] of /** @type {const} */ ([['group_mine', s?.ours, r.score[0]], ['group_enemy', s?.theirs, r.score[1]]])) {
    for (const at of [`${PRE}/${side}`, `${INFO}/${side}`]) {
      p.sprite(`${at}/icon`, icon(team?.icon));
      p.text(`${at}/text_teamname`, team?.name ?? '');
    }
    p.text(`${PRE}/${side}/text_score`, String(goals));
    p.text(`${INFO}/${side}/group_score/text_score`, String(goals));
  }
  // the winner's crown and highlight on our side only when won
  for (const at of [`${PRE}/group_mine/champion`, `${INFO}/group_mine/group_score/champion`, `${INFO}/group_mine/group_score/highlight`]) p.show(at, r.result === 1);
}

/** The strip's player, time, zone and stage. @param {Part} p @param {CupCtx} X @param {CupEnd} r */
function drawInfo(p, X, r) {
  const s = cupStage(r.level);
  p.text(`${INFO}/player_id/text_id`, X.player());
  p.text(`${INFO}/time/text_time`, timeText(r.at ?? Date.now()));
  p.text(`${INFO}/mode/text_mode`, CUP_ZONES.find((z) => z.id === s?.zone)?.name ?? '');
  p.text(`${INFO}/title/text_title`, s?.name ?? '');
  p.text(`${INFO}/title/text_code`, s?.code ?? '');
}

/** The 锦标积分券 the match gave, the trophy's level and how far the next one is, its level-up glow when it went up. @param {Part} p @param {CupEnd} r */
function drawReward(p, r) {
  const now = trophyOf(r.points), was = trophyOf(r.points - r.gained);
  p.sprite('@group_reward/icon', 'sprite/cup/img_milestone');
  p.text('@group_reward/text_reward', `+${r.gained}`);
  p.text('@group_reward/group_lv/text_lv', String(now.level));
  p.show('@group_reward/group_lv', !now.max);
  p.show('@group_reward/group_lvmax', now.max);
  p.show('@group_reward/group_lvup', now.level > was.level);
  p.text('@group_reward/group_count/text_num', `${r.points}`);
  const ring = p.node('@group_reward/group_progress/progress');
  if (ring) p.scr.fill('', now.fill, ring);
}

/**
 * An operator's card: its background (the support unit's, a special operator's or the plain one) and mark, portrait,
 * elite phase, level, potential, the skill it took (its level, or its mastery's icon), its module, its profession.
 * @param {NodePart} c @param {CupCtx} X @param {CardOp} o
 */
function fillCard(c, X, o) {
  const npc = CUP_NPCS.includes(o.id), e = o.e, r = X.roster[o.id];
  c.show('@panel_normal/normal_bg', !o.assist && !npc);
  c.show('@panel_normal/assist_bg', o.assist);
  c.show('@panel_normal/npc_bg', npc);
  c.show('@panel_normal/assist_icon', o.assist);
  c.show('@panel_normal/npc_icon', npc);
  c.picture('@panel_normal/char/img_char', X.cards.portrait(o.id, e.elite) ?? X.cards.avatar(o.id));
  c.picture('@panel_normal/root_detail/evolve', X.cards.elite(e.elite));
  c.text('@panel_normal/root_detail/text_lv', String(e.level));
  const pot = e.potential >= 2 ? X.cards.potential(e.potential) : null;
  c.show('@panel_normal/root_detail/potnetial_outer_control', !!pot);
  if (pot) c.picture('@panel_normal/root_detail/potnetial_outer_control/potential', pot);
  c.picture('@panel_normal/root_professions/normal_professions', X.cards.profession(r?.profession ?? '')?.url ?? null);
}

/** A card's skill and module, once the operator's training data is in. @param {NodePart} c @param {CupCtx} X @param {CardOp} o */
function fillSkill(c, X, o) {
  const S = '@panel_normal/root_detail/root_skill', M = '@panel_normal/root_detail/root_module';
  void X.training(o.id).then((t) => {
    const sk = o.skill >= 0 ? t.skills[o.skill] : null, lv = sk ? o.e.skills[o.skill] ?? 1 : 0, mod = o.module >= 0 ? /** @type {any} */ (t.modules[o.module])?.type ?? null : null;
    c.show(`${S}/skill`, !!sk);
    c.show(`${S}/empty`, !sk);
    if (sk) {
      c.picture(`${S}/skill`, X.cards.skill(sk.id));
      c.text(`${S}/skill/skill_specialized_back/text_skill_level`, lv > 7 ? '' : String(lv));
      c.show(`${S}/skill/skill_specialized_back/img_specialized`, lv > 7);
      if (lv > 7) c.sprite(`${S}/skill/skill_specialized_back/img_specialized`, `sprite/evolve_small_icon_${lv - 7}`);
    }
    const equip = mod ? X.cards.equip(mod) : null;
    c.show(`${M}/root_icon`, !!equip);
    c.show(`${M}/default_module`, !equip);
    if (equip) c.picture(`${M}/root_icon/icon`, equip);
  }, () => undefined);
}

/**
 * The lineup that played (房间-15): the lineup's operators in order, the support unit last, at the training each took;
 * the cards beyond them empty. @param {Part} p @param {CupCtx} X @param {readonly CardOp[]} ops
 */
function drawTeam(p, X, ops) {
  const team = p.node('@group_team');
  SLOTS.forEach((at, i) => {
    const node = team ? new NodePart(p.ui, p.scr, team, p.key).node(`@${at}/container/act1football_char_card_item`) : null;
    if (!node) return;
    const c = new NodePart(p.ui, p.scr, node, p.key), o = ops[i];
    c.show('@panel_normal', !!o);
    c.show('@panel_noinfo', !o);
    if (!o) return;
    fillCard(c, X, o);
    fillSkill(c, X, o);
  });
}

/**
 * The lineup brought (the progress keeps it): the lineup's operators — the special operators at their own training,
 * the others at the box's —, the support unit last at its full training. @param {CupCtx} X @returns {Promise<CardOp[]>}
 */
export async function cupOps(X) {
  const c = X.get(), npcs = cupNpcEntries(() => 3);
  /** @type {CardOp[]} */
  const ops = c.picks.flatMap((p) => { const e = npcs.find((n) => n.id === p.id) ?? X.entry(p.id); return e ? [{ id: p.id, e, skill: p.skill, module: p.module, assist: false }] : []; });
  if (c.assist) ops.push({ id: c.assist.id, e: fullEntry(c.assist.id, await X.training(c.assist.id)), skill: c.assist.skill, module: c.assist.module, assist: true });
  return ops;
}

/** The result over the lobby (页面-11). @param {any} ui @param {CupCtx} X @param {CupEnd} r @param {() => void} done */
export function createCupFinish(ui, X, r, done) {
  const p = openPart(ui, CUP_SCREENS.finish, 60), won = r.result === 1;
  p.show('@group_victory', won);
  p.show('@group_defeat', !won);
  p.show('@maincolor_full_01_v', won);
  p.show('@maincolor_full_01_d', !won);
  drawTeams(p, X, r);
  drawInfo(p, X, r);
  p.text('@group_victory/part_victory/group_info/score_minus/text_score_minus', netText(r.score));
  p.show('@group_victory/part_victory/group_info/score_minus/new', r.best);
  drawReward(p, r);
  void cupOps(X).then((ops) => { if (!p.scr.dead) drawTeam(p, X, ops); }, () => undefined);
  void p.play('@', won ? 'act1football_settlement_victory' : 'act1football_settlement_defeat');
  X.sound(won ? 'ui.ON_ACT1FOOTBALL_WINSETTLEMENT' : 'ui.ON_ACT1FOOTBALL_LOSESETTLEMENT');
  p.tap('@click_area', done);
  p.tap('@back_rect', done);
  return { part: p, update: () => {}, close: () => closePart(p), state: () => ({ won, score: [...r.score], gained: r.gained }) };
}
