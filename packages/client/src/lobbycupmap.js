// 阵地足球锦标's zone map (docs/spec/page.md 页面-11, room.md 房间-15): the map state of the cup UI pack with a zone's map
// in it — the qualifier's stadium with a stage button placed on each of its stage's spots, the tournament's and the
// training's own stage items —, each stage's button locked or open with its code and its best score; the chosen
// stage's detail on the right (its code, the two teams with their icons, its description, the 锦标积分券 a win and a
// first win give, on a training stage the training effect it unlocks, 开始比赛); the zone buttons that switch zones; the
// 训练效果 button and its dialog, where one training effect unlocked is chosen or none.
import { scrollOf, scrollTo } from '@aue/ui';
import { NodePart, openPart, closePart, place, placeTopMenu } from './lobbykit.js';
import { CUP_SCREENS, zonesOf, zoneStages, stageState, firstStage, slotOf, digits } from './cupmap.js';
import { CUP_ZONES, CUP_STAGES, CUP_LEVELS, cupStage } from '@icebreaker/mode-regular';

/** @typedef {import('./lobbykit.js').Part} Part @typedef {import('./lobbycup.js').CupCtx} CupCtx @typedef {import('./lobbycup.js').Relic} Relic @typedef {import('@icebreaker/mode-regular').CupStage} CupStage */
/** @typedef {{ back: () => void, home: () => void, squad: (s: CupStage) => void }} MapGo */
/**
 * The map's state: its part, the zone shown and its map, the stage chosen, each stage's button, the training effect
 * dialog when open.
 * @typedef {{ p: Part, X: CupCtx, go: MapGo, zone: number, panel: Part | null, chosen: CupStage | null, buttons: Map<string, Part>, trap: Part | null }} CupMap
 */

const MAP = '@panel_map';
const CONTENT = '@zone_ScrollView/Viewport/zone_content';
/** The stage items the tournament's and the training's maps hold in their stage spots. */
const ITEMS = ['', 'act1football_zone2_stage_item', 'act1football_3_stage_item'];
/** The zone buttons' names, in the zones' order. */
const DECOR = (/** @type {number} */ i) => `${MAP}/panel_map_decor/btn_zone_${i + 1}`;
/** What the detail's buttons for pages the event does not have here say. */
const NOT_HERE = '暂未开放';

/** The training effects unlocked (房间-15): their stage cleared. @param {CupCtx} X @param {readonly Relic[]} relics */
const unlocked = (X, relics) => relics.filter((r) => X.get().cleared.includes(r.unlockedBy));

/** The training effects of the event (the same in every stage's level). @param {CupCtx} X */
export const relicsOf = (X) => X.relics(CUP_LEVELS.find((l) => !cupStage(l)?.predefined) ?? CUP_LEVELS[0] ?? '');

/** The training effect chosen, when it is unlocked; null for none. @param {CupCtx} X */
export function chosenRelic(X) {
  const id = X.get().relic;
  return unlocked(X, relicsOf(X)).find((r) => r.id === id) ?? null;
}

/** Each stage button's look last drawn (chosen or not). @type {WeakMap<import('@aue/ui').UiNode, boolean>} */
const looks = new WeakMap();

/** What opens a stage: its stages before it. @param {CupStage} s */
const opensAfter = (s) => `完成 ${s.after.map((x) => CUP_STAGES.find((y) => y.stage === x)?.code ?? x).join('、')} 后开放`;

/**
 * A stage's button: locked or open, its code, its best score on the board (or the empty board), chosen or not (its
 * switch clip forwards or backwards). Its nodes are found by their tails (the tournament's and the training's items are
 * nodes of their map, NodePart). @param {Part} b @param {CupStage} s @param {CupMap} M
 */
function fillButton(b, s, M) {
  const c = M.X.get(), state = stageState(s, c.cleared), best = c.best[s.stage];
  b.show('lock', state === 'locked');
  b.show('enable', state !== 'locked');
  b.text('img_stage_code', s.code);
  b.text('img_stage_id', s.code);
  b.show('score_available', !!best);
  b.show('score_empty', !best);
  // the board's digits are glyphs of its bitmap font (exported as pictures): _02 the tens (on the left), _01 the ones
  const glyph = M.X.cupArt?.glyphs?.FootballScoreFont ?? {}, [p10, p1] = digits(best?.[0] ?? 0), [e10, e1] = digits(best?.[1] ?? 0);
  for (const [at, d] of [['text_player_score_02', p10], ['text_player_score_01', p1], ['text_enermy_score_02', e10], ['text_enermy_score_01', e1]]) b.sprite(at, glyph[d] ?? null);
  // its switch clip plays only when its look changes (at once the first time it is drawn)
  const on = M.chosen?.stage === s.stage, clip = M.zone === 1 ? 'act1football_stage_zone2_select_switch' : 'act1football_stage_zone1_3_select_switch', was = looks.get(b.root);
  if (was !== on) { void b.play('enable', clip, { reverse: !on, ...(was === undefined ? { rate: 1000 } : {}) }); looks.set(b.root, on); }
  b.tap('hot_spot', () => (state === 'locked' ? M.X.toast(opensAfter(s)) : choose(M, s)));
}

