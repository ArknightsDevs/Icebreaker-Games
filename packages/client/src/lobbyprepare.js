// The activity's prepare page (docs/spec/page.md 页面-6): the room from 项目调整 to the match — its top bar (the step's
// countdown, warning from the activity's hintTime; the stage; leaving; 上一步 in the lineup), the two players beside
// it (names, styles once shown, who has confirmed, 请离房间, the room's time left), the banner of a new phase, the
// step views in its step container, the countdown and the start before the match, the lost-connection view.
import { openPart, closePart, place, unplace, setSwitch, screenKey } from './lobbykit.js';
import { PAGES, STEP_SCREENS, stepOf, countdownOf, bannerOf } from './lobbymap.js';
import { createStage, createStageList, createConfirm, createStart, classIcon } from './lobbystage.js';
import { createPick } from './lobbypick.js';
import { createLineup } from './lobbylineup.js';
import { clock } from './roomtext.js';

/** @typedef {import('./lobbykit.js').Part} Part @typedef {import('./lobbystage.js').StepCtx} StepCtx */

const MAIN = '@state_engine/main_state';
const TOP = 'prepare/mainviews/act_multi_v3_parepare_main_top_view', SIDE = 'prepare/mainviews/act_multi_v3_side_player_info_view';
const COUNTDOWN = 'prepare/mainviews/act_multi_v3_countdown_view';
/** The step controllers by step screen use (the three lineup steps share the squad check panel). */
const CONTROL = Object.freeze({ stage: 'stage', confirm: 'confirm', start: 'start', pick: 'pick', sel: 'lineup', skill: 'lineup', check: 'lineup' });

/** Each step's controller, made on a step part. @type {Record<string, (p: Part, X: StepCtx) => { update: (S: any, L: any) => void }>} */
const MAKERS = { stage: createStage, confirm: createConfirm, start: createStart, pick: createPick, lineup: createLineup };

/**
 * The prepare page on the lobby UI.
 * @param {any} ui @param {StepCtx} X
 */
export function createPrepare(ui, X) {
  const page = openPart(ui, PAGES.prepare), mv = page.view(MAIN);
  const containers = Object.fromEntries((mv.viewPrefabs ?? []).map((/** @type {any} */ v) => [screenKey(v.viewPrefab), v.container]));
  const top = place(page, containers[TOP] ?? `${MAIN}/top_view`, TOP), side = place(page, containers[SIDE] ?? `${MAIN}/player_info_view`, SIDE);
  const tf = top?.view() ?? {}, sf = side?.view() ?? {};
  page.show(`${MAIN}/emoji_chat_view`, false);
  if (top) wireTop(top, tf, X);
  if (side) wireSide(side, sf, X);
  /** @type {{ ctl: string, step: string, c: { update: (S: any, L: any) => void } | null }} */
  let cur = { ctl: '', step: '', c: null };
  /** @type {string | null} */
  let phase = null, warn = false, list = /** @type {{ update: (S: any) => void, close: () => void } | null} */ (null);
  const stepAt = mv.stepView ?? `${MAIN}/step_container`;

  /** @param {string} step */
  function swap(step) {
    const ctl = /** @type {Record<string, string>} */ (CONTROL)[step] ?? 'stage';
    if (ctl === cur.ctl && cur.c) { cur.step = step; return; }
    const part = place(page, stepAt, /** @type {Record<string, string>} */ (STEP_SCREENS)[step]);
    cur = { ctl, step, c: part ? MAKERS[ctl](part, X) : null };
  }

  /** The stage list over the page while the owner picks a stage (项目调整). @param {any} S @param {any} L */
  function stageList(S, L) {
    const open = L.list && S.view.phase === 'setup' && S.view.you === 0;
    if (open && !list) list = createStageList(page, X);
    if (!open && list) { list.close(); list = null; }
    list?.update(S);
  }

  return {
    part: page,
    /** @param {any} S @param {any} L */
    update(S, L) {
      const v = S.view, step = stepOf(v, L);
      swap(step);
      cur.c?.update(S, L);
      stageList(S, L);
      if (top) topUpdate(top, tf, S, step, X);
      if (side) sideUpdate(side, sf, S, X);
      const b = bannerOf(phase, v);
      if (b) void banner(page, b);
      phase = v.phase;
      page.show(`${MAIN}/lost_connection_view`, X.offline());
    },
    /** The countdowns, a few times a second. @param {any} S */
    tick(S) {
      if (!S.view) return;
      const cd = countdownOf(S.view, performance.now() - S.at);
      if (top) warn = countdownTick(top, tf, cd, warn);
      if (side) side.text(sf.closeTxt, clock(S.view.left - (performance.now() - S.at)));
    },
    /** Before the match: the countdown, then the start (页面-6); resolves when they have played. @param {any} S */
    async start(S) {
      swap('start');
      cur.c?.update(S, null);
      const at = containers[COUNTDOWN] ?? `${MAIN}/countdown_view_container`, cd = place(page, at, COUNTDOWN);
      // the countdown ends on its white logo; it goes when it has played and the start show begins from white
      if (cd) await cd.anim(cd.view().cdAnim);
      unplace(page, at);
      await /** @type {any} */ (cur.c)?.play?.();
    },
    close: () => { list?.close(); closePart(page); },
  };
}

/** The top bar's taps: leaving, 上一步. @param {Part} t @param {Record<string, any>} f @param {StepCtx} X */
function wireTop(t, f, X) {
  t.tap('@bkg/btn_exit/hot_spot', X.leave);
  t.tap('@bkg/panel_horz_grp/panel_pre_btn/btn_return', X.back);
  t.show(f.pingLabel, false);
  t.show(f.invertTipObj, false);
  t.show('@bkg/panel_horz_grp/panel_map_btn/btn_show_map', false);
}