/** The zone's stage buttons: the qualifier's placed on its spots, the others' items already there. @param {CupMap} M */
function drawButtons(M) {
  const zp = M.panel, zone = CUP_ZONES[M.zone];
  if (!zp || !zone) return;
  // the training's second stage opened on a date in the original: no date here (its time board hidden)
  zp.show(`${CONTENT}/act1football_sub_1-2_locked`, false);
  for (const s of zoneStages(zone.id)) {
    let b = M.buttons.get(s.stage);
    if (!b) {
      const at = `${CONTENT}/${slotOf(s)}`, item = ITEMS[M.zone] ? zp.node(`${at}/${ITEMS[M.zone]}`) : null;
      b = item ? new NodePart(zp.ui, zp.scr, item, zp.key) : place(zp, at, CUP_SCREENS.stageButton) ?? undefined;
      if (!b) continue;
      M.buttons.set(s.stage, b);
    }
    fillButton(b, s, M);
  }
}

/** The detail's part of the zone (the qualifier's and the tournament's, or the training's). @param {CupMap} M */
const detailAt = (M) => `@panel_detail/deatil_zone_${M.zone === 2 ? '3' : '1_2'}`;

/**
 * The 锦标积分券 a win of a stage gives (房间-15): before its first win both its win's and its first win's, after it its
 * win's; none on the training stage. @param {Part} zp @param {string} D @param {CupStage} s @param {boolean} cleared
 */
function drawReward(zp, D, s, cleared) {
  const some = s.points.complete + s.points.first > 0;
  zp.show(`${D}/group_reward`, some);
  zp.show(`${D}/group_reward/first`, some && !cleared);
  zp.show(`${D}/group_reward/passed`, some && cleared);
  for (const g of ['first', 'passed']) {
    zp.text(`${D}/group_reward/${g}/panel_complete_reward/text_plus`, '');
    zp.text(`${D}/group_reward/${g}/panel_complete_reward/text_count`, String(s.points.complete));
  }
  zp.text(`${D}/group_reward/first/panel_first_reward/text_plus`, '+');
  zp.text(`${D}/group_reward/first/panel_first_reward/text_count`, String(s.points.first));
}

/** A training stage's training effect: its icon, name and text, locked until the stage is cleared. @param {CupMap} M @param {string} D @param {CupStage} s */
function drawBuff(M, D, s) {
  const zp = /** @type {Part} */ (M.panel), b = s.buff, done = M.X.get().cleared.includes(s.stage), G = `${D}/group_buff_info`;
  zp.show(G, !!b);
  if (!b) return;
  zp.show(`${G}/lock`, !done);
  zp.show(`${G}/unlock`, done);
  zp.show(`${G}/panel_buff_icon/panel_locked`, !done);
  zp.sprite(`${G}/panel_buff_icon/img_icon`, M.X.cupArt?.buff?.[b.icon] ?? null);
  zp.text(`${G}/desc_text_layout/text_buff_name`, b.name);
  zp.text(`${G}/desc_text_layout/text_buff_desc`, b.desc);
}

/** The chosen stage's detail. @param {CupMap} M */
function drawDetail(M) {
  const zp = M.panel, s = M.chosen;
  if (!zp || !s) return;
  const D = detailAt(M), art = M.X.cupArt, cleared = M.X.get().cleared.includes(s.stage);
  zp.text(`${D}/group_board/text_level_code`, s.code);
  zp.text(`${D}/group_board/group_team_info/text_team_player`, s.ours.name);
  zp.text(`${D}/group_board/group_team_info/text_team_enermy`, s.theirs.name);
  zp.sprite(`${D}/group_board/group_team_info/icon_team_player`, art?.teamIcon?.[s.ours.icon] ?? null);
  zp.sprite(`${D}/group_board/group_team_info/icon_team_enermy`, art?.teamIcon?.[s.theirs.icon] ?? null);
  zp.text(`${D}/level_desc_ScrollView/Viewport/Content/text_level_desc`, `${s.name}\n${s.detail}`);
  drawReward(zp, D, s, cleared);
  if (M.zone === 2) drawBuff(M, D, s);
  zp.tap(`${D}/btn_enermy/hotspot`, () => M.X.toast(NOT_HERE));
  zp.tap(`${D}/btn_map/hotspot`, () => M.X.toast(NOT_HERE));
  zp.tap(`${D}/btn_start/hotspot`, () => start(M, s));
}

/** 开始比赛: the training stage starts at once (its operators are the level's), the others go to the squad page. @param {CupMap} M @param {CupStage} s */
function start(M, s) {
  if (stageState(s, M.X.get().cleared) === 'locked') { M.X.toast(opensAfter(s)); return; }
  if (s.predefined) M.X.start(s.level, [], '', null);
  else M.go.squad(s);
}

/** A stage chosen: the buttons' looks, its detail shown (the zone buttons go). @param {CupMap} M @param {CupStage} s */
function choose(M, s) {
  const was = M.chosen;
  M.chosen = s;
  drawButtons(M);
  drawDetail(M);
  if (!was) showDetail(M, true);
}

/** The detail closed (a tap beside it): no stage chosen, the zone buttons back. @param {CupMap} M */
function unchoose(M) {
  if (!M.chosen) return;
  M.chosen = null;
  drawButtons(M);
  showDetail(M, false);
}

/**
 * The detail in or out with its show switch (out: inactive at its end, so the map under it takes taps again); the
 * zone buttons hidden while it is in. @param {CupMap} M @param {boolean} on
 */
function showDetail(M, on) {
  const zp = M.panel, d = zp?.node('@panel_detail');
  M.p.show(`${MAP}/panel_map_decor`, !on);
  if (!zp || !d) return;
  if (on) d.active = true;
  void zp.play('@panel_detail', 'act1football_stage_detail_show_switch', { reverse: !on }).then(() => { if (!on && !M.chosen) d.active = false; });
}

/**
 * The map scrolled so a stage's button shows left of the detail (at a third of the page's width, a little below the
 * middle). @param {CupMap} M @param {CupStage} s
 */
function focus(M, s) {
  const zp = M.panel, sv = zp?.node('@zone_ScrollView'), content = zp?.node(CONTENT), b = zp?.node(`${CONTENT}/${slotOf(s)}`);
  if (!sv || !content || !b) return;
  const { w } = M.p.ui.canvas, [ox, oy] = scrollOf(sv), bx = content.rt.pos[0] - ox, by = content.rt.pos[1] - oy;
  scrollTo(sv, w / 3 - (w / 2 + bx + b.rt.pos[0]), -(by + b.rt.pos[1]) - 20);
}

/** A zone's map in the map state, its first stage chosen and in view. @param {CupMap} M @param {number} zone */
function showZone(M, zone) {
  M.zone = zone;
  M.buttons = new Map();
  M.chosen = null;
  M.panel = place(M.p, `${MAP}/panel_map_container`, CUP_SCREENS.zones[zone] ?? '');
  // the detail is out until a stage is chosen; a tap beside it closes it
  M.panel?.show('@panel_detail', false);
  M.panel?.tap('@panel_detail/panel_back_btn', () => unchoose(M));
  M.p.show(`${MAP}/panel_map_decor`, true);
  drawDecor(M);
  drawButtons(M);
  const first = firstStage(CUP_ZONES[zone]?.id ?? '', M.X.get().cleared);
  if (first) focus(M, first);
}

/** The zone buttons: the shown one selected, the other open ones to switch to, the locked ones with their lock. @param {CupMap} M */
function drawDecor(M) {
  for (const z of zonesOf(M.X.get().cleared)) {
    const at = DECOR(z.i), on = z.i === M.zone;
    M.p.show(`${at}/selected`, on);
    M.p.show(`${at}/unselect`, !on && z.open);
    M.p.show(`${at}/locked`, !z.open);
    M.p.show(`${at}/new`, false);
    M.p.tap(`${at}/unselect/hotspot`, () => { if (M.zone !== z.i) { M.X.sound('ui.ON_ACT1FOOTBALL_SWITCHZONE'); showZone(M, z.i); } });
  }
  drawTrapButton(M);
}

/** The 训练效果 button: locked while none is unlocked, else the chosen one's icon or none. @param {CupMap} M */
function drawTrapButton(M) {
  const T = `${MAP}/panel_trap`, any = unlocked(M.X, relicsOf(M.X)).length > 0, r = chosenRelic(M.X);
  M.p.show(`${T}/panel_locked`, !any);
  M.p.show(`${T}/panel_unlocked`, any);
  M.p.show(`${T}/panel_unlocked/panel_selected`, !!r);
  M.p.show(`${T}/panel_unlocked/panel_unselected`, !r);
  M.p.show(`${T}/panel_unlocked/img_new`, false);
  if (r) M.p.sprite(`${T}/panel_unlocked/panel_selected/img_icon`, iconOf(M.X, r));
  M.p.tap(`${T}/hot_spot`, () => (any ? openTraps(M) : M.X.toast('通关特训赛后解锁训练效果')));
}