/**
 * The top bar for a room (页面-6): the stage and its class, 上一步 in the lineup's later steps, leaving hidden while the
 * stage is confirmed and the match starts.
 * @param {Part} t @param {Record<string, any>} f @param {any} S @param {string} step @param {StepCtx} X
 */
function topUpdate(t, f, S, step, X) {
  const p = X.projects()[S.view.project];
  if (p) {
    t.text(f.stageCode, p.code);
    t.text(f.stageName, p.name);
    if (!t.node(f.diffIconContainer)?.kids.length) classIcon(t, f.diffIconContainer, f.diffIconPrefab, p, f.diffIconScale ?? 1);
  }
  t.show(f.btnReturn, step === 'skill' || step === 'check');
  for (const r of t.view('@hideInEntrance').gos ?? []) t.show(r, step !== 'confirm' && step !== 'start');
}

/**
 * The top bar's countdown: hidden without one; its number and progress; its warning look, the warning clip once on
 * entering it. Returns whether it warns now.
 * @param {Part} t @param {Record<string, any>} f @param {{ left: number, total: number, warn: boolean } | null} cd @param {boolean} was
 */
function countdownTick(t, f, cd, was) {
  t.show(f.cdState, !!cd);
  if (!cd) return false;
  setSwitch(t, f.cdState, cd.warn);
  for (const r of f.cdNums ?? []) t.text(r, String(Math.ceil(cd.left / 1000)));
  for (const r of f.cdPrgs ?? []) { const s = t.node(r); if (s) s.fill = cd.total > 0 ? cd.left / cd.total : 0; }
  if (cd.warn && !was) void t.anim(f.emergencyAnim);
  return cd.warn;
}

/** The side view's taps: leaving, 请离房间. @param {Part} s @param {Record<string, any>} f @param {StepCtx} X */
function wireSide(s, f, X) {
  s.tap(f.backBtnRect ?? '@full_panel_bg/btn_exit/hot_spot', X.leave);
  s.tap('@full_panel_bg/group_player_top/btn_kick/layout/kick_img/hotspot', X.kick);
  s.showAll(f.chatObjs, false);
  s.showAll(f.chatNewPoints, false);
  s.show('@full_panel_bg/group_player_top/info_toggle/group_wating/group_avatar/panel_invite', false);
}

/**
 * The two players (页面-6): the mate above, this player below — names, the style once the room shows it, the confirm
 * marks while the stage is confirmed, the mate offline, 请离房间 for the owner in 项目调整; the full view until the
 * coordination, the small one after.
 * @param {Part} s @param {Record<string, any>} f @param {any} S @param {StepCtx} X
 */
function sideUpdate(s, f, S, X) {
  const v = S.view, me = v.you, mate = 1 - me, other = v.members[mate] ?? null, small = v.phase !== 'setup';
  setSwitch(s, f.tinyToggle ?? '@', small);
  setSwitch(s, f.topPlayerToggle, !!other);
  for (const [g, i] of /** @type {[any, number][]} */ ([[f.topPlayerGroup, mate], [f.botPlayerGroup, me]])) if (g) player(s, g, v, i, X);
  s.showAll(f.charPickObjs, v.styles?.some((/** @type {string} */ x) => x));
  s.showAll(f.stageCheckObjs, false);
  s.show(f.kickBtnObj, me === 0 && v.phase === 'setup' && !!other);
  s.show(f.partnerOfflineObj, !!other && !other.online);
  setSwitch(s, f.lastStepBtnToggle, false);
  s.text(f.pingTxt, '');
}

/**
 * One player's group of the side view: its name (no title or level: the platform has none), its style once shown, its
 * ready mark — the guest prepared in 项目调整, confirmed in 项目确认, ready in the lineup.
 * @param {Part} s @param {Record<string, any>} g @param {any} v @param {number} i @param {StepCtx} X
 */
function player(s, g, v, i, X) {
  s.text(g.playerNameTxt, v.members[i]?.name ?? '');
  s.text(g.playerTitleTxt, '');
  s.show(g.playerLvTxt ? g.playerLvTxt.replace(/\/text_playerlevel$/, '') : null, false);
  const style = v.styles?.[i] ?? '', url = style ? X.styleIcon(style, '_tiny') : null;
  s.picture(g.effectImg, url);
  s.picture(g.effectTinyImg, url);
  s.show(g.effectTinyImg, !!url);
  s.show(g.avatarContainer, false);
  /** @type {Record<string, boolean>} */
  const ready = { setup: i === 1 && v.prepared, confirm: !!v.confirmed[i], lineup: !!v.ready[i] };
  s.show(g.readyAnim?.animationWrapper, ready[v.phase] ?? false);
}

/**
 * The banner of a new phase (页面-6): first or second pick, no coordination needed, the lineup; it comes in, stays a
 * moment, goes.
 * @param {Part} page @param {'first' | 'second' | 'skip' | 'lineup'} kind
 */
async function banner(page, kind) {
  const f = page.view(`${MAIN}/banner_view`), b = `${MAIN}/banner_view`;
  page.show(b, true);
  setSwitch(page, f.blackToggle, kind === 'second');
  page.show(f.firstNode, kind === 'first');
  page.show(f.noCharPickNode, kind === 'skip');
  page.show(f.squadNode, kind === 'lineup');
  await page.anim(f.animIn);
  await new Promise((done) => { setTimeout(done, 900); });
  await page.anim(f.animOut);
  page.show(b, false);
}