/** A training effect's icon: its stage's training effect icon. @param {CupCtx} X @param {Relic} r */
export const iconOf = (X, r) => { const b = cupStage(r.unlockedBy)?.buff; return b ? X.cupArt?.buff?.[b.icon] ?? null : null; };

/**
 * The training effect dialog (房间-15: 「可生效其中一个」): each effect locked until its stage is cleared, else its name
 * and text, chosen or not; a tap chooses it or lets it go; the close button or the blur outside closes it (then
 * `closed`). @param {any} ui @param {CupCtx} X @param {() => void} closed @returns {Part}
 */
export function openTrapDialog(ui, X, closed) {
  const t = openPart(ui, CUP_SCREENS.trap, 45), relics = relicsOf(X);
  const close = () => { closePart(t); closed(); };
  const draw = () => drawTraps(t, X, relics);
  relics.slice(0, 2).forEach((r, i) => t.tap(`@panel_buff_0${i + 1}/panel_card/panel_unlocked/hot_spot`, () => {
    const c = X.get(), on = c.relic !== r.id;
    X.set({ ...c, relic: on ? r.id : '' });
    if (on) { X.sound('ui.ON_ACT1FOOTBALL_SWITCHBUFF'); void t.play(`@panel_buff_0${i + 1}`, 'act1football_buff_selected_anim'); }
    draw();
  }));
  t.tap('@btn_close/hot_spot', close);
  t.tap('@img_blur_bkg', close);
  draw();
  return t;
}

/** The map's training effect dialog. @param {CupMap} M */
function openTraps(M) {
  if (!M.trap) M.trap = openTrapDialog(M.p.ui, M.X, () => { M.trap = null; drawTrapButton(M); });
}

/** The dialog's two effects drawn. @param {Part} t @param {CupCtx} X @param {readonly Relic[]} relics */
function drawTraps(t, X, relics) {
  const chosen = chosenRelic(X)?.id ?? '', cleared = X.get().cleared;
  relics.slice(0, 2).forEach((r, i) => {
    const B = `@panel_buff_0${i + 1}`, open = cleared.includes(r.unlockedBy), on = open && chosen === r.id;
    t.show(`${B}/panel_card/panel_locked`, !open);
    t.show(`${B}/panel_card/panel_unlocked`, open);
    t.text(`${B}/panel_card/panel_locked/text_tip`, `完成 ${cupStage(r.unlockedBy)?.code ?? ''} 后解锁`);
    t.text(`${B}/panel_card/panel_unlocked/panel_tip/text_name`, r.name);
    t.text(`${B}/panel_card/panel_unlocked/panel_tip/text_desc`, r.text);
    t.show(`${B}/panel_card/panel_unlocked/img_new`, false);
    t.show(`${B}/panel_card/panel_unlocked/img_bkg_selected`, on);
    t.show(`${B}/panel_card/panel_unlocked/select`, on);
    t.show(`${B}/panel_card/panel_unlocked/select_mask`, on);
    t.show(`${B}/panel_item/img_selected`, on);
    t.show(`${B}/panel_item/img_unselected`, !on);
    t.show(`${B}/panel_item/img_tip_selected`, on);
  });
}

/**
 * The zone map over the entry page (页面-11), a zone's map shown. @param {any} ui @param {CupCtx} X @param {number} zone
 * @param {MapGo} go
 */
export function createCupMap(ui, X, zone, go) {
  const p = openPart(ui, CUP_SCREENS.map, 10);
  /** @type {CupMap} */
  const M = { p, X, go, zone, panel: null, chosen: null, buttons: new Map(), trap: null };
  placeTopMenu(p, '@panel_top_menu', { back: go.back, home: go.home });
  p.show('@panel_guidebook', false);
  // the zone change's cover (its logo on black) shows only while a zone changes in the original
  p.show(`${MAP}/panel_change`, false);
  showZone(M, zone);
  void p.play(MAP, 'act1football_zone_map_fade_in_anim');
  return {
    part: p,
    /** Drawn again (the progress or the training effect may have changed). */
    update: () => { drawDecor(M); drawButtons(M); drawDetail(M); },
    /** The page's back: closes the training effect dialog or the detail first; false when there is nothing to close. */
    back: () => {
      if (M.trap) { closePart(M.trap); M.trap = null; drawTrapButton(M); return true; }
      if (!M.chosen) return false;
      unchoose(M); return true;
    },
    close: () => { if (M.trap) closePart(M.trap); closePart(p); },
    /** What the map shows, for tests. */
    state: () => ({ zone: M.zone, chosen: M.chosen?.stage ?? null, trap: !!M.trap }),
  };
}
